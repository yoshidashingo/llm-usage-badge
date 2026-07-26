export type UsageSnapshot = {
  provider: "claude" | "codex" | "grok";
  status: "ok" | "unauthenticated" | "error";
  windows: { label: string; usedPct: number; resetAt?: string }[];
  fetchedAt: string;
};

export interface UsageAdapter {
  fetchUsage(): Promise<UsageSnapshot>;
}
