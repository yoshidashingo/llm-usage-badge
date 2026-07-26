import { beforeEach, describe, expect, it } from "vitest";
import { codexAdapter } from "../src/adapters/codex";
import healthyUsage from "./fixtures/codex-usage-healthy.json";
import schemaMismatchUsage from "./fixtures/codex-usage-schema-mismatch.json";

const SESSION_URL = "https://chatgpt.com/api/auth/session";
const USAGE_URL = "https://chatgpt.com/backend-api/codex/usage";
const ACCESS_TOKEN = "test-access-token";

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

describe("codexAdapter", () => {
  beforeEach(() => {
    installFetch(async () => {
      throw new Error("Unexpected fetch");
    });
  });

  it("normalizes healthy 5-hour and weekly usage and sends the Bearer token", async () => {
    const calls: FetchCall[] = [];

    installFetch(async (input, init) => {
      calls.push({ input, init });

      if (String(input) === SESSION_URL) {
        return jsonResponse({ accessToken: ACCESS_TOKEN });
      }
      if (String(input) === USAGE_URL) {
        return jsonResponse(healthyUsage);
      }

      throw new Error(`Unexpected URL: ${String(input)}`);
    });

    const result = await codexAdapter.fetchUsage();

    expect(result).toMatchObject({
      provider: "codex",
      status: "ok",
      windows: [
        {
          label: "5h",
          usedPct: 42,
          resetAt: "2026-07-27T08:00:00.000Z",
        },
        {
          label: "Week",
          usedPct: 100,
          resetAt: "2026-08-02T00:00:00.000Z",
        },
      ],
    });
    expect(Date.parse(result.fetchedAt)).not.toBeNaN();
    expect(calls).toEqual([
      {
        input: SESSION_URL,
        init: { method: "GET", credentials: "include" },
      },
      {
        input: USAGE_URL,
        init: {
          method: "GET",
          credentials: "include",
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
        },
      },
    ]);
  });

  it("returns unauthenticated for a session 401", async () => {
    let fetchCount = 0;
    installFetch(async () => {
      fetchCount += 1;
      return new Response(null, { status: 401 });
    });

    await expect(codexAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "codex",
      status: "unauthenticated",
      windows: [],
    });
    expect(fetchCount).toBe(1);
  });

  it("returns unauthenticated when the session has no access token", async () => {
    let fetchCount = 0;
    installFetch(async () => {
      fetchCount += 1;
      return jsonResponse({});
    });

    await expect(codexAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "codex",
      status: "unauthenticated",
      windows: [],
    });
    expect(fetchCount).toBe(1);
  });

  it("returns unauthenticated for a usage 401", async () => {
    installFetch(async (input) =>
      String(input) === SESSION_URL
        ? jsonResponse({ accessToken: ACCESS_TOKEN })
        : new Response(null, { status: 401 }),
    );

    await expect(codexAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "codex",
      status: "unauthenticated",
      windows: [],
    });
  });

  it("returns error for a schema-mismatch response", async () => {
    installFetch(async (input) =>
      String(input) === SESSION_URL
        ? jsonResponse({ accessToken: ACCESS_TOKEN })
        : jsonResponse(schemaMismatchUsage),
    );

    await expect(codexAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "codex",
      status: "error",
      windows: [],
    });
  });

  it("returns error when fetch rejects", async () => {
    installFetch(async () => {
      throw new TypeError("Network unavailable");
    });

    await expect(codexAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "codex",
      status: "error",
      windows: [],
    });
  });
});
