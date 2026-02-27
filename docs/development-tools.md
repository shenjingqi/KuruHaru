# 开发工具配置

> 状态: ✅ 稳定  
> 最后更新: 2026-02-27

本文档记录项目所需的开发工具和配置。

---

## 必须安装的工具

### 1. Node.js

- 版本: 20.x LTS
- 下载: https://nodejs.org/

### 2. Git

- 版本: 2.x
- 下载: https://git-scm.com/
- 配置:

```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

### 3. GitHub CLI (gh)

- 用途: 提交 PR、查看状态
- 安装: https://cli.github.com/
- 登录: `gh auth login`

---

## 可选工具

### 录屏工具 (用于步骤 3, 6)

| 工具          | 平台              | 说明             |
| ------------- | ----------------- | ---------------- |
| OBS Studio    | Windows/Mac/Linux | 开源录屏         |
| QuickTime     | Mac               | 系统自带         |
| Xbox Game Bar | Windows 10+       | 系统自带 (Win+G) |

### 调试工具

| 工具            | 用途            |
| --------------- | --------------- |
| VS Code         | 代码编辑 + 调试 |
| Chrome DevTools | 前端调试        |
| electron-log    | 主进程日志      |

---

## 脚本工具

项目内置的脚本工具：

```bash
# RalphWiggum Loop - 自动验证修复
npm run ralph "修复登录问题"

# 验证 - lint + build
npm run verify

# 测试
npm run test         # 运行单元测试
npm run test:watch   # 监听模式

# 开发
npm run dev

# 构建
npm run build
```

---

## CI/CD 工具

GitHub Actions (已配置):

- `.github/workflows/ci.yml` - 验证流水线
- `.github/workflows/docs-consistency.yml` - 文档一致性检查

---

## 文档更新日志

| 日期       | 变更                    |
| ---------- | ----------------------- |
| 2026-02-26 | 初始版本                |
| 2026-02-27 | 添加测试命令 (npm test) |
