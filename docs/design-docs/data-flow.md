# 数据流设计

> 状态: ✅ 稳定  
> 最后更新: 2026-02-26

本文档描述 KuruHaru 项目的数据流向、模块交互和数据存储。

---

## 数据流总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            用户交互层 (Renderer)                         │
│   HomePanel │ Settings │ WhisperTool │ UploadTool │ LocalCleaner ...   │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ window.api (IPC)
┌─────────────────────────────────▼───────────────────────────────────────┐
│                            预加载层 (Preload)                            │
│                        ipcRenderer.invoke()                             │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ IPC Channel
┌─────────────────────────────────▼───────────────────────────────────────┐
│                            主进程层 (Main)                              │
│   ┌─────────────────────────────────────────────────────────────────┐ │
│   │                     IPC Handlers                                  │ │
│   │   dialog:*, fs:*, config:*, asmr:*, whisper:*, tg:*            │ │
│   └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        ▼                         ▼                         ▼
┌───────────────┐      ┌─────────────────┐      ┌────────────────┐
│    Modules    │      │     Utils       │      │    Config     │
│               │      │                 │      │                │
│ asmr-localize │◄────►│ httpClient      │◄────►│  config.json  │
│ whisper       │      │ logger          │      │                │
│ tg-activity   │      │ errorHandler    │      │                │
│ tg-login      │      │ retry           │      │                │
│ asmr-login    │      │                 │      │                │
└───────────────┘      └─────────────────┘      └────────────────┘
        │                         │
        ▼                         ▼
┌───────────────┐      ┌─────────────────┐
│  外部 API     │      │   文件系统       │
│               │      │                 │
│ ASMR.one      │      │ 用户数据目录     │
│ Telegram API  │      │ 配置文件        │
│ Whisper CLI   │      │ 日志文件        │
└───────────────┘      └─────────────────┘
```

---

## 核心数据流

### 数据流 1：计划筛选

```
用户操作
    │
    ▼
AdvancedSearch.vue ──invoke──► ipcMain.handle('asmr:search')
    │                                 │
    │                                 ▼
    │                    asmr-localization.js
    │                         │
    │                         ├──► httpClient (ASMR API)
    │                         │
    │                         ▼
    │                    返回搜索结果
    │
    ▼
更新 UI 显示
```

### 数据流 2： Whisper 转写

```
用户选择音频文件
    │
    ▼
WhisperTool.vue ──send──► ipcMain.on('whisper:start')
    │                                 │
    │                                 ▼
    │                        whisper.js
    │                         │
    │                         ├──► 读取配置文件获取 Whisper 路径
    │                         │
    │                         ├──► spawn 子进程运行 Whisper
    │                         │
    │                         ├──► 进度推送 'log-update'
    │                         │
    │                         ▼
    │                    生成字幕文件
    │
    ▼
显示完成状态
```

### 数据流 3：频道上传

```
用户选择文件夹/输入频道 ID
    │
    ▼
UploadTool.vue ──invoke──► ipcMain.handle('tg:upload')
    │                                 │
    │                                 ▼
    │                        tg-recent-activity.js
    │                         │
    │                         ├──► 读取配置获取 TG 认证
    │                         │
    │                         ├──► httpClient (Telegram API)
    │                         │
    │                         ▼
    │                    上传文件到频道
    │
    ▼
更新 UI 显示上传结果
```

### 数据流 4：数据清理（本地）

```
用户选择清理模式
    │
    ▼
LocalCleaner.vue ──invoke──► ipcMain.handle('clean:local')
    │                                 │
    │                                 ▼
    │                        asmr-localization.js
    │                         │
    │                         ├──► 扫描本地文件
    │                         │
    │                         ├──► 匹配 RJ 号
    │                         │
    │                         ▼
    │                    返回待清理列表
    │
    ▼
用户确认后执行删除
```

### 数据流 5：数据清理（云端）

```
用户触发云端清理
    │
    ▼
CloudCleaner.vue ──invoke──► ipcMain.handle('clean:cloud')
    │                                 │
    │                                 ▼
    │                        tg-recent-activity.js
    │                         │
    │                         ├──► httpClient (Telegram API)
    │                         │
    │                         ├──► 获取频道最近发布记录
    │                         │
    │                         ▼
    │                    返回最近 RJ 号列表
    │
    ▼
更新计划列表，标记已完成
```

---

## 数据存储

### 配置文件

```
config/
├── config.json          # 用户配置（包含敏感信息）
└── config-template.json # 配置模板（不含敏感信息）
```

**配置结构**：

```javascript
{
  profile: { username, avatar },      // 个人设置
  tg: { apiId, apiHash, session },  // TG 认证
  asmr: { username, token },        // ASMR 认证
  paths: { sourceDir, toolOutputDir }, // 路径设置
  whisper: { exePath },              // Whisper 路径
  system: { theme, language }       // 系统设置
}
```

### 本地数据

```
用户数据目录 (AppData/KuruHaru)/
├── data/                    # 数据目录
│   ├── chinese-list.txt   # 汉化列表
│   └── ...
├── logs/                    # 日志目录
│   └── kuruharu-YYYYMMDD.log
└── config.json              # 用户配置
```

---

## IPC 通信模式

### 请求-响应模式

```javascript
// Renderer
const result = await window.api.invoke("channel-name", payload);

// Main
ipcMain.handle("channel-name", async (event, payload) => {
  // 处理逻辑
  return result;
});
```

### 推送模式

```javascript
// Main - 推送进度
mainWindow.webContents.send("log-update", { type: "progress", data: 50 });

// Renderer - 监听
window.api.onLogUpdate((data) => {
  console.log(data);
});
```

---

## 文档更新日志

| 日期       | 变更     |
| ---------- | -------- |
| 2026-02-26 | 初始版本 |
