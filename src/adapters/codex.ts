import type { UsageAdapter, UsageSnapshot } from "./types";

// VERIFIED 2026-07-27: CodexBar documents the usage URL below.
// UNVERIFIED: The usage response's inner field names remain provisional.
const CODEX_API = {
  sessionUrl: "https://chatgpt.com/api/auth/session",
  usageUrl: "https://chatgpt.com/backend-api/wham/usage",
  schema: {
    accessToken: "accessToken",
    rateLimit: "rate_limit",
    primary: {
      field: "primary_window",
      label: "5h",
    },
    secondary: {
      field: "secondary_window",
      label: "Week",
    },
    usedPercent: [
      "used_percent",
      "usage_percent",
      "utilization",
    ],
    resetsAt: ["resets_at", "reset_at", "resets_after"],
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

  const date = new Date(timestamp);
  return Number.isFinite(date.getTime())
    ? date.toISOString()
    : undefined;
}

function windowUsedPercentage(
  value: Record<string, unknown>,
): number | undefined {
  for (const field of CODEX_API.schema.usedPercent) {
    const usedPct = usedPercentage(value[field]);
    if (usedPct !== undefined) {
      return usedPct;
    }
  }

  return undefined;
}

function windowResetAt(
  value: Record<string, unknown>,
): string | null | undefined {
  let hasInvalidReset = false;

  for (const field of CODEX_API.schema.resetsAt) {
    const resetValue = value[field];
    if (resetValue === undefined || resetValue === null) {
      continue;
    }

    const resetAt = isoResetAt(resetValue);
    if (resetAt !== undefined) {
      return resetAt;
    }
    hasInvalidReset = true;
  }

  return hasInvalidReset ? null : undefined;
}

function normalizeWindow(
  value: unknown,
  label: UsageWindow["label"],
): UsageWindow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const usedPct = windowUsedPercentage(value);
  if (usedPct === undefined) {
    return undefined;
  }

  const resetAt = windowResetAt(value);
  if (resetAt === undefined) {
    return { label, usedPct };
  }

  return resetAt === null ? undefined : { label, usedPct, resetAt };
}

function normalizeUsage(value: unknown): UsageWindow[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const rateLimit = value[CODEX_API.schema.rateLimit];
  if (!isRecord(rateLimit)) {
    return undefined;
  }

  const primary = normalizeWindow(
    rateLimit[CODEX_API.schema.primary.field],
    CODEX_API.schema.primary.label,
  );
  const secondary = normalizeWindow(
    rateLimit[CODEX_API.schema.secondary.field],
    CODEX_API.schema.secondary.label,
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
