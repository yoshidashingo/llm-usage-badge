import { describe, expect, it } from "vitest";
import type { UsageSnapshot } from "../src/adapters/types";
import { createProviderModels } from "../src/popup/render";
import type {
  StoredUsageSnapshot,
  UsageSnapshots,
} from "../src/storage";

const FETCHED_AT = "2026-07-27T00:00:00.000Z";

function snapshot(
  provider: UsageSnapshot["provider"],
  status: UsageSnapshot["status"],
  overrides: Partial<StoredUsageSnapshot> = {},
): StoredUsageSnapshot {
  return {
    provider,
    status,
    windows: [],
    fetchedAt: FETCHED_AT,
    ...overrides,
  };
}

describe("createProviderModels", () => {
  it("creates ok row models with percentage and reset strings", () => {
    const now = new Date(2026, 6, 27, 9, 0);
    const snapshots: UsageSnapshots = {
      claude: snapshot("claude", "ok", {
        windows: [
          {
            label: "5時間",
            usedPct: 42.4,
            resetAt: new Date(2026, 6, 27, 10, 30).toISOString(),
          },
          {
            label: "週間",
            usedPct: 81,
            resetAt: new Date(2026, 6, 28, 8, 5).toISOString(),
          },
        ],
      }),
    };

    expect(createProviderModels(snapshots, now)[0]).toEqual({
      provider: "claude",
      name: "Claude",
      status: "ok",
      rows: [
        {
          label: "5時間",
          usedPct: 42.4,
          percentText: "42%",
          resetText: "10:30",
          band: "green",
        },
        {
          label: "週間",
          usedPct: 81,
          percentText: "81%",
          resetText: "火 08:05",
          band: "red",
        },
      ],
    });
  });

  it.each([
    ["claude", "https://claude.ai/login"],
    ["codex", "https://chatgpt.com/auth/login"],
    ["grok", "https://accounts.x.ai/sign-in"],
  ] as const)(
    "creates an unauthenticated model for %s",
    (provider, loginUrl) => {
      const models = createProviderModels(
        { [provider]: snapshot(provider, "unauthenticated") },
        new Date(2026, 6, 27, 9, 0),
      );
      const model = models.find((value) => value.provider === provider);

      expect(model).toEqual({
        provider,
        name:
          provider === "claude"
            ? "Claude"
            : provider === "codex"
              ? "Codex"
              : "Grok",
        status: "unauthenticated",
        message: "未ログイン",
        loginUrl,
      });
    },
  );

  it.each([
    [45 * 60_000, "最終成功: 45分前"],
    [3 * 3_600_000, "最終成功: 3時間前"],
    [2 * 86_400_000, "最終成功: 2日前"],
  ])(
    "formats an error model relative time for %i elapsed milliseconds",
    (elapsedMs, lastSuccessText) => {
      const now = new Date(2026, 6, 27, 12, 0);
      const lastSuccessfulFetchAt = new Date(
        now.getTime() - elapsedMs,
      ).toISOString();
      const models = createProviderModels(
        {
          codex: snapshot("codex", "error", {
            lastSuccessfulFetchAt,
          }),
        },
        now,
      );

      expect(models[1]).toEqual({
        provider: "codex",
        name: "Codex",
        status: "error",
        message: "取得失敗",
        lastSuccessText,
      });
    },
  );

  it("creates missing models in the fixed provider order", () => {
    expect(
      createProviderModels({}, new Date(2026, 6, 27, 9, 0)),
    ).toEqual([
      {
        provider: "claude",
        name: "Claude",
        status: "missing",
        message: "未取得",
      },
      {
        provider: "codex",
        name: "Codex",
        status: "missing",
        message: "未取得",
      },
      {
        provider: "grok",
        name: "Grok",
        status: "missing",
        message: "未取得",
      },
    ]);
  });
});
