import { describe, expect, it, vi } from "vitest";

// images.ts imports ipc (Tauri) at module scope; stub it so the pure
// normalizeImageSrc can be tested in plain node.
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { normalizeImageSrc } from "./images";

describe("normalizeImageSrc", () => {
  it("rejects external and inline sources", () => {
    expect(normalizeImageSrc("https://example.com/x.png")).toBeNull();
    expect(normalizeImageSrc("http://example.com/x.png")).toBeNull();
    expect(normalizeImageSrc("data:image/png;base64,AAA")).toBeNull();
    expect(normalizeImageSrc("blob:null/123")).toBeNull();
  });

  it("keeps attachments paths as-is", () => {
    expect(normalizeImageSrc("attachments/x.png")).toBe("attachments/x.png");
  });

  it("strips leading ../ segments down to the attachments path", () => {
    expect(normalizeImageSrc("../../attachments/x.png")).toBe("attachments/x.png");
    expect(normalizeImageSrc("../attachments/x.png")).toBe("attachments/x.png");
  });

  it("strips ./ and ../ prefixes from other relative paths", () => {
    expect(normalizeImageSrc("./foo.png")).toBe("foo.png");
    expect(normalizeImageSrc("../foo.png")).toBe("foo.png");
  });
});
