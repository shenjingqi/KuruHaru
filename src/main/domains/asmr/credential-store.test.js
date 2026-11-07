import { beforeEach, describe, expect, it, vi } from "vitest";

const { fsMock, safeStorageMock, appMock, data } = vi.hoisted(() => {
  const data = new Map();
  return {
    data,
    fsMock: {
      existsSync: vi.fn((filePath) => data.has(filePath)),
      readFileSync: vi.fn((filePath) => {
        if (!data.has(filePath)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
        return data.get(filePath);
      }),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn((filePath, contents) => data.set(filePath, contents)),
      renameSync: vi.fn((from, to) => {
        data.set(to, data.get(from));
        data.delete(from);
      }),
      rmSync: vi.fn((filePath) => data.delete(filePath)),
    },
    safeStorageMock: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((value) => Buffer.from(`enc:${value}`)),
      decryptString: vi.fn((value) => value.toString().replace(/^enc:/, "")),
    },
    appMock: { getPath: vi.fn(() => "C:/profile") },
  };
});

vi.mock("node:fs", () => ({ default: fsMock }));
vi.mock("electron", () => ({ app: appMock, safeStorage: safeStorageMock }));

describe("ASMR credential store", () => {
  beforeEach(() => {
    vi.resetModules();
    data.clear();
    for (const key of Object.keys(fsMock)) fsMock[key].mockClear?.();
    safeStorageMock.isEncryptionAvailable.mockReturnValue(true);
  });

  it("stores encrypted credentials and clears them", async () => {
    const store = await import("./credential-store.js");
    store.saveAsmrCredentials({ password: "secret-password", token: "secret-token" });
    expect(store.getAsmrPassword()).toBe("secret-password");
    expect(store.getAsmrToken()).toBe("secret-token");
    const persisted = [...fsMock.writeFileSync.mock.calls].at(-1)[1];
    expect(persisted).not.toContain("secret-password");
    expect(persisted).not.toContain("secret-token");
    store.clearAsmrPassword();
    expect(store.getAsmrPassword()).toBe("");
    expect(store.getAsmrToken()).toBe("");
  });

  it("refuses to save secrets when OS encryption is unavailable", async () => {
    safeStorageMock.isEncryptionAvailable.mockReturnValue(false);
    const store = await import("./credential-store.js");
    expect(() => store.saveAsmrCredentials({ password: "secret" })).toThrow(/不可用/);
  });

  it("keeps Telegram and Aria2 secrets in the encrypted store", async () => {
    const store = await import("./credential-store.js");
    store.saveTelegramCredentials({
      apiHash: "telegram-api-hash",
      session: "telegram-session",
      botToken: "telegram-bot-token",
    });
    store.saveAria2Secret("aria2-rpc-secret");

    expect(store.getTelegramCredentials()).toEqual({
      apiHash: "telegram-api-hash",
      session: "telegram-session",
      botToken: "telegram-bot-token",
    });
    expect(store.getAria2Secret()).toBe("aria2-rpc-secret");

    const persisted = [...fsMock.writeFileSync.mock.calls]
      .map(([, contents]) => String(contents))
      .join("\n");
    for (const secret of [
      "telegram-api-hash",
      "telegram-session",
      "telegram-bot-token",
      "aria2-rpc-secret",
    ]) {
      expect(persisted).not.toContain(secret);
    }
  });

  it("clears explicitly empty Telegram credentials", async () => {
    const store = await import("./credential-store.js");
    store.saveTelegramCredentials({ session: "telegram-session" });
    store.clearTelegramSession();

    expect(store.getTelegramCredentials().session).toBe("");
  });

  it("clears ASMR credentials without deleting other domain secrets", async () => {
    const store = await import("./credential-store.js");
    store.saveAsmrCredentials({ password: "asmr-password", token: "asmr-token" });
    store.saveAria2Secret("aria2-rpc-secret");

    store.clearAsmrPassword();

    expect(store.getAsmrPassword()).toBe("");
    expect(store.getAsmrToken()).toBe("");
    expect(store.getAria2Secret()).toBe("aria2-rpc-secret");
  });

  it("stores the automation heartbeat secret only in the encrypted store", async () => {
    const store = await import("./credential-store.js");
    store.saveAutomationHeartbeatSecret("automation-heartbeat-secret");
    expect(store.getAutomationHeartbeatSecret()).toBe(
      "automation-heartbeat-secret",
    );
    const persisted = [...fsMock.writeFileSync.mock.calls]
      .map(([, contents]) => String(contents))
      .join("\n");
    expect(persisted).not.toContain("automation-heartbeat-secret");

    store.clearAutomationHeartbeatSecret();
    expect(store.getAutomationHeartbeatSecret()).toBe("");
  });
});
