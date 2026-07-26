import type { UsageSnapshot } from "../adapters/types";
import type { UsageSnapshots } from "../storage";

type Provider = UsageSnapshot["provider"];

export type UsageBand = "green" | "yellow" | "red";

export type UsageRowModel = {
  label: string;
  usedPct: number;
  percentText: string;
  resetText?: string;
  band: UsageBand;
};

type ProviderModelBase = {
  provider: Provider;
  name: string;
};

export type ProviderModel =
  | (ProviderModelBase & {
      status: "ok";
      rows: UsageRowModel[];
    })
  | (ProviderModelBase & {
      status: "unauthenticated";
      message: "未ログイン";
      loginUrl: string;
    })
  | (ProviderModelBase & {
      status: "error";
      message: "取得失敗";
      lastSuccessText?: string;
    })
  | (ProviderModelBase & {
      status: "missing";
      message: "未取得";
    });

const PROVIDERS: Provider[] = ["claude", "codex", "grok"];

const PROVIDER_NAMES: Record<Provider, string> = {
  claude: "Claude",
  codex: "Codex",
  grok: "Grok",
};

const LOGIN_URLS: Record<Provider, string> = {
  claude: "https://claude.ai/login",
  codex: "https://chatgpt.com/auth/login",
  grok: "https://accounts.x.ai/sign-in",
};

const TIME_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("ja-JP", {
  weekday: "short",
});

function isSameLocalDate(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatResetTime(resetAt: string, now: Date): string | undefined {
  const reset = new Date(resetAt);

  if (Number.isNaN(reset.getTime())) {
    return undefined;
  }

  const time = TIME_FORMATTER.format(reset);

  return isSameLocalDate(reset, now)
    ? time
    : `${WEEKDAY_FORMATTER.format(reset)} ${time}`;
}

function formatRelativeTime(
  timestamp: string | undefined,
  now: Date,
): string | undefined {
  if (timestamp === undefined) {
    return undefined;
  }

  const then = new Date(timestamp);

  if (Number.isNaN(then.getTime())) {
    return undefined;
  }

  const elapsedMs = Math.max(0, now.getTime() - then.getTime());
  const minutes = Math.floor(elapsedMs / 60_000);

  if (minutes < 60) {
    return `最終成功: ${minutes}分前`;
  }

  const hours = Math.floor(elapsedMs / 3_600_000);

  if (hours < 24) {
    return `最終成功: ${hours}時間前`;
  }

  return `最終成功: ${Math.floor(elapsedMs / 86_400_000)}日前`;
}

function usageBand(usedPct: number): UsageBand {
  if (usedPct >= 81) {
    return "red";
  }

  if (usedPct >= 50) {
    return "yellow";
  }

  return "green";
}

function rowModel(
  window: UsageSnapshot["windows"][number],
  now: Date,
): UsageRowModel {
  const usedPct = Math.min(100, Math.max(0, window.usedPct));
  const resetText =
    window.resetAt === undefined
      ? undefined
      : formatResetTime(window.resetAt, now);
  const row: UsageRowModel = {
    label: window.label,
    usedPct,
    percentText: `${Math.round(usedPct)}%`,
    band: usageBand(usedPct),
  };

  return resetText === undefined ? row : { ...row, resetText };
}

function providerModel(
  provider: Provider,
  snapshots: UsageSnapshots,
  now: Date,
): ProviderModel {
  const base: ProviderModelBase = {
    provider,
    name: PROVIDER_NAMES[provider],
  };
  const snapshot = snapshots[provider];

  if (snapshot === undefined) {
    return { ...base, status: "missing", message: "未取得" };
  }

  if (snapshot.status === "ok") {
    return {
      ...base,
      status: "ok",
      rows: snapshot.windows.map((window) => rowModel(window, now)),
    };
  }

  if (snapshot.status === "unauthenticated") {
    return {
      ...base,
      status: "unauthenticated",
      message: "未ログイン",
      loginUrl: LOGIN_URLS[provider],
    };
  }

  const lastSuccessText = formatRelativeTime(
    snapshot.lastSuccessfulFetchAt,
    now,
  );
  const model: ProviderModel = {
    ...base,
    status: "error",
    message: "取得失敗",
  };

  return lastSuccessText === undefined
    ? model
    : { ...model, lastSuccessText };
}

export function createProviderModels(
  snapshots: UsageSnapshots,
  now: Date,
): ProviderModel[] {
  return PROVIDERS.map((provider) =>
    providerModel(provider, snapshots, now),
  );
}
