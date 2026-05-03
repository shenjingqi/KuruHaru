import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWorkflowKeybindingStore } from "./workflowKeybinding";

const createInputTarget = () => ({
  tagName: "INPUT",
  isContentEditable: false,
});

describe("workflowKeybinding", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("输入框聚焦时不会触发 canvas 的删除快捷键", async () => {
    const store = useWorkflowKeybindingStore();
    const executeCommand = vi.fn().mockResolvedValue({ ok: true });

    store.registerBinding({
      scope: "canvas",
      combo: "backspace",
      commandId: "Comfy.Edit.Delete",
    });

    const preventDefault = vi.fn();
    const handled = await store.triggerFromKeyboardEvent({
      event: {
        key: "Backspace",
        code: "Backspace",
        target: createInputTarget(),
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault,
      },
      commandStore: { executeCommand },
      scope: ["text", "canvas"],
    });

    expect(handled).toBe(false);
    expect(executeCommand).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("输入框聚焦时仍允许 global 快捷键", async () => {
    const store = useWorkflowKeybindingStore();
    const executeCommand = vi.fn().mockResolvedValue({ ok: true });

    store.registerBinding({
      scope: "global",
      combo: "ctrl+s",
      commandId: "Comfy.File.Save",
    });

    const preventDefault = vi.fn();
    const handled = await store.triggerFromKeyboardEvent({
      event: {
        key: "s",
        code: "KeyS",
        target: createInputTarget(),
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        preventDefault,
      },
      commandStore: { executeCommand },
      scope: ["text", "canvas"],
    });

    expect(handled).toBe(true);
    expect(executeCommand).toHaveBeenCalledWith("Comfy.File.Save", {}, {});
    expect(preventDefault).toHaveBeenCalledOnce();
  });
});
