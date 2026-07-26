import { beforeEach, describe, expect, it } from "vitest";
import type { UsageSnapshot } from "../src/adapters/types";
import {
  getAllSnapshots,
  upsertSnapshot,
} from "../src/storage";

type StorageContents = Record<string, unknown>;

function installInMemoryStorage(): void {
  const contents: StorageContents = {};

  const local = {
    async get(
      keys?: string | string[] | Record<string, unknown> | null,
    ): Promise<StorageContents> {
      if (keys === undefined || keys === null) {
        return { ...contents };
      }

      if (typeof keys === "string") {
        return keys in contents ? { [keys]: contents[keys] } : {};
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(
          keys
            .filter((key) => key in contents)
            .map((key) => [key, contents[key]]),
        );
      }

      return Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [
          key,
          key in contents ? contents[key] : fallback,
        ]),
      );
    },
    async set(items: StorageContents): Promise<void> {
      Object.assign(contents, items);
    },
  };

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: { storage: { local } },
  });
}

function snapshot(
  provider: UsageSnapshot["provider"],
  status: UsageSnapshot["status"],
  fetchedAt: string,
): UsageSnapshot {
  return {
    provider,
    status,
    windows: [{ label: "5 hours", usedPct: 42 }],
    fetchedAt,
  };
}

describe("storage", () => {
  beforeEach(() => {
    installInMemoryStorage();
  });

  it("returns no snapshots when storage is empty", async () => {
    await expect(getAllSnapshots()).resolves.toEqual({});
  });

  it("upserts snapshots independently by provider", async () => {
    const claude = snapshot(
      "claude",
      "ok",
      "2026-07-27T01:00:00.000Z",
    );
    const codex = snapshot(
      "codex",
      "ok",
      "2026-07-27T02:00:00.000Z",
    );

    await Promise.all([
      upsertSnapshot(claude),
      upsertSnapshot(codex),
    ]);

    await expect(getAllSnapshots()).resolves.toEqual({
      claude: {
        ...claude,
        lastSuccessfulFetchAt: claude.fetchedAt,
      },
      codex: {
        ...codex,
        lastSuccessfulFetchAt: codex.fetchedAt,
      },
    });
  });

  it.each(["error", "unauthenticated"] as const)(
    "preserves the last successful fetch time for %s snapshots",
    async (status) => {
      const successful = snapshot(
        "grok",
        "ok",
        "2026-07-27T03:00:00.000Z",
      );
      const unsuccessful = snapshot(
        "grok",
        status,
        "2026-07-27T04:00:00.000Z",
      );

      await upsertSnapshot(successful);
      await upsertSnapshot(unsuccessful);

      await expect(getAllSnapshots()).resolves.toEqual({
        grok: {
          ...unsuccessful,
          lastSuccessfulFetchAt: successful.fetchedAt,
        },
      });
    },
  );

  it("does not invent a last successful time before a success", async () => {
    const failed = snapshot(
      "claude",
      "error",
      "2026-07-27T05:00:00.000Z",
    );

    await upsertSnapshot(failed);

    await expect(getAllSnapshots()).resolves.toEqual({
      claude: failed,
    });
  });
});
