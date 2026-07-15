// The debounced settings save must never leak across vaults: closing a
// vault flushes the pending write BEFORE close_vault, and loading a vault
// discards any write still pending from the previous one.

import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { cmd: string; rel?: string; contents?: string }[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, rel: args?.rel as string, contents: args?.contents as string });
    if (cmd === "vault_read_file") throw "no such file";
    return null;
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../lib/theme", () => ({ setTheme: vi.fn(), initTheme: vi.fn() }));

import { flushPendingSave, useSettings } from "./settings";
import { useVault } from "./vault";

beforeEach(() => {
  calls.length = 0;
  vi.useFakeTimers();
});

describe("settings save debounce vs vault lifecycle", () => {
  it("debounces: one write after the timer, carrying the latest edit", async () => {
    useSettings.getState().update({ session: { defaultMaxCards: 30 } });
    useSettings.getState().update({ session: { defaultMaxCards: 42 } });
    expect(calls.filter((c) => c.cmd === "vault_write_file")).toHaveLength(0);
    await vi.runAllTimersAsync();
    const writes = calls.filter((c) => c.cmd === "vault_write_file");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0].contents!).session.defaultMaxCards).toBe(42);
  });

  it("close() flushes the pending write BEFORE close_vault", async () => {
    useSettings.getState().update({ session: { defaultMaxCards: 7 } });
    const closing = useVault.getState().close();
    await vi.runAllTimersAsync();
    await closing;
    const order = calls.map((c) => c.cmd).filter((c) => c === "vault_write_file" || c === "close_vault");
    expect(order).toEqual(["vault_write_file", "close_vault"]);
  });

  it("load() discards a pending write from the previous vault", async () => {
    useSettings.getState().update({ session: { defaultMaxCards: 99 } });
    await useSettings.getState().load(); // new vault opening
    await vi.runAllTimersAsync();
    expect(calls.filter((c) => c.cmd === "vault_write_file")).toHaveLength(0);
  });

  it("flushPendingSave() is a no-op when nothing is pending", async () => {
    await flushPendingSave();
    expect(calls.filter((c) => c.cmd === "vault_write_file")).toHaveLength(0);
  });
});
