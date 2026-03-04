<template>
  <div class="tg-search-bot">
    <n-card title="Telegram 搜索 Bot" :bordered="false" class="bot-card">
      <n-space vertical :size="16">
        <div class="bot-status">
          <n-tag :type="botStatus.running ? 'success' : 'error'">
            {{ botStatus.running ? "运行中" : "已停止" }}
          </n-tag>
          <span v-if="botStatus.connected" class="connected-status">
            <n-icon size="14">
              <CheckCircleOutlined />
            </n-icon>
            已连接
          </span>
          <span v-else class="disconnected-status">
            <n-icon size="14">
              <CloseCircleOutlined />
            </n-icon>
            未连接
          </span>
          <n-tag type="info">索引 {{ botStatus.indexedCount || 0 }}</n-tag>
        </div>

        <div class="bot-meta">
          <div class="meta-item">
            频道：{{ botStatus.sourceChannelId || "未配置" }}
          </div>
          <div class="meta-item">
            索引文件：{{ botStatus.historyFilePath || "未生成" }}
          </div>
        </div>

        <div class="control-buttons">
          <n-button
            type="primary"
            :loading="isStarting"
            :disabled="botStatus.running"
            @click="handleStartBot"
          >
            <template #icon>
              <PlayCircleOutlined />
            </template>
            启动 Bot
          </n-button>

          <n-button
            type="error"
            :loading="isStopping"
            :disabled="!botStatus.running"
            @click="handleStopBot"
          >
            <template #icon>
              <StopOutlined />
            </template>
            停止 Bot
          </n-button>

          <n-button
            type="warning"
            :loading="isSyncingHistory"
            @click="handleSyncHistory"
          >
            <template #icon>
              <SyncOutlined />
            </template>
            获取频道消息并保存索引
          </n-button>
        </div>

        <div class="search-section">
          <n-input-group>
            <n-input
              v-model:value="searchRjCode"
              placeholder="请输入 RJ 号（如 RJ189111）"
              class="search-input"
              @keyup.enter="handleSearch"
            />
            <n-button
              type="primary"
              :loading="isSearching"
              @click="handleSearch"
            >
              <template #icon>
                <SearchOutlined />
              </template>
              搜索
            </n-button>
          </n-input-group>
        </div>

        <div v-if="searchResult" class="search-result">
          <n-card title="搜索结果" size="small" :bordered="false">
            <div v-if="searchResult.success" class="success-result">
              <n-icon size="20">
                <CheckCircleOutlined />
              </n-icon>
              <div class="result-content">
                <div class="result-message">{{ searchResult.message }}</div>
                <n-a
                  v-if="searchResult.url"
                  :href="searchResult.url"
                  target="_blank"
                  class="result-link"
                >
                  {{ searchResult.url }}
                </n-a>
              </div>
            </div>
            <div v-else class="error-result">
              <n-icon size="20">
                <ExclamationCircleOutlined />
              </n-icon>
              <div class="result-content">
                <div class="result-message">{{ searchResult.message }}</div>
              </div>
            </div>
          </n-card>
        </div>

        <div v-if="syncResult" class="sync-result">
          <n-card title="索引同步结果" size="small" :bordered="false">
            <div v-if="syncResult.success" class="success-result">
              <n-icon size="20">
                <CheckCircleOutlined />
              </n-icon>
              <div class="result-content">
                <div class="result-message">{{ syncResult.message }}</div>
                <div v-if="syncResult.historyFilePath" class="result-message">
                  索引文件：{{ syncResult.historyFilePath }}
                </div>
                <div v-if="syncResult.stats" class="result-message">
                  扫描 {{ syncResult.stats.scannedMessages }} 条消息，匹配
                  {{ syncResult.stats.matchedMessages }} 条，新增
                  {{ syncResult.stats.newCount }}，更新
                  {{ syncResult.stats.updatedCount }}
                </div>
                <div v-if="syncResult.stats" class="result-message">
                  前置包扫描
                  {{ syncResult.stats.presetScannedLines || 0 }} 行，命中
                  {{ syncResult.stats.presetMatchedLines || 0 }} 行，补充
                  {{ syncResult.stats.presetAdded || 0 }}，更新
                  {{ syncResult.stats.presetUpdated || 0 }}
                </div>
              </div>
            </div>
            <div v-else class="error-result">
              <n-icon size="20">
                <ExclamationCircleOutlined />
              </n-icon>
              <div class="result-content">
                <div class="result-message">
                  {{ syncResult.error || syncResult.message || "索引同步失败" }}
                </div>
              </div>
            </div>
          </n-card>
        </div>

        <div class="usage-section">
          <n-card title="使用说明" size="small" :bordered="false">
            <ul class="usage-list">
              <li>先点击“获取频道消息并保存索引”生成本地索引</li>
              <li>同步会合并“频道消息 + 前置包 TXT”到同一个索引文件</li>
              <li>输入 RJ 号（如 RJ189111），点击搜索</li>
              <li>
                群聊命令支持：/search@BotName RJ123456 或 @BotName /search
                RJ123456
              </li>
              <li>Bot 会先查历史索引，再查前置包内存索引（极速）</li>
              <li>命中前置包后会后台补充频道结果并更新历史索引</li>
              <li>如都未找到，会返回提示信息</li>
            </ul>
          </n-card>
        </div>
      </n-space>
    </n-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import {
  NCard,
  NInputGroup,
  NInput,
  NButton,
  NTag,
  NA, // 这里已将 NLink 改为 NA
  NIcon,
  useMessage,
} from "naive-ui";
import {
  PlayCircleOutlined,
  StopOutlined,
  SyncOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined, // 对应原 WarningCircle
} from "@vicons/antd";

