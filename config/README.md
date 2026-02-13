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
- **ASMR ONE**: username, password, token, playlistId
- **用户资料**: username (已改为 "User")
- **自定义路径**: 所有 paths 字段已清空，将使用默认路径

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
