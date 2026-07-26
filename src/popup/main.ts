import "./style.css";
import {
  getAllSnapshots,
  type UsageSnapshots,
} from "../storage";
import {
  createProviderModels,
  type ProviderModel,
  type UsageRowModel,
} from "./render";

const providersElement =
  document.querySelector<HTMLElement>("[data-providers]");
const refreshButton =
  document.querySelector<HTMLButtonElement>("[data-refresh]");

let snapshots: UsageSnapshots = {};
let refreshInFlight = false;

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tagName);

  if (className) {
    result.className = className;
  }

  return result;
}

function renderRow(row: UsageRowModel): HTMLElement {
  const container = element("div", "usage-row");
  const heading = element("div", "usage-row__heading");
  const label = element("span", "usage-row__label");
  const percent = element("span", "usage-row__percent");
  const bar = element("div", "usage-bar");
  const fill = element(
    "div",
    `usage-bar__fill usage-bar__fill--${row.band}`,
  );

  label.textContent = row.label;
  percent.textContent = row.percentText;
  heading.append(label, percent);

  fill.style.width = `${row.usedPct}%`;
  bar.append(fill);
  container.append(heading, bar);

  if (row.resetText) {
    const reset = element("div", "usage-row__reset");
    reset.textContent = `リセット ${row.resetText}`;
    container.append(reset);
  }

  return container;
}

function renderProvider(model: ProviderModel): HTMLElement {
  const section = element("section", "provider");
  const heading = element("h2");
  heading.textContent = model.name;
  section.append(heading);

  if (model.status === "ok") {
    section.append(...model.rows.map(renderRow));
    return section;
  }

  const status = element("p", `provider__status provider__status--${model.status}`);
  status.textContent = model.message;
  section.append(status);

  if (model.status === "unauthenticated") {
    const link = element("a", "provider__login");
    link.href = model.loginUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "ログイン";
    section.append(link);
  } else if (model.status === "error" && model.lastSuccessText) {
    const lastSuccess = element("p", "provider__last-success");
    lastSuccess.textContent = model.lastSuccessText;
    section.append(lastSuccess);
  }

  return section;
}

function renderSnapshots(): void {
  if (!providersElement) {
    return;
  }

  providersElement.replaceChildren(
    ...createProviderModels(snapshots, new Date()).map(renderProvider),
  );
}

function canSendMessage(): boolean {
  return (
    typeof chrome !== "undefined" &&
    chrome.runtime !== undefined &&
    typeof chrome.runtime.sendMessage === "function"
  );
}

async function renderStoredSnapshots(): Promise<void> {
  try {
    snapshots = await getAllSnapshots();
  } catch {
    // Keep the current view if storage is also unavailable.
  }

  renderSnapshots();
}

async function refreshSnapshots(): Promise<void> {
  if (refreshInFlight) {
    return;
  }

  refreshInFlight = true;

  if (refreshButton) {
    refreshButton.disabled = true;
  }

  try {
    if (!canSendMessage()) {
      await renderStoredSnapshots();
      return;
    }

    const response: unknown = await chrome.runtime.sendMessage({
      type: "refresh",
    });

    if (typeof response === "object" && response !== null) {
      snapshots = response as UsageSnapshots;
      renderSnapshots();
    } else {
      await renderStoredSnapshots();
    }
  } catch {
    await renderStoredSnapshots();
  } finally {
    refreshInFlight = false;

    if (refreshButton) {
      refreshButton.disabled = false;
    }
  }
}

async function initialize(): Promise<void> {
  await renderStoredSnapshots();
  await refreshSnapshots();
}

refreshButton?.addEventListener("click", () => {
  void refreshSnapshots();
});

void initialize();
