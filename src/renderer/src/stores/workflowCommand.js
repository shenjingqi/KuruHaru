import { defineStore } from "pinia";
import { computed, ref } from "vue";

const MENU_SCOPES = new Set([
  "canvas",
  "node",
  "edge",
  "group",
  "reroute",
  "all",
]);

const normalizeCommand = (command) => {
  if (!command || typeof command !== "object") {
    return null;
  }

  const id = typeof command.id === "string" ? command.id.trim() : "";
  if (!id) {
    return null;
  }

  return {
    id,
    label: typeof command.label === "string" ? command.label.trim() : id,
    icon: typeof command.icon === "string" ? command.icon.trim() : "",
    category:
      typeof command.category === "string" && command.category.trim()
        ? command.category.trim()
        : "general",
    active:
      typeof command.active === "function"
        ? command.active
        : () => command.active !== false,
    handler: typeof command.handler === "function" ? command.handler : null,
    description:
      typeof command.description === "string" ? command.description.trim() : "",
  };
};

const normalizeMenuScope = (scope) => {
  const normalizedScope = String(scope || "")
    .trim()
    .toLowerCase();
  if (MENU_SCOPES.has(normalizedScope)) {
    return normalizedScope;
  }
  return "canvas";
};

const normalizeContextMenuItem = (item, forcedScope = "") => {
  if (!item || typeof item !== "object") {
    return null;
  }

  const id = String(item.id || "").trim();
  const label = String(item.label || "").trim();
  if (!id || !label) {
    return null;
  }

  const scope = normalizeMenuScope(forcedScope || item.scope);
  const order = Number.isFinite(Number(item.order)) ? Number(item.order) : 0;
  const shortcut = String(item.shortcut || "").trim();
  const commandId = String(item.commandId || "").trim();
  const key = `${scope}:${id}`;

  return {
    key,
    id,
    scope,
    label,
    order,
    shortcut,
    danger: item.danger === true,
    commandId,
    handler: typeof item.handler === "function" ? item.handler : null,
    visible:
      typeof item.visible === "function"
        ? item.visible
        : () => item.visible !== false,
    disabled:
      typeof item.disabled === "function"
        ? item.disabled
        : () => item.disabled === true,
  };
};

export const useWorkflowCommandStore = defineStore("workflowCommand", () => {
  const commandMap = ref({});
  const executionLog = ref([]);
  const contextMenuMap = ref({});

  const registerCommand = (command) => {
    const normalized = normalizeCommand(command);
    if (!normalized) {
      return false;
    }

    commandMap.value = {
      ...commandMap.value,
      [normalized.id]: normalized,
    };
    return true;
  };

  const registerCommands = (commands = []) => {
    commands.forEach((command) => {
      registerCommand(command);
    });
  };

  const unregisterCommand = (commandId) => {
    if (!commandId || !commandMap.value[commandId]) {
      return;
    }

    const nextMap = { ...commandMap.value };
    delete nextMap[commandId];
    commandMap.value = nextMap;
  };

  const hasCommand = (commandId) => Boolean(commandMap.value[commandId]);

  const isCommandActive = (commandId, context = {}) => {
    const command = commandMap.value[commandId];
    if (!command) {
      return false;
    }

    try {
      return command.active(context) !== false;
    } catch {
      return false;
    }
  };

  const executeCommand = async (commandId, payload = {}, context = {}) => {
    const command = commandMap.value[commandId];
    if (!command || typeof command.handler !== "function") {
      return {
        ok: false,
        code: "COMMAND_NOT_FOUND",
      };
    }

    if (!isCommandActive(commandId, context)) {
      return {
        ok: false,
        code: "COMMAND_INACTIVE",
      };
    }

    try {
      const result = await command.handler(payload, context);
      executionLog.value = [
        {
          id: commandId,
          ok: true,
          at: new Date().toISOString(),
        },
        ...executionLog.value,
      ].slice(0, 200);
      return {
        ok: true,
        result,
      };
    } catch (error) {
      executionLog.value = [
        {
          id: commandId,
          ok: false,
          at: new Date().toISOString(),
          error: error?.message || String(error || "command failed"),
        },
        ...executionLog.value,
      ].slice(0, 200);
      return {
        ok: false,
        code: "COMMAND_FAILED",
        error: error?.message || "命令执行失败",
      };
    }
  };

  const commands = computed(() => Object.values(commandMap.value));

  const commandsByCategory = computed(() => {
    const grouped = {};
    commands.value.forEach((command) => {
      const category = command.category || "general";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(command);
    });
    return grouped;
  });

  const registerContextMenuItem = (item, forcedScope = "") => {
    const normalizedItem = normalizeContextMenuItem(item, forcedScope);
    if (!normalizedItem) {
      return () => {};
    }

    contextMenuMap.value = {
      ...contextMenuMap.value,
      [normalizedItem.key]: normalizedItem,
    };

    return () => {
      unregisterContextMenuItem(normalizedItem.id, normalizedItem.scope);
    };
  };

  const registerNodeMenuItem = (item) => registerContextMenuItem(item, "node");

  const registerCanvasMenuItem = (item) =>
    registerContextMenuItem(item, "canvas");

  const registerEdgeMenuItem = (item) => registerContextMenuItem(item, "edge");

  const registerGroupMenuItem = (item) =>
    registerContextMenuItem(item, "group");

  const registerRerouteMenuItem = (item) =>
    registerContextMenuItem(item, "reroute");

  const unregisterContextMenuItem = (itemId, scope = "") => {
    const normalizedId = String(itemId || "").trim();
    if (!normalizedId) {
      return;
    }

    const nextMap = { ...contextMenuMap.value };
    const normalizedScope = String(scope || "").trim().toLowerCase();
    const removeAllScopes = !normalizedScope;

    Object.keys(nextMap).forEach((key) => {
      const item = nextMap[key];
      if (!item) {
        return;
      }
      if (item.id !== normalizedId) {
        return;
      }
      if (!removeAllScopes && item.scope !== normalizedScope) {
        return;
      }
      delete nextMap[key];
    });

    contextMenuMap.value = nextMap;
  };

  const contextMenuItems = computed(() => Object.values(contextMenuMap.value));

  const getContextMenuItemsByScope = (scope = "canvas") => {
    const normalizedScope = normalizeMenuScope(scope);
    return contextMenuItems.value.filter(
      (item) => item.scope === normalizedScope || item.scope === "all",
    );
  };

  return {
    commands,
    commandsByCategory,
    contextMenuItems,
    executionLog,
    registerCommand,
    registerCommands,
    unregisterCommand,
    hasCommand,
    isCommandActive,
    executeCommand,
    registerContextMenuItem,
    registerNodeMenuItem,
    registerCanvasMenuItem,
    registerEdgeMenuItem,
    registerGroupMenuItem,
    registerRerouteMenuItem,
    unregisterContextMenuItem,
    getContextMenuItemsByScope,
  };
});
