import type { UsageAdapter, UsageSnapshot } from "./types";

// UNVERIFIED: Issue #8 must validate these claude.ai internal API assumptions.
const CLAUDE_API = {
  baseUrl: "https://claude.ai",
  organizationsPath: "/api/organizations",
  usagePath: (organizationUuid: string) =>
    `/api/organizations/${encodeURIComponent(organizationUuid)}/usage`,
} as const;

type UsageWindow = UsageSnapshot["windows"][number];
type SnapshotStatus = UsageSnapshot["status"];

function snapshot(status: SnapshotStatus, windows: UsageWindow[] = []): UsageSnapshot {
  return {
    provider: "claude",
    status,
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function organizationUuid(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  for (const organization of value) {
    if (!isRecord(organization)) {
      continue;
    }

    for (const field of ["uuid", "id"] as const) {
      const identifier = organization[field];
      if (
        typeof identifier === "string" &&
        identifier.trim().length > 0
      ) {
        return identifier;
      }
    }
  }

  return undefined;
}

function usedPercentage(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function isoResetAt(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function normalizeWindow(
  value: unknown,
  label: UsageWindow["label"],
): UsageWindow | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const usedPct = usedPercentage(value.utilization);
  if (usedPct === undefined) {
    return undefined;
  }

  if (value.resets_at === undefined || value.resets_at === null) {
    return { label, usedPct };
  }

  const resetAt = isoResetAt(value.resets_at);
  return resetAt === undefined
    ? undefined
    : { label, usedPct, resetAt };
}

function normalizeUsage(value: unknown): UsageWindow[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const fiveHour = normalizeWindow(value.five_hour, "5h");
  const week = normalizeWindow(value.seven_day, "Week");

  return fiveHour === undefined || week === undefined
    ? undefined
    : [fiveHour, week];
}

function isAuthenticationFailure(response: Response): boolean {
  if (response.status === 401 || response.status === 403) {
    return true;
  }

  if (!response.redirected) {
    return false;
  }

  try {
    const path = new URL(response.url).pathname;
    return path === "/login" || path.startsWith("/login/");
  } catch {
    return false;
  }
}

async function get(path: string): Promise<Response> {
  return fetch(`${CLAUDE_API.baseUrl}${path}`, {
    method: "GET",
    credentials: "include",
  });
}

export const claudeAdapter: UsageAdapter = {
  async fetchUsage(): Promise<UsageSnapshot> {
    try {
      const organizationsResponse = await get(
        CLAUDE_API.organizationsPath,
      );
      if (isAuthenticationFailure(organizationsResponse)) {
        return snapshot("unauthenticated");
      }
      if (!organizationsResponse.ok) {
        return snapshot("error");
      }

      const uuid = organizationUuid(
        await organizationsResponse.json(),
      );
      if (uuid === undefined) {
        return snapshot("error");
      }

      const usageResponse = await get(CLAUDE_API.usagePath(uuid));
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