const message = useMessage();

// Bot 状态
const botStatus = ref({
  running: false,
  connected: false,
});

// 控制加载状态
const isStarting = ref(false);
const isStopping = ref(false);
const isSearching = ref(false);
const isSyncingHistory = ref(false);

// 搜索相关
const searchRjCode = ref("");
const searchResult = ref(null);
const syncResult = ref(null);

// 获取 Bot 状态
const getBotStatus = async () => {
  try {
    const result = await window.api.tgBotStatus();
    botStatus.value = result || {
      running: false,
      connected: false,
      indexedCount: 0,
      historyFilePath: "",
      sourceChannelId: "",
    };
  } catch (error) {
    console.error("获取 Bot 状态失败:", error);
  }
};

// 启动 Bot
const handleStartBot = async () => {
  isStarting.value = true;
  try {
    const result = await window.api.tgBotStart();
    if (result.success) {
      message.success("Bot 启动成功");
      await getBotStatus();
    } else {
      message.error(result.error || "Bot 启动失败");
    }
  } catch (error) {
    message.error(`启动失败: ${error.message}`);
  } finally {
    isStarting.value = false;
  }
};

// 停止 Bot
const handleStopBot = async () => {
  isStopping.value = true;
  try {
    const result = await window.api.tgBotStop();
    if (result.success) {
      message.success("Bot 停止成功");
      await getBotStatus();
    } else {
      message.error(result.error || "Bot 停止失败");
    }
  } catch (error) {
    message.error(`停止失败: ${error.message}`);
  } finally {
    isStopping.value = false;
  }
};

// 处理搜索
const handleSearch = async () => {
  const rjCode = searchRjCode.value.trim();
  if (!rjCode) {
    message.warning("请输入 RJ 号");
    return;
  }

  isSearching.value = true;
  try {
    const result = await window.api.tgBotSearch(rjCode);
    searchResult.value = result;
  } catch (error) {
    searchResult.value = {
      success: false,
      message: `搜索失败: ${error.message}`,
    };
  } finally {
    isSearching.value = false;
  }
};

// 同步频道历史到 Bot 索引文件
const handleSyncHistory = async () => {
  isSyncingHistory.value = true;

  try {
    const result = await window.api.tgBotSyncHistory();

    syncResult.value = result;

    if (result?.success) {
      message.success(result.message || "索引同步成功");
      await getBotStatus();
    } else {
      message.error(result?.error || result?.message || "索引同步失败");
    }
  } catch (error) {
    syncResult.value = {
      success: false,
      error: `同步失败: ${error.message}`,
    };
    message.error(`同步失败: ${error.message}`);
  } finally {
    isSyncingHistory.value = false;
  }
};

// 组件挂载时获取 Bot 状态
onMounted(() => {
  getBotStatus();
});
</script>

<style scoped>
.tg-search-bot {
  max-width: 600px;
  margin: 0 auto;
}

.bot-card {
  margin-bottom: 20px;
}

.bot-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.bot-meta {
  margin-bottom: 16px;
}

.meta-item {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
  word-break: break-all;
}

.connected-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #00b42a;
  font-size: 14px;
}

.disconnected-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #f53f3f;
  font-size: 14px;
}

.control-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-section {
  margin-bottom: 20px;
}

.search-input {
  flex: 1;
}

.search-result {
  margin-top: 20px;
}

.sync-result {
  margin-top: 20px;
}

.success-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: #00b42a;
}

.error-result {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  color: #f53f3f;
}

.result-content {
  flex: 1;
}

.result-message {
  margin-bottom: 8px;
  font-size: 14px;
  line-height: 1.5;
}

.result-link {
  display: inline-block;
  font-size: 13px;
  color: #1890ff;
  word-break: break-all;
}

.usage-section {
  margin-top: 20px;
}

.usage-list {
  list-style-type: disc;
  padding-left: 20px;
  font-size: 14px;
  line-height: 1.8;
  color: #666;
}

.usage-list li {
  margin-bottom: 6px;
}
</style>
