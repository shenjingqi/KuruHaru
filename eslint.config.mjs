import eslintConfig from "@electron-toolkit/eslint-config";
import eslintConfigPrettier from "@electron-toolkit/eslint-config-prettier";
import eslintPluginVue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

export default [
  {
    ignores: [
      "**/node_modules",
      "**/dist",
      "**/out",
      "**/*.test.js",
      "**/*.spec.js",
    ],
  },
  eslintConfig,
  ...eslintPluginVue.configs["flat/recommended"],
  {
    files: ["**/*.vue"],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        extraFileExtensions: [".vue"],
      },
    },
  },

  // ========================================
  // 通用规则 - Harness Engineering
  // ========================================
  {
    files: ["**/*.{js,jsx,vue}"],
    rules: {
      "vue/require-default-prop": "off",
      "vue/multi-word-component-names": "off",

      // 1. 异步规则
      "require-await": "warn",

      // 2. 禁止空 catch 块（必须有错误处理）
      "no-empty": ["error", { allowEmptyCatch: false }],

      // 3. 禁止空函数
      "no-empty-function": [
        "error",
        { allow: ["arrowFunctions", "functions", "methods"] },
      ],

      // 4. 未使用变量
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],

      // 5. 强制 ===
      eqeqeq: ["warn", "always"],
    },
  },

  // ========================================
  // Renderer/UI 专用规则
  // ========================================
  {
    files: ["src/renderer/**/*.{js,vue}", "src/preload/**/*.{js}"],
    rules: {
      // 禁止直接使用 Node.js 模块
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "electron",
                "fs",
                "path",
                "http",
                "https",
                "os",
                "child_process",
              ],
              message:
                "❌ Renderer 不能直接使用 Node.js 模块。请使用 window.api IPC。",
            },
          ],
        },
      ],
      "no-console": "off",
    },
  },

  // ========================================
  // 主进程专用规则
  // ========================================
  {
    files: ["src/main/**/*.js"],
    rules: {
      // 主进程必须使用 logger
      "no-console": [
        "warn",
        { allow: ["warn", "error", "log", "debug", "info"] },
      ],

      // 禁止直接使用 axios
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["axios"],
              message:
                "❌ 禁止直接导入 axios。请使用 httpClient 模块中的代理客户端。",
            },
          ],
        },
      ],
    },
  },

  // ========================================
  // httpClient 模块例外
  // ========================================
  {
    files: ["src/main/modules/httpClient.js"],
    rules: { "no-restricted-imports": "off" },
  },

  // ========================================
  // Config 层规则
  // ========================================
  {
    files: ["src/main/modules/config.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name=/^(asmr|tg|whisper|upload)/]",
          message: "❌ Config 模块不能包含业务逻辑。",
        },
      ],
    },
  },

  eslintConfigPrettier,
];
