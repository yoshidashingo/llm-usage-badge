import type { UsageAdapter, UsageSnapshot } from "./types";

// COMMUNITY-VERIFIED (Greasy Fork Grok+): endpoint, body, and response shape.
// UNVERIFIED: modelName may need adjustment ("grok-3" seen; we send "grok-4").
const GROK_API = {
  rateLimitsUrl: "https://grok.com/rest/rate-limits",
  request: {
    method: "POST",
    credentials: "include",
    contentTypeHeader: "Content-Type",
    contentType: "application/json",
    body: {
      requestKind: "DEFAULT",
      modelName: "grok-4",
    },
  },
  schema: {
    windowSizeSeconds: "windowSizeSeconds",
    remainingQueries: "remainingQueries",
    totalQueries: "totalQueries",
  },
} as const;

type UsageWindow = UsageSnapshot["windows"][number];
type SnapshotStatus = UsageSnapshot["status"];

function snapshot(status: SnapshotStatus, windows: UsageWindow[] = []): UsageSnapshot {
  return {
    provider: "grok",
    status,
    windows,
    fetchedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function windowLabel(windowSizeSeconds: number): string | undefined {
  if (!Number.isInteger(windowSizeSeconds) || windowSizeSeconds <= 0) {
    return undefined;
  }

  if (windowSizeSeconds % 3600 === 0) {
    return `${windowSizeSeconds / 3600}h`;
  }
  if (windowSizeSeconds % 60 === 0) {
    return `${windowSizeSeconds / 60}m`;
  }

  return `${windowSizeSeconds}s`;
}

function normalizeUsage(value: unknown): UsageWindow[] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const windowSizeSeconds = value[GROK_API.schema.windowSizeSeconds];
  const remainingQueries = value[GROK_API.schema.remainingQueries];
  const totalQueries = value[GROK_API.schema.totalQueries];

  if (
    typeof windowSizeSeconds !== "number" ||
    !isNonNegativeInteger(remainingQueries) ||
    !isNonNegativeInteger(totalQueries) ||
    totalQueries === 0 ||
    remainingQueries > totalQueries
  ) {
    return undefined;
  }

  const durationLabel = windowLabel(windowSizeSeconds);
  if (durationLabel === undefined) {
    return undefined;
  }

  return [
    {
      label: `${durationLabel} 残り${remainingQueries}/${totalQueries}`,
      usedPct: Math.round(
        ((totalQueries - remainingQueries) / totalQueries) * 100,
      ),
    },
  ];
}

function isAuthenticationFailure(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

async function getRateLimits(): Promise<Response> {
  return fetch(GROK_API.rateLimitsUrl, {
    method: GROK_API.request.method,
    credentials: GROK_API.request.credentials,
    headers: {
      [GROK_API.request.contentTypeHeader]: GROK_API.request.contentType,
    },
    body: JSON.stringify(GROK_API.request.body),
  });
}

export const grokAdapter: UsageAdapter = {
  async fetchUsage(): Promise<UsageSnapshot> {
    try {
      const response = await getRateLimits();
      if (isAuthenticationFailure(response)) {
        return snapshot("unauthenticated");
      }
      if (!response.ok) {
        return snapshot("error");
      }

      const windows = normalizeUsage(await response.json());
      return windows === undefined
        ? snapshot("error")
        : snapshot("ok", windows);
    } catch {
      return snapshot("error");
    }
  },
};
