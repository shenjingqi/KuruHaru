# 高级搜索语法扩展（`$tagw:` / `$lang:`）

> 最后更新：2026-03-04

## 目标

在“高级搜索”页面新增两类语法能力，并保证 UI 选择、预设保存、语法预览、查询拼接、解析工具链一致：

- 低愿力标签：`$tagw:xxx$` / `$-tagw:xxx$`
- 语言筛选：`$lang:CODE$` / `$-lang:CODE$`

## 语法定义

### 1) 低愿力标签

- 包含：`$tagw:耳语$`
- 排除：`$-tagw:NTR$`
- 行为与 `$tag:` / `$-tag:` 保持一致，仅语义上区分为“包含低愿力标签”。

### 2) 语言筛选

- 包含：`$lang:JPN$`
- 排除：`$-lang:ENG$`

当前内置语言代码：

- `JPN`（JP 日本語）
- `ENG`（US English）
- `CHI_HANS`（CN 简体中文）
- `CHI_HANT`（HK 繁體中文）
- `CHI`（CN 中文）
- `KO_KR`（KR 한국어）
- `SPA`（ES Español）
- `ITA`（IT Italiano）
- `GER`（DE Deutsch）
- `FRE`（FR Français）

## 实现落点

- `src/renderer/src/components/AdvancedSearch.vue`
  - 新增 `params.tagw`、`params.lang`
  - 查询拼接新增 `$tagw/$-tagw/$lang/$-lang`
  - 预设合并链路同步支持 `tagw/lang`
- `src/renderer/src/components/LanguageSelector.vue`
  - 新增语言选择组件（含 include/exclude 变体）
- `src/renderer/src/components/TagSelector.vue`
  - 组件参数化，支持复用为“包含低愿力标签”
- `src/renderer/src/components/SearchPreview.vue`
  - 搜索语法预览新增 `tagw/lang` 展示
- `src/renderer/src/components/PresetManager.vue`
  - 预设保存/更新/合并新增 `tagw/lang`
- `src/renderer/src/utils/searchParser.js`
  - `parse()` / `generate()` 新增 `tagw/lang` 语法解析与生成

## 验证结论

- 变更文件 LSP 诊断：无错误
- 相关文件 ESLint：通过
- 单元测试：20/20 通过
- 构建：通过（electron-vite）
