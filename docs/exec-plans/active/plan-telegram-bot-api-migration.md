# Telegram Search Bot - Bot API 

## 文档信息
- **日期**: 2026-03-02
- **类型**: 实现计划
- **优先级**: 高

---



### 1.2  (Bot API)
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  主进程         │────▶│  TelegramBot    │────▶│  Bot API        │
│  (node-telegram-│     │  (Bot Token)    │     │  (Bot视角)      │
│   bot-api)      │     │                 │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### 2. **docs/plan-telegram-bot-api-migration.md** ✅
**最新的 Bot API 迁移完整计划**（基于您的最新需求）：
- **目标**： 使用到真正的 Bot API
- **技术栈**：`node-telegram-bot-api` + Bot Token（从 @BotFather 获取）
- **核心功能**：
  - `/start` - 启动命令
  - `/search <RJ号>` - 搜索RJ号
  - `/help` - 帮助信息
- **部署模式**：支持 Polling（开发）和 Webhook（生产）
- **权限控制**：支持用户/群组白名单
- **完整的代码实现**：包含启动、停止、消息处理、权限检查等




**核心需求**：
1. 需要从系统内填写bot token 和channelid 以及 txt前置包的文件
2. 用户在 Telegram 内通过 `/search RJ123456` 命令与 Bot 交互 还要支持后续如果拉到群里也能使用。
3. 搜索逻辑改为 Bot 直接响应用户命令 bot从channelID里的频道获取该RJ号找到的最近一个链接。如果没找到从txt找如果还没找到提示请在one站查看是否拥有或者在频道提出

以下方案是由别的给出的一些指导可做参考
1. 基础信息
日期: 2026-03-03

类型: 整合技术方案 (V2.0)

核心组件:

importer.js (基于 GramJS / UserBot API): 负责历史全量抓取与离线增量补全。

bot.js (基于 Bot API): 负责实时搜索响应、白名单拦截、新帖实时索引。

history.json: 本地数据库，存储 { RJ号: 频道消息链接 } 及扫描锚点 lastMsgId。

2. 系统流程图
3. 组件实现细节
3.1 增量扫描仪 (importer.js)
功能: 启动时自动判断。若无记录则全量抓取；若有记录则从上次断点 (lastMsgId) 开始增量同步。

```JavaScript
// 依赖: npm install telegram input
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");
const input = require("input");

const config = {
    apiId: 123456, // my.telegram.org 获取
    apiHash: "YOUR_API_HASH",
    channelId: "your_channel_username", // 频道ID
    historyPath: "./history.json"
};

(async () => {
    let localData = { lastMsgId: 0, history: {} };
    if (fs.existsSync(config.historyPath)) {
        localData = JSON.parse(fs.readFileSync(config.historyPath, "utf-8"));
    }

    const client = new TelegramClient(new StringSession(""), config.apiId, config.apiHash, { connectionRetries: 5 });
    await client.start({
        phoneNumber: async () => await input.text("手机号: "),
        phoneCode: async () => await input.text("验证码: "),
        password: async () => await input.text("两步验证: "),
    });

    console.log(localData.lastMsgId === 0 ? "[全量扫描中...]" : `[增量同步中...] 从 ID: ${localData.lastMsgId}`);

    let newCount = 0;
    let maxId = localData.lastMsgId;

    for await (const message of client.iterMessages(config.channelId, { minId: localData.lastMsgId })) {
        const text = message.text || message.caption;
        if (text) {
            const matches = text.match(/RJ\d{6,}/gi);
            if (matches) {
                matches.forEach(rj => {
                    const rjId = rj.toUpperCase();
                    if (!localData.history[rjId]) {
                        localData.history[rjId] = `https://t.me/${config.channelId}/${message.id}`;
                        newCount++;
                    }
                });
            }
        }
        if (message.id > maxId) maxId = message.id;
    }

    localData.lastMsgId = maxId;
    fs.writeFileSync(config.historyPath, JSON.stringify(localData, null, 2));
    console.log(`同步完成！新增: ${newCount} 条。`);
    process.exit(0);
})();
3.2 搜索机器人 (bot.js)
功能: 实时响应用户指令，具备权限验证，并自动过滤掉断线期间堆积的旧消息。

JavaScript
// 依赖: npm install node-telegram-bot-api
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const CONFIG = {
    token: 'YOUR_BOT_TOKEN',
    adminId: 12345678,         // 你的UID
    whiteList: [-100123456, 12345678], // 授权群组或个人ID
    prePackageLink: "https://your-download-link.com",
    historyPath: './history.json',
    prePackagePath: './prepackage.txt'
};

const bot = new TelegramBot(CONFIG.token, { polling: true });
const startTime = Math.floor(Date.now() / 1000); // 解决堆积回复的关键

// 加载数据
let data = JSON.parse(fs.readFileSync(CONFIG.historyPath, 'utf-8'));
let prePackageSet = new Set(
    fs.existsSync(CONFIG.prePackagePath) 
    ? fs.readFileSync(CONFIG.prePackagePath, 'utf-8').split('\n').map(s => s.trim().toUpperCase()) 
    : []
);

bot.on('message', (msg) => {
    // 1. 忽略启动前的旧消息 (解决堆积问题)
    if (msg.date < startTime) return;

    // 2. 权限校验
    if (!CONFIG.whiteList.includes(msg.chat.id) && msg.from.id !== CONFIG.adminId) {
        // 可选：静默处理或提示无权
        return; 
    }

    const match = msg.text?.match(/\/search\s+(RJ\d{6,})/i);
    if (!match) return;

    const rjId = match[1].toUpperCase();

    // 3. 三级搜索优先级
    if (data.history[rjId]) {
        // 优先级1：频道历史
        bot.sendMessage(msg.chat.id, `✅ 找到最新资源：\n${data.history[rjId]}`);
    } else if (prePackageSet.has(rjId)) {
        // 优先级2：前置包列表
        bot.sendMessage(msg.chat.id, `📦 该资源在前置包中：\n🔗 地址：${CONFIG.prePackageLink}`);
    } else {
        // 优先级3：兜底提示
        bot.sendMessage(msg.chat.id, `❌ 未找到 ${rjId}\n\n请在 One 站确认或在频道咨询。`);
    }
});

// 4. 在线增量更新：Bot在线时，发频道新帖直接存入内存
bot.on('channel_post', (msg) => {
    const text = msg.text || msg.caption || "";
    const matches = text.match(/RJ\d{6,}/gi);
    if (matches) {
        matches.forEach(rj => {
            const rjId = rj.toUpperCase();
            data.history[rjId] = `https://t.me/c/${msg.chat.id.toString().replace("-100", "")}/${msg.message_id}`;
        });
        fs.writeFileSync(CONFIG.historyPath, JSON.stringify(data, null, 2));
    }
});
4. 维护与操作指南
4.1 部署流程
准备环境: 安装 Node.js，执行 npm install。

首次同步: 运行 node importer.js。输入验证码，完成全量抓取。

准备前置包: 在 prepackage.txt 中逐行填入 RJ 号。

启动 Bot: 运行 node bot.js。

4.2 离线后的同步
若 Bot 离线超过一天，建议先手动运行一次 node importer.js。由于它记录了 lastMsgId，它会瞬间只抓取你离线期间漏掉的那几条消息，保持 history.json 完整。