import { beforeEach, describe, expect, it } from "vitest";
import { grokAdapter } from "../src/adapters/grok";
import healthyRateLimits from "./fixtures/grok-rate-limits-healthy.json";
import schemaMismatchRateLimits from "./fixtures/grok-rate-limits-schema-mismatch.json";
import zeroTotalRateLimits from "./fixtures/grok-rate-limits-zero-total.json";

const RATE_LIMITS_URL = "https://grok.com/rest/rate-limits";

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

function jsonResponse(
  body: unknown,
  init?: ResponseInit,
): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(
  stub: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>,
): void {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: stub,
  });
}

describe("grokAdapter", () => {
  beforeEach(() => {
    installFetch(async () => {
      throw new Error("Unexpected fetch");
    });
  });

  it("normalizes healthy query limits and sends the expected POST request", async () => {
    const calls: FetchCall[] = [];

    installFetch(async (input, init) => {
      calls.push({ input, init });
      return jsonResponse(healthyRateLimits);
    });

    const result = await grokAdapter.fetchUsage();

    expect(result).toMatchObject({
      provider: "grok",
      status: "ok",
      windows: [
        {
          label: "2h 残り42/80",
          usedPct: 48,
        },
      ],
    });
    expect(result.windows[0]?.label).toContain("42/80");
    expect(result.windows[0]).not.toHaveProperty("resetAt");
    expect(Date.parse(result.fetchedAt)).not.toBeNaN();
    expect(calls).toEqual([
      {
        input: RATE_LIMITS_URL,
        init: {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestKind: "DEFAULT",
            modelName: "grok-4",
          }),
        },
      },
    ]);
  });

  it("returns unauthenticated for a 401 response", async () => {
    installFetch(async () => new Response(null, { status: 401 }));

    await expect(grokAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "grok",
      status: "unauthenticated",
      windows: [],
    });
  });

  it("returns error when total queries is zero", async () => {
    installFetch(async () => jsonResponse(zeroTotalRateLimits));

    await expect(grokAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "grok",
      status: "error",
      windows: [],
    });
  });

  it("returns error for a schema-mismatch response", async () => {
    installFetch(async () => jsonResponse(schemaMismatchRateLimits));

    await expect(grokAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "grok",
      status: "error",
      windows: [],
    });
  });

  it("returns error when fetch rejects", async () => {
    installFetch(async () => {
      throw new TypeError("Network unavailable");
    });

    await expect(grokAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "grok",
      status: "error",
      windows: [],
    });
  });
});
