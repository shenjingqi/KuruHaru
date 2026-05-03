import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("child_process", () => ({
  spawn: (...args) => spawnMock(...args),
}));

vi.mock("../../../utils/archive-scanner", () => ({
  scanForArchives: vi.fn(),
}));

vi.mock("../../../modules/config", () => ({
  getConfig: () => ({}),
}));

vi.mock("../../../modules/httpClient", () => ({
  getAsmrClient: vi.fn(),
}));

vi.mock("../../../modules/asmr-login", () => ({
  triggerCloudDataFetch: vi.fn(),
}));

vi.mock("../../../modules/tg-recent-activity", () => ({
  loadRecentActivity: vi.fn(() => ({ success: false })),
  scanAndSaveRecentActivity: vi.fn(() => ({ success: true })),
}));

vi.mock("../../../modules/asmr-core/rj-filter-utils", () => ({
  matchWorkIdsByRjCodesCaseInsensitive: vi.fn(() => ({
    matchedWorkIds: [],
    notFound: [],
  })),
}));

vi.mock("../../../modules/tg-common-core/peer-entity", () => ({
  normalizePeerEntityInput: vi.fn(),
}));

vi.mock("../../../utils/telegram-login", () => ({
  requireConnectedTelegramClient: vi.fn(),
}));

vi.mock("../../engine/publish-guardian", () => ({
  reservePublish: vi.fn(),
  releasePublishReservation: vi.fn(),
  commitPublishedContent: vi.fn(),
  markDuplicateRecordsCleaned: vi.fn(),
}));

import { TOOL_NODE_DEFINITIONS } from "./tools.adapter";

const createFakeWhisperChildProcess = () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 99999;

  setTimeout(() => {
    child.stdout.emit(
      "data",
      Buffer.from("RJ111111\n正在翻译(1/2)\n", "utf-8"),
    );
  }, 0);

  setTimeout(() => {
    child.stdout.emit(
      "data",
      Buffer.from("RJ222222\n正在翻译(2/2)\n", "utf-8"),
    );
  }, 1);

  setTimeout(() => {
    child.emit("close", 0);
  }, 2);

  return child;
};

const createPartialWhisperChildProcess = () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.pid = 99998;

  setTimeout(() => {
    child.stdout.emit(
      "data",
      Buffer.from("RJ111111\n正在翻译(1/1)\n", "utf-8"),
    );
  }, 0);

  setTimeout(() => {
    child.emit("close", 0);
  }, 1);

  return child;
};

describe("workflow-runtime/tools.adapter whisper.translateSubtitles", () => {
  /** @type {string | null} */
  let tmpRoot = null;

  beforeEach(async () => {
    tmpRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), "kh-whisper-"));
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => createFakeWhisperChildProcess());
  });

  afterEach(async () => {
    spawnMock.mockReset();
    if (tmpRoot) {
      await fs.promises.rm(tmpRoot, { recursive: true, force: true });
      tmpRoot = null;
    }
  });

  it("waits queued emitItem dispatches before finishing", async () => {
    const exePath = path.join(tmpRoot, "dummy-whisper.exe");
    const targetPath = path.join(tmpRoot, "media");
    const work1Dir = path.join(targetPath, "RJ111111");
    const work2Dir = path.join(targetPath, "RJ222222");

    await fs.promises.mkdir(work1Dir, { recursive: true });
    await fs.promises.mkdir(work2Dir, { recursive: true });
    await fs.promises.writeFile(path.join(work1Dir, "a.mp3"), "a");
    await fs.promises.writeFile(path.join(work2Dir, "b.mp3"), "b");
    await fs.promises.writeFile(exePath, "exe");

    const whisperNode = TOOL_NODE_DEFINITIONS.find(
      (nodeDef) => nodeDef.type === "whisper.translateSubtitles",
    );

    if (!whisperNode) {
      throw new Error("whisper.translateSubtitles node definition not found");
    }

    let completedItemDispatches = 0;
    const emitItem = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      completedItemDispatches += 1;
    });

    const result = await whisperNode.execute({
      config: {
        exePath,
        targetPath,
        subFormats: ["srt"],
      },
      signal: null,
      emit: vi.fn(),
      emitItem,
    });

    expect(result.success).toBe(true);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(emitItem).toHaveBeenCalledTimes(2);
    expect(completedItemDispatches).toBe(2);
  });

  it("emits missing works on process close when partial progress is reported", async () => {
    const exePath = path.join(tmpRoot, "dummy-whisper.exe");
    const targetPath = path.join(tmpRoot, "media");
    const work1Dir = path.join(targetPath, "RJ111111");
    const work2Dir = path.join(targetPath, "RJ222222");

    await fs.promises.mkdir(work1Dir, { recursive: true });
    await fs.promises.mkdir(work2Dir, { recursive: true });
    await fs.promises.writeFile(path.join(work1Dir, "a.mp3"), "a");
    await fs.promises.writeFile(path.join(work2Dir, "b.mp3"), "b");
    await fs.promises.writeFile(exePath, "exe");

    spawnMock.mockReset();
    spawnMock.mockImplementation(() => createPartialWhisperChildProcess());

    const whisperNode = TOOL_NODE_DEFINITIONS.find(
      (nodeDef) => nodeDef.type === "whisper.translateSubtitles",
    );

    if (!whisperNode) {
      throw new Error("whisper.translateSubtitles node definition not found");
    }

    const receivedCodes = [];
    const emitItem = vi.fn(async (payload) => {
      receivedCodes.push(payload?.code || "");
    });

    const result = await whisperNode.execute({
      config: {
        exePath,
        targetPath,
        subFormats: ["srt"],
      },
      signal: null,
      emit: vi.fn(),
      emitItem,
    });

    expect(result.success).toBe(true);
    expect(emitItem).toHaveBeenCalledTimes(2);
    expect(new Set(receivedCodes)).toEqual(new Set(["RJ111111", "RJ222222"]));
  });
});