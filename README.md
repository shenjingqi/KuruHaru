# KuruHaru

KuruHaru 是面向 ASMR 内容整理与发布流程的 Electron 桌面应用，使用 Electron、Vue 3 和 Vite。应用覆盖 ASMR.ONE 数据管理、Telegram 登录/上传与 Bot、Whisper 字幕处理、Aria2 下载，以及本地和云端清理。

## 快速开始

环境要求：Node.js 20、npm、Windows 开发或构建环境（当前主要交付平台）。下载/翻译等流程可能需要外部 Aria2、Whisper 可执行文件、Telegram/ASMR 账号与网络代理。

```bash
npm ci
npm run dev
```

## 验证与交付

```bash
npm run test             # 单元测试
npm run lint             # ESLint（当前仓库还含格式警告）
npm run verify:protocol  # IPC/外部协议不变量
npm run docs:config      # 配置模板、文档链接和路径引用检查
npm run build            # 生产资源构建
npm run build:win        # Windows 安装包
```

`npm run build` 只生成 `out/` 构建资源，不等于完整安装包。发布前还需检查 `electron-builder.yml` 的发布源、更新配置和密钥注入方式。

## 配置与数据

- 新安装默认配置由 `src/shared/config-contract.mjs` 生成；不要直接编辑用户数据。
- 模板位于 `config/config-template.json`，使用 `npm run config:template` 从配置契约重新生成。
- 配置字段、敏感字段和迁移说明见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。
- 自动翻译云端心跳在“自动翻译 → 运行策略”中配置 Worker 地址；心跳密钥只保存在系统安全凭据存储中，不会写入 `config.json`。

## 项目导航

- [`docs/README.md`](docs/README.md)：文档入口
- [`docs/V1_BASELINE.md`](docs/V1_BASELINE.md)：当前 v1 基线
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)：当前架构、模块、IPC、配置和持久化
- [`docs/QUALITY.md`](docs/QUALITY.md)：质量、验收与发布
- [`AGENTS.md`](AGENTS.md)：编码 Agent 指引

## 文档维护

行为、IPC、配置字段或模块装配变化时，同一变更同步更新对应文档，并运行 `npm run docs:config`。架构与验证结论必须来自当前代码和实际命令，不保留无法复现的固定测试数、lint 数或过期状态声明。
