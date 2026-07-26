import { describe, expect, it } from "vitest";
import type { UsageSnapshot } from "../src/adapters/types";
import { badgeForSnapshots } from "../src/badge";
import type { UsageSnapshots } from "../src/storage";

const GREEN = "#1a7f37";
const YELLOW = "#bf8700";
const RED = "#cf222e";

function snapshot(
  provider: UsageSnapshot["provider"],
  status: UsageSnapshot["status"],
  usedPercentages: number[],
): UsageSnapshot {
  return {
    provider,
    status,
    windows: usedPercentages.map((usedPct, index) => ({
      label: `Window ${index + 1}`,
      usedPct,
    })),
    fetchedAt: "2026-07-27T00:00:00.000Z",
  };
}

function snapshots(...values: UsageSnapshot[]): UsageSnapshots {
  return Object.fromEntries(
    values.map((value) => [value.provider, value]),
  );
}

describe("badgeForSnapshots", () => {
  it("selects the minimum remaining percentage across providers and windows", () => {
    const result = badgeForSnapshots(
      snapshots(
        snapshot("claude", "ok", [10, 22]),
        snapshot("codex", "ok", [35, 5]),
        snapshot("grok", "ok", [15]),
      ),
    );

    expect(result).toEqual({ text: "65", color: GREEN });
  });

  it.each([
    { remaining: 51, color: GREEN },
    { remaining: 50, color: YELLOW },
    { remaining: 20, color: YELLOW },
    { remaining: 19, color: RED },
  ])(
    "uses $color when remaining is $remaining percent",
    ({ remaining, color }) => {
      const result = badgeForSnapshots(
        snapshots(snapshot("claude", "ok", [100 - remaining])),
      );

      expect(result).toEqual({ text: String(remaining), color });
    },
  );

  it("shows a red exclamation mark when all providers failed", () => {
    const result = badgeForSnapshots(
      snapshots(
        snapshot("claude", "error", []),
        snapshot("codex", "unauthenticated", []),
        snapshot("grok", "error", []),
      ),
    );

    expect(result).toEqual({ text: "!", color: RED });
  });

  it("uses only ok providers when statuses are mixed", () => {
    const result = badgeForSnapshots(
      snapshots(
        snapshot("claude", "ok", [30]),
        snapshot("codex", "error", [99]),
        snapshot("grok", "unauthenticated", [100]),
      ),
    );

    expect(result).toEqual({ text: "70", color: GREEN });
  });
});
