import { beforeEach, describe, expect, it } from "vitest";
import { claudeAdapter } from "../src/adapters/claude";
import healthyUsage from "./fixtures/claude-usage-healthy.json";
import schemaMismatchUsage from "./fixtures/claude-usage-schema-mismatch.json";

const ORGANIZATIONS_URL = "https://claude.ai/api/organizations";
const USAGE_URL =
  "https://claude.ai/api/organizations/org-first/usage";
const ORGANIZATIONS = [
  { uuid: "org-first" },
  { uuid: "org-second" },
];

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

describe("claudeAdapter", () => {
  beforeEach(() => {
    installFetch(async () => {
      throw new Error("Unexpected fetch");
    });
  });

  it("uses the first organization and normalizes healthy usage", async () => {
    const calls: FetchCall[] = [];

    installFetch(async (input, init) => {
      calls.push({ input, init });

      if (String(input) === ORGANIZATIONS_URL) {
        return jsonResponse(ORGANIZATIONS);
      }
      if (String(input) === USAGE_URL) {
        return jsonResponse(healthyUsage);
      }

      throw new Error(`Unexpected URL: ${String(input)}`);
    });

    const result = await claudeAdapter.fetchUsage();

    expect(result).toMatchObject({
      provider: "claude",
      status: "ok",
      windows: [
        {
          label: "5h",
          usedPct: 42,
          resetAt: "2026-07-27T08:00:00.000Z",
        },
        {
          label: "Week",
          usedPct: 73,
          resetAt: "2026-08-02T00:00:00.000Z",
        },
      ],
    });
    expect(Date.parse(result.fetchedAt)).not.toBeNaN();
    expect(calls).toEqual([
      {
        input: ORGANIZATIONS_URL,
        init: { method: "GET", credentials: "include" },
      },
      {
        input: USAGE_URL,
        init: { method: "GET", credentials: "include" },
      },
    ]);
  });

  it("returns unauthenticated for a 401 response", async () => {
    installFetch(async (input) => {
      if (String(input) === ORGANIZATIONS_URL) {
        return jsonResponse(ORGANIZATIONS);
      }
      return new Response(null, { status: 401 });
    });

    await expect(claudeAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "claude",
      status: "unauthenticated",
      windows: [],
    });
  });

  it("returns unauthenticated for an organization-side 403", async () => {
    let fetchCount = 0;
    installFetch(async () => {
      fetchCount += 1;
      return new Response(null, { status: 403 });
    });

    await expect(claudeAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "claude",
      status: "unauthenticated",
      windows: [],
    });
    expect(fetchCount).toBe(1);
  });

  it("returns unauthenticated when redirected to login", async () => {
    let fetchCount = 0;
    installFetch(async () => {
      fetchCount += 1;
      const response = new Response("<html>Login</html>");
      Object.defineProperties(response, {
        redirected: { value: true },
        url: { value: "https://claude.ai/login?returnTo=%2F" },
      });
      return response;
    });

    await expect(claudeAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "claude",
      status: "unauthenticated",
      windows: [],
    });
    expect(fetchCount).toBe(1);
  });

  it("falls back to the first organization's id", async () => {
    const calls: string[] = [];
    installFetch(async (input) => {
      calls.push(String(input));

      if (String(input) === ORGANIZATIONS_URL) {
        return jsonResponse([
          { uuid: " ", id: "org-by-id" },
          { uuid: "org-second" },
        ]);
      }
      if (
        String(input) ===
        "https://claude.ai/api/organizations/org-by-id/usage"
      ) {
        return jsonResponse(healthyUsage);
      }

      throw new Error(`Unexpected URL: ${String(input)}`);
    });

    await expect(claudeAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "claude",
      status: "ok",
    });
    expect(calls).toEqual([
      ORGANIZATIONS_URL,
      "https://claude.ai/api/organizations/org-by-id/usage",
    ]);
  });

  it("returns error when no organization has a usable identifier", async () => {
    const calls: string[] = [];
    installFetch(async (input) => {
      calls.push(String(input));
      return jsonResponse([null, {}, { uuid: " ", id: "" }]);
    });

    await expect(claudeAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "claude",
      status: "error",
      windows: [],
    });
    expect(calls).toEqual([ORGANIZATIONS_URL]);
  });

  it("returns error for a schema-mismatch response", async () => {
    installFetch(async (input) =>
      String(input) === ORGANIZATIONS_URL
        ? jsonResponse(ORGANIZATIONS)
        : jsonResponse(schemaMismatchUsage),
    );

    await expect(claudeAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "claude",
      status: "error",
      windows: [],
    });
  });

  it("returns error when fetch rejects", async () => {
    installFetch(async () => {
      throw new TypeError("Network unavailable");
    });

    await expect(claudeAdapter.fetchUsage()).resolves.toMatchObject({
      provider: "claude",
      status: "error",
      windows: [],
    });
  });
});
