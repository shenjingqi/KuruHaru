# 配置文件说明

## 文件列表

### 1. `config.json`

当前使用的配置文件（已去除敏感信息，使用默认路径）

### 2. `config.json.backup`

原始配置文件的完整备份（包含所有敏感信息和自定义路径）

### 3. `config-template.json`

配置模板文件，用于重新生成干净的配置

## 默认路径机制

应用启动时会自动使用以下默认路径（基于 Electron `app.getPath('userData')`）：

- **配置目录**: `C:\Users\[用户名]\AppData\Roaming\kuruharu-app\config.json`
- **数据目录**: `C:\Users\[用户名]\AppData\Roaming\kuruharu-app\data\`
- **日志目录**: `C:\Users\[用户名]\AppData\Roaming\kuruharu-app\logs\`
- **缓存目录**: `C:\Users\[用户名]\AppData\Roaming\kuruharu-app\Cache\`

## 已去除的敏感信息

- **Telegram**: apiId, apiHash, phone, session
- **ASMR ONE**: username, password, token, playlistId, translationQueuePlaylistId

## 新增待翻译队列配置（2026-03-16）

- `asmr.translationQueuePlaylistId`: Telegram Bot `/search` 未命中本地资源时，转入 One 站待翻译队列使用的独立 playlist ID
- 留空时会兼容回退到 `asmr.playlistId`
- **用户资料**: username (已改为 "User")
- **自定义路径**: 所有 paths 字段已清空，将使用默认路径

## 新增 TG 信息热缓存配置（2026-03-31）

- `tg.infoHotCacheEnabled`: 是否启用 `asmr.one/works` 首页热缓存定时同步
- `tg.infoHotCacheIntervalMs`: 常态检查间隔，默认 `3600000`（1 小时）
- `tg.infoHotCacheActiveIntervalMs`: 检测到更新后的高频检查间隔，默认 `1200000`（20 分钟）
- `tg.infoHotCacheCoolIntervalMs`: 连续 3 天无变化后的降频检查间隔，默认 `10800000`（3 小时）
- `tg.infoHotCacheActiveWindowMs`: 发现更新后保持高频的窗口，默认 `86400000`（24 小时）
- `tg.infoHotCacheCoolAfterMs`: 连续无变化进入降频的阈值，默认 `259200000`（72 小时）
- `tg.infoHotCachePageSize`: 首页热缓存拉取条数，默认 `100`
- `tg.infoHotCacheStartupDelayMs`: 启动后首次热缓存同步延迟，默认 `1500`
- 热缓存写入目标仍为 `tg-info-cache.json`，仅新增缺失记录，不更新已有记录，也不会替代原有详情缓存逻辑

## 恢复原始配置

如需恢复原始配置（包含敏感信息和自定义路径）：

```bash
copy config\config.json.backup config\config.json
```

## 重新打包

使用干净的配置重新打包：

```bash
npm run build:win
```

打包后的应用将使用默认路径，不包含任何敏感信息。

## 新增系统外观与代理配置（2026-03-05）

`system` 节点新增以下字段：

- `theme`: `auto | light | dark`（明暗模式）
- `proxyUrl`: 全局代理地址（ASMR/TG 默认代理）
- `windowOpacity`: 窗口透明度（建议 0.55 - 1）
- `blurEnabled`: 是否启用毛玻璃
- `blurIntensity`: 毛玻璃强度（0 - 40）
- `accentColor`: 主题强调色（`#RRGGBB`）

## 日志等级默认行为（2026-03-07）

- `logging.level` 默认值为 `info`
- 窗口/托盘/UI 外观/应用生命周期这类无关业务流程的日志默认归入 `debug`
- 业务执行结果（例如清理数据、Bot 真正启动结果）继续保留在 `info` 以上级别
- 只有需要排查启动流程、窗口行为或系统集成问题时，才建议临时切换到 `debug`
