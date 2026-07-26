import type { UsageSnapshots } from "./storage";

export type Badge = {
  text: string;
  color: string;
};

const GREEN = "#1a7f37";
const YELLOW = "#bf8700";
const RED = "#cf222e";

export function badgeForSnapshots(snapshots: UsageSnapshots): Badge {
  const remainingPercentages = Object.values(snapshots)
    .filter((snapshot) => snapshot?.status === "ok")
    .flatMap((snapshot) =>
      snapshot?.windows.map((window) => 100 - window.usedPct) ?? [],
    );

  if (remainingPercentages.length === 0) {
    return { text: "!", color: RED };
  }

  const minimumRemaining = Math.min(...remainingPercentages);
  const color =
    minimumRemaining > 50
      ? GREEN
      : minimumRemaining >= 20
        ? YELLOW
        : RED;

  return {
    text: String(minimumRemaining),
    color,
  };
}
