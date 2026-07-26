import { claudeAdapter } from "./adapters/claude";
import { codexAdapter } from "./adapters/codex";
import { grokAdapter } from "./adapters/grok";
import { badgeForSnapshots } from "./badge";
import {
  getAllSnapshots,
  upsertSnapshot,
  type UsageSnapshots,
} from "./storage";

const REFRESH_ALARM = "refresh-usage";
const REFRESH_PERIOD_MINUTES = 30;
const MAX_INITIAL_JITTER_MINUTES = 5;
const MANUAL_REFRESH_THROTTLE_MS = 10_000;
const adapters = [claudeAdapter, codexAdapter, grokAdapter];

let lastManualRefreshAt = 0;

function scheduleRefresh(): void {
  chrome.alarms.create(REFRESH_ALARM, {
    delayInMinutes: Math.random() * MAX_INITIAL_JITTER_MINUTES,
    periodInMinutes: REFRESH_PERIOD_MINUTES,
  });
}

async function updateBadge(snapshots: UsageSnapshots): Promise<void> {
  const badge = badgeForSnapshots(snapshots);

  await Promise.all([
    chrome.action.setBadgeText({ text: badge.text }),
    chrome.action.setBadgeBackgroundColor({ color: badge.color }),
  ]);
}

async function refreshUsage(): Promise<UsageSnapshots> {
  const results = await Promise.allSettled(
    adapters.map((adapter) => adapter.fetchUsage()),
  );

  await Promise.all(
    results
      .filter((result) => result.status === "fulfilled")
      .map((result) => upsertSnapshot(result.value)),
  );

  const snapshots = await getAllSnapshots();
  await updateBadge(snapshots);

  return snapshots;
}

function logRefreshError(error: unknown): void {
  console.error("Failed to refresh LLM usage.", error);
}

function initialize(): void {
  scheduleRefresh();
  void refreshUsage().catch(logRefreshError);
}

async function handleManualRefresh(): Promise<UsageSnapshots> {
  const now = Date.now();

  if (now - lastManualRefreshAt < MANUAL_REFRESH_THROTTLE_MS) {
    return getAllSnapshots();
  }

  lastManualRefreshAt = now;
  return refreshUsage();
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === REFRESH_ALARM) {
    void refreshUsage().catch(logRefreshError);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (
    typeof message !== "object" ||
    message === null ||
    message.type !== "refresh"
  ) {
    return undefined;
  }

  void handleManualRefresh()
    .then(sendResponse)
    .catch(async (error: unknown) => {
      logRefreshError(error);
      sendResponse(await getAllSnapshots());
    });

  return true;
});
