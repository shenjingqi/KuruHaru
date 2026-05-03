import { defineStore } from "pinia";
import { ref } from "vue";

const ORDERED_MODIFIERS = ["ctrl", "alt", "shift", "meta"];

const normalizeToken = (token) => {
  const normalized = String(token || "")
    .trim()
    .toLowerCase();
  if (normalized === "control") {
    return "ctrl";
  }
  if (normalized === " ") {
    return "space";
  }
  return normalized;
};

const normalizeScopeToken = (scope) => {
  const normalizedScope = String(scope || "")
    .trim()
    .toLowerCase();
  return normalizedScope || "canvas";
};

const normalizeScopeList = (scope) => {
  const rawScopes = Array.isArray(scope) ? scope : [scope];
  const scopeList = [];

  rawScopes.forEach((item) => {
    const normalizedScope = normalizeScopeToken(item);
    if (!scopeList.includes(normalizedScope)) {
      scopeList.push(normalizedScope);
    }
  });

  if (!scopeList.length) {
    scopeList.push("canvas");
  }

  return scopeList;
};

const normalizeCombo = (combo) => {
  if (typeof combo !== "string") {
    return "";
  }

  const tokens = combo.split("+").map(normalizeToken).filter(Boolean);
  const modifiers = ORDERED_MODIFIERS.filter((item) => tokens.includes(item));
  const nonModifier = tokens.find((item) => !ORDERED_MODIFIERS.includes(item));

  if (!nonModifier) {
    return modifiers.join("+");
  }

  return [...modifiers, nonModifier].join("+");
};

const resolveComboFromEvent = (event) => {
  if (!event) {
    return "";
  }

  const parts = [];
  if (event.ctrlKey || event.metaKey) {
    parts.push("ctrl");
  }
  if (event.altKey) {
    parts.push("alt");
  }
  if (event.shiftKey) {
    parts.push("shift");
  }

  const keyToken = normalizeToken(event.key || event.code || "");
  if (keyToken && !ORDERED_MODIFIERS.includes(keyToken)) {
    parts.push(keyToken);
  }

  return normalizeCombo(parts.join("+"));
};

const isTextInputTarget = (target) => {
  if (!target || typeof target !== "object") {
    return false;
  }

  const tagName = target.tagName ? target.tagName.toLowerCase() : "";
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable === true
  );
};

export const useWorkflowKeybindingStore = defineStore(
  "workflowKeybinding",
  () => {
    const bindings = ref([]);

    const registerBinding = (binding) => {
      if (!binding || typeof binding !== "object") {
        return;
      }

      const combo = normalizeCombo(binding.combo);
      if (!combo || !binding.commandId) {
        return;
      }

      const scope = normalizeScopeToken(binding.scope);
      bindings.value = [
        ...bindings.value.filter(
          (item) => item.combo !== combo || item.scope !== scope,
        ),
        {
          combo,
          commandId: String(binding.commandId),
          scope,
        },
      ];
    };

    const registerBindings = (items = []) => {
      items.forEach((item) => registerBinding(item));
    };

    const clearBindings = () => {
      bindings.value = [];
    };

    const triggerFromKeyboardEvent = async ({
      event,
      commandStore,
      scope = "canvas",
      payload = {},
      context = {},
    }) => {
      if (!event || !commandStore) {
        return false;
      }

      const scopeCandidates = normalizeScopeList(scope);
      if (!scopeCandidates.includes("global")) {
        scopeCandidates.push("global");
      }

      const isEditingText = isTextInputTarget(event.target);

      if (isEditingText && !scopeCandidates.includes("text")) {
        return false;
      }

      const effectiveScopeCandidates = isEditingText
        ? scopeCandidates.filter(
            (scopeToken) => scopeToken === "text" || scopeToken === "global",
          )
        : scopeCandidates;

      const combo = resolveComboFromEvent(event);
      if (!combo) {
        return false;
      }

      const matchedBinding = effectiveScopeCandidates
        .map((scopeToken) =>
          bindings.value.find(
            (item) => item.combo === combo && item.scope === scopeToken,
          ),
        )
        .find(Boolean);

      if (!matchedBinding) {
        return false;
      }

      const result = await commandStore.executeCommand(
        matchedBinding.commandId,
        payload,
        context,
      );
      if (result.ok) {
        event.preventDefault();
        return true;
      }

      return false;
    };

    return {
      bindings,
      registerBinding,
      registerBindings,
      clearBindings,
      triggerFromKeyboardEvent,
    };
  },
);
