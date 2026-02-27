/**
 * KuruHaru 类型定义层
 *
 * 依赖方向: 无 (最底层)
 *
 * 本层是所有其他层的基础，不依赖任何层
 */

export const LAYER_TYPES = "types";
export const LAYER_CONFIG = "config";
export const LAYER_REPO = "repo";
export const LAYER_DATA_ACCESS = "data-access";
export const LAYER_SERVICE = "service";
export const LAYER_RUNTIME = "runtime";
export const LAYER_UI = "ui";

/**
 * 层级映射表
 * 用于 ESLint 规则检查
 */
export const LAYER_MAPPING = {
  // Types 层 - 最底层，无依赖
  "src/main/types": LAYER_TYPES,

  // Config 层 - 依赖 Types
  "src/main/modules/config.js": LAYER_CONFIG,

  // Repo 层 - 配置访问
  "src/main/modules/": LAYER_DATA_ACCESS,

  // Service 层 - 业务逻辑
  "src/main/modules/asmr-": LAYER_SERVICE,
  "src/main/modules/whisper.js": LAYER_SERVICE,
  "src/main/modules/tg-": LAYER_SERVICE,

  // Utils 层 - 工具函数（可被所有层使用）
  "src/main/utils": "utils",

  // Runtime 层 - 入口文件
  "src/main/index.js": LAYER_RUNTIME,

  // UI 层 - 渲染进程
  "src/renderer": LAYER_UI,
  "src/preload": LAYER_UI,
};

/**
 * 允许的依赖方向
 * 键: 当前层，值: 可以依赖的层列表
 */
export const ALLOWED_DEPENDENCIES = {
  [LAYER_TYPES]: [],
  [LAYER_CONFIG]: [LAYER_TYPES],
  [LAYER_DATA_ACCESS]: [LAYER_TYPES, LAYER_CONFIG],
  [LAYER_SERVICE]: [LAYER_TYPES, LAYER_CONFIG, LAYER_DATA_ACCESS],
  [LAYER_RUNTIME]: [
    LAYER_TYPES,
    LAYER_CONFIG,
    LAYER_DATA_ACCESS,
    LAYER_SERVICE,
  ],
  [LAYER_UI]: [
    LAYER_TYPES,
    LAYER_CONFIG,
    LAYER_DATA_ACCESS,
    LAYER_SERVICE,
    LAYER_RUNTIME,
  ],
  utils: [LAYER_TYPES, LAYER_CONFIG],
};

/**
 * 获取文件所属层级
 * @param {string} filePath - 文件路径
 * @returns {string} 层级名称
 */
export function getLayer(filePath) {
  if (
    filePath.includes("/src/main/types/") ||
    filePath.includes("\\src\\main\\types\\")
  ) {
    return LAYER_TYPES;
  }
  if (
    filePath.includes("/src/main/modules/config.js") ||
    filePath.includes("\\src\\main\\modules\\config.js")
  ) {
    return LAYER_CONFIG;
  }
  if (
    filePath.includes("/src/main/utils/") ||
    filePath.includes("\\src\\main\\utils\\")
  ) {
    return "utils";
  }
  if (
    filePath.includes("/src/main/index.js") ||
    filePath.includes("\\src\\main\\index.js")
  ) {
    return LAYER_RUNTIME;
  }
  if (
    filePath.includes("/src/preload/") ||
    filePath.includes("\\src\\preload\\")
  ) {
    return LAYER_UI;
  }
  if (
    filePath.includes("/src/renderer/") ||
    filePath.includes("\\src\\renderer\\")
  ) {
    return LAYER_UI;
  }
  if (filePath.includes("/src/main/modules/")) {
    // 判断是数据访问层还是服务层
    if (
      filePath.includes("asmr-localization") ||
      filePath.includes("httpClient")
    ) {
      return LAYER_DATA_ACCESS;
    }
    return LAYER_SERVICE;
  }
  return "unknown";
}
