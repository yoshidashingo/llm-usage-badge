import { describe, expect, it } from "vitest";
import manifest from "../manifest.json";

describe("manifest", () => {
  it("points to the built background worker and popup", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({
      service_worker: "background.js",
      type: "module",
    });
    expect(manifest.action.default_popup).toBe("popup/index.html");
  });

  it("requests only the designed permissions and hosts", () => {
    expect(manifest.permissions).toEqual(["storage", "alarms"]);
    expect(manifest.host_permissions).toEqual([
      "https://claude.ai/*",
      "https://chatgpt.com/*",
      "https://grok.com/*",
    ]);
  });
});

