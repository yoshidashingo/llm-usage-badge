import type { UsageAdapter, UsageSnapshot } from "./types";

// UNVERIFIED: Issue #8 must validate these chatgpt.com internal API assumptions.
const CODEX_API = {
  sessionUrl: "https://chatgpt.com/api/auth/session",
  usageUrl: "https://chatgpt.com/backend-api/codex/usage",
  schema: {
    accessToken: "accessToken",
    rateLimits: "rate_limits",
    primary: {
      field: "primary",
      label: "5h",
      windowMinutes: 5 * 60,
    },
    secondary: {
      field: "secondary",
      label: "Week",
      windowMinutes: 7 * 24 * 60,
    },
    usedPercent: "used_percent",
    resetsAt: "resets_at",
    windowMinutes: "window_minutes",
  },
} as const;

type UsageWindow = UsageSnapshot["windows"][number];
type SnapshotStatus = UsageSnapshot["status"];

function snapshot(status: SnapshotStatus, windows: UsageWindow[] = []): UsageSnapshot {
  return {
    provider: "codex",
    status,
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function accessToken(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const token = value[CODEX_API.schema.accessToken];
  return typeof token === "string" && token.trim().length > 0
    ? token.trim()
    : undefined;
}

function usedPercentage(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function isoResetAt(value: unknown): string | undefined {
  let timestamp: number;

  if (typeof value === "number" && Number.isFinite(value)) {
    timestamp = value < 1_000_000_000_000 ? value * 1000 : value;
  } else if (typeof value === "string" && value.trim().length > 0) {
    timestamp = Date.parse(value);
  } else {
    return undefined;
  }

  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function normalizeWindow(
  value: unknown,
  label: UsageWindow["label"],
  expectedWindowMinutes: number,
): UsageWindow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const usedPct = usedPercentage(value[CODEX_API.schema.usedPercent]);
  if (usedPct === undefined) {
    return undefined;
  }

  const windowMinutes = value[CODEX_API.schema.windowMinutes];
  if (
    windowMinutes !== undefined &&
    (typeof windowMinutes !== "number" ||
      !Number.isFinite(windowMinutes) ||
      windowMinutes !== expectedWindowMinutes)
  ) {
    return undefined;
  }

  const resetValue = value[CODEX_API.schema.resetsAt];
  if (resetValue === undefined || resetValue === null) {
    return { label, usedPct };
  }

  const resetAt = isoResetAt(resetValue);
  return resetAt === undefined
    ? undefined
    : { label, usedPct, resetAt };
}

function normalizeUsage(value: unknown): UsageWindow[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const rateLimits = value[CODEX_API.schema.rateLimits];
  if (!isRecord(rateLimits)) {
    return undefined;
  }

  const primary = normalizeWindow(
    rateLimits[CODEX_API.schema.primary.field],
    CODEX_API.schema.primary.label,
    CODEX_API.schema.primary.windowMinutes,
  );
  const secondary = normalizeWindow(
    rateLimits[CODEX_API.schema.secondary.field],
    CODEX_API.schema.secondary.label,
    CODEX_API.schema.secondary.windowMinutes,
  );

  return primary === undefined || secondary === undefined
    ? undefined
    : [primary, secondary];
}

function isAuthenticationFailure(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

async function getSession(): Promise<Response> {
  return fetch(CODEX_API.sessionUrl, {
    method: "GET",
    credentials: "include",
  });
}

async function getUsage(token: string): Promise<Response> {
  return fetch(CODEX_API.usageUrl, {
    method: "GET",
    credentials: "include",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export const codexAdapter: UsageAdapter = {
  async fetchUsage(): Promise<UsageSnapshot> {
    try {
      const sessionResponse = await getSession();
      if (isAuthenticationFailure(sessionResponse)) {
        return snapshot("unauthenticated");
      }
      if (!sessionResponse.ok) {
        return snapshot("error");
      }

      const token = accessToken(await sessionResponse.json());
      if (token === undefined) {
        return snapshot("unauthenticated");
      }

      const usageResponse = await getUsage(token);
      if (isAuthenticationFailure(usageResponse)) {
        return snapshot("unauthenticated");
      }
      if (!usageResponse.ok) {
        return snapshot("error");
      }

      const windows = normalizeUsage(await usageResponse.json());
      return windows === undefined
        ? snapshot("error")
        : snapshot("ok", windows);
    } catch {
      return snapshot("error");
    }
  },
};
