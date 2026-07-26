import type { UsageSnapshot } from "./adapters/types";

type Provider = UsageSnapshot["provider"];

export type StoredUsageSnapshot = UsageSnapshot & {
  lastSuccessfulFetchAt?: string;
};

export type UsageSnapshots = Partial<
  Record<Provider, StoredUsageSnapshot>
>;

const PROVIDERS: Provider[] = ["claude", "codex", "grok"];
const STORAGE_KEY_PREFIX = "usageSnapshot:";

type SnapshotStorageKey = `usageSnapshot:${Provider}`;
type SnapshotStorage = Partial<
  Record<SnapshotStorageKey, StoredUsageSnapshot>
>;

function storageKey(provider: Provider): SnapshotStorageKey {
  return `${STORAGE_KEY_PREFIX}${provider}`;
}

export async function getAllSnapshots(): Promise<UsageSnapshots> {
  const keys = PROVIDERS.map(storageKey);
  const stored = await chrome.storage.local.get<SnapshotStorage>(keys);
  const snapshots: UsageSnapshots = {};

  for (const provider of PROVIDERS) {
    const snapshot = stored[storageKey(provider)];

    if (snapshot) {
      snapshots[provider] = snapshot;
    }
  }

  return snapshots;
}

export async function upsertSnapshot(
  snapshot: UsageSnapshot,
): Promise<void> {
  const key = storageKey(snapshot.provider);
  const stored = await chrome.storage.local.get<SnapshotStorage>(key);
  const previous = stored[key];
  const lastSuccessfulFetchAt =
    snapshot.status === "ok"
      ? snapshot.fetchedAt
      : previous?.lastSuccessfulFetchAt;
  const next: StoredUsageSnapshot =
    lastSuccessfulFetchAt === undefined
      ? { ...snapshot }
      : { ...snapshot, lastSuccessfulFetchAt };
  const update: SnapshotStorage = { [key]: next };

  await chrome.storage.local.set<SnapshotStorage>(update);
}
