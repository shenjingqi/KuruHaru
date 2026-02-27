<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">汉化列表</h2>
      <div class="header-actions">
        <button class="btn-secondary" @click="showHelp = true">使用说明</button>
      </div>
    </div>

    <!-- 数据源配置 -->
    <div class="config-section card">
      <h3 class="section-title">数据源配置</h3>

      <!-- 基准文件/手动导入 -->
      <div class="source-item">
        <div class="source-header">
          <span class="source-icon">📁</span>
          <span class="source-label">TXT导入（基准/手动）</span>
          <span v-if="txtRJCount > 0" class="badge-success"
            >{{ txtRJCount }} 个</span
          >
        </div>
        <p class="source-desc">
          拖入已有RJ/VJ/BJ列表.txt，或拖入其他TXT补充扫描RJ/VJ/BJ号（自动去重）
        </p>
        <div
          class="drop-zone"
          :class="{ active: isDraggingTxt }"
          @dragover.prevent="isDraggingTxt = true"
          @dragleave="isDraggingTxt = false"
          @drop.prevent="handleTxtDrop"
        >
          <input
            ref="txtFileInput"
            type="file"
            accept=".txt"
            multiple
            style="display: none"
            @change="handleTxtFileSelect"
          />
          <p v-if="txtRJCount === 0">
            拖入一个或多个TXT文件到这里，或点击选择文件
          </p>
          <p v-else>已加载 {{ txtRJCount }} 个RJ/VJ/BJ号，点击可继续添加</p>
        </div>
      </div>

      <!-- TG数据 -->
      <div class="source-item">
        <div class="source-header">
          <span class="source-icon">📱</span>
          <span class="source-label">TG讨论组数据</span>
          <span v-if="tgRJCount > 0" class="badge-info"
            >{{ tgRJCount }} 个</span
          >
          <span v-else class="badge-warning">未读取</span>
        </div>
        <button
          class="btn-secondary"
          :disabled="isLoadingTg"
          @click="loadTgData"
        >
          {{ isLoadingTg ? "读取中..." : "读取TG更新数据" }}
        </button>
      </div>

      <!-- API扫描 -->
      <div class="source-item">
        <div class="source-header">
          <span class="source-icon">🌐</span>
          <span class="source-label">API扫描（汉化/字幕/多语种）</span>
          <span v-if="apiRJCount > 0" class="badge-info"
            >{{ apiRJCount }} 个</span
          >
        </div>
        <div class="api-options">
          <label class="option-item">
            <span>停止条件：</span>
            <span class="stop-condition-text">连续5页无新数据</span>
          </label>
        </div>
        <div v-if="cacheStatus" class="cache-status">
          <span class="cache-info">{{ cacheStatus }}</span>
        </div>
        <!-- 自定义路径设置 -->
        <div class="path-setting">
          <span class="path-label">TXT路径：</span>
          <input
            v-model="txtFilePath"
            type="text"
            class="path-input"
            placeholder="留空则使用默认路径"
            @blur="savePathSetting"
          />
          <button class="btn-secondary btn-small" @click="selectPath">
            选择文件夹
          </button>
          <button
            v-if="txtFilePath"
            class="btn-secondary btn-small"
            @click="clearPathSetting"
          >
            恢复默认
          </button>
        </div>
        <button
          class="btn-secondary"
          :disabled="isScanningApi"
          @click="scanApi"
        >
          {{
            isScanningApi
              ? `扫描中... 第${scanProgress?.page || 0}页`
              : "开始API扫描"
          }}
        </button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="stats-section card">
      <h3 class="section-title">汇总统计</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">{{ txtRJCount }}</span>
          <span class="stat-label">TXT</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ tgRJCount }}</span>
          <span class="stat-label">TG</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ apiRJCount }}</span>
          <span class="stat-label">API</span>
        </div>
        <div class="stat-item highlight">
          <span class="stat-value">{{ totalUniqueCount }}</span>
          <span class="stat-label">去重后总计</span>
        </div>
      </div>
      <div v-if="newCount > 0" class="new-count">
        <span class="new-badge">+{{ newCount }} 个新增</span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="actions-section">
      <button
        class="btn-primary btn-large"
        :disabled="totalUniqueCount === 0"
        @click="exportList"
      >
        导出RJ/VJ/BJ列表.txt
      </button>
      <button class="btn-secondary" @click="clearAll">清除所有数据</button>
    </div>

    <!-- 使用说明弹窗 -->
    <div v-if="showHelp" class="modal-overlay" @click.self="showHelp = false">
      <div class="modal-content">
        <h3>汉化列表使用说明</h3>
        <div class="help-content">
          <h4>功能说明</h4>
          <p>本工具用于收集和管理所有汉化过的ASMR作品的RJ/VJ/BJ号。</p>

          <h4>数据来源</h4>
          <ul>
            <li>
              <strong>TXT导入</strong
              >：拖入已有的RJ/VJ/BJ列表.txt，或拖入其他TXT文件扫描RJ/VJ/BJ号（自动去重）
            </li>
            <li><strong>TG讨论组</strong>：读取Telegram讨论组最近更新的数据</li>
            <li>
              <strong>API扫描</strong>：扫描 api.asmr-200.com
              上带字幕/多语种标签的作品
            </li>
          </ul>

          <h4>使用流程</h4>
          <ol>
            <li>先加载已有的RJ/VJ/BJ列表作为基准（避免重复）</li>
            <li>点击"读取TG更新数据"</li>

            <li>点击"开始API扫描"（自动停止，无需人工干预）</li>
            <li>如有其他TXT，可拖入补充</li>
            <li>点击"导出RJ列表.txt"下载最终结果</li>
          </ol>

          <h4>汉化判断标准</h4>
          <ul>
            <li>作品标注"有字幕"（has_subtitle=true）</li>
            <li>包含非日语语言版本（简体中文/繁体中文/韩语/英语）</li>
          </ul>
        </div>
        <button class="btn-primary" @click="showHelp = false">知道了</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";

// 状态
const txtRJCount = ref(0);
const tgRJCount = ref(0);
const apiRJCount = ref(0);
const isLoadingTg = ref(false);
const isScanningApi = ref(false);
const showHelp = ref(false);
const isDraggingTxt = ref(false);
const cacheStatus = ref("");
const txtFilePath = ref("");

// 数据存储（使用单一Set存储所有来源的RJ号）
const txtSet = ref(new Set());
const tgSet = ref(new Set());
const apiSet = ref(new Set());

// 进度
const scanProgress = ref({ page: 0, status: "" });

// 计算属性
const totalUniqueCount = computed(() => {
  const all = new Set([...txtSet.value, ...tgSet.value, ...apiSet.value]);
  return all.size;
});

const newCount = computed(() => {
  // 新增 = 总数 - TXT基准
  const total = totalUniqueCount.value;
  const base = txtRJCount.value;
  return total > base ? total - base : 0;
});

// 正则提取RJ/VJ/BJ号
const extractRJCodes = (text) => {
  // 支持 RJ/VJ/BJ 号
  const rjPattern = /(RJ|VJ|BJ)\d{6,8}/gi;
  const matches = text.match(rjPattern) || [];
  return [...new Set(matches.map((m) => m.toUpperCase()))];
};

// 读取文件内容
const readFileContent = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file, "UTF-8");
  });
};

// TXT导入（支持多个文件）
const loadTxtFiles = async (files) => {
  let totalImported = 0;

  for (const file of files) {
    if (!file.name.endsWith(".txt")) continue;

    try {
      const content = await readFileContent(file);
      const rjCodes = extractRJCodes(content);
      const upperCodes = rjCodes.map((r) => r.toUpperCase());

      const newSet = new Set([...txtSet.value, ...upperCodes]);
      txtSet.value = newSet;
      txtRJCount.value = newSet.size;

      totalImported += upperCodes.length;
    } catch (e) {
      console.error(`读取 ${file.name} 失败:`, e);
    }
  }

  // 保存到后端文件
  if (txtSet.value.size > 0) {
    const allRjCodes = [...txtSet.value];
    await window.api?.asmrWriteChineseList?.(allRjCodes);
  }

  console.log(
    `已导入 ${totalImported} 个RJ号（合并后共 ${txtSet.value.size} 个）`,
  );
};

const handleTxtDrop = async (e) => {
  isDraggingTxt.value = false;
  const files = Array.from(e.dataTransfer.files).filter((f) =>
    f.name.endsWith(".txt"),
  );
  if (files.length > 0) {
    await loadTxtFiles(files);
  } else {
    alert("请选择TXT文件");
  }
};

const handleTxtFileSelect = async (e) => {
  const files = Array.from(e.target.files).filter((f) =>
    f.name.endsWith(".txt"),
  );
  if (files.length > 0) {
    await loadTxtFiles(files);
  }
};

// 加载TG数据
const loadTgData = async () => {
  isLoadingTg.value = true;
  try {
    const result = await window.api?.tgReadRecentActivity?.();
    if (
      result &&
      result.success &&
      result.data &&
      Array.isArray(result.data.files)
    ) {
      const rjCodes = result.data.files
        .map((f) => f.rjCode)
        .filter(Boolean)
        .map((rj) => rj.toUpperCase());
      // 与已有数据去重
      const existing = new Set([
        ...txtSet.value,
        ...tgSet.value,
        ...apiSet.value,
      ]);
      const newCodes = rjCodes.filter((code) => !existing.has(code));
      tgSet.value = new Set([...tgSet.value, ...newCodes]);
      tgRJCount.value = tgSet.value.size;
    } else {
      alert("读取TG数据失败或无数据");
    }
  } catch (e) {
    console.error("读取TG数据失败:", e);
    alert("读取TG数据失败");
  } finally {
    isLoadingTg.value = false;
  }
};

// API扫描
const scanApi = async () => {
  if (isScanningApi.value) return;
  isScanningApi.value = true;
  apiSet.value = new Set();
  apiRJCount.value = 0;

  // 设置进度监听
  const progressHandler = (event, progress) => {
    scanProgress.value = progress;
  };
  window.api?.on?.("chinese-list-progress", progressHandler);

  try {
    const result = await window.api?.asmrFetchChineseWorks?.();

    if (result && result.success) {
      // 处理无新增的情况
      if (result.message === "无新增内容") {
        apiSet.value = new Set(result.data.map((rj) => rj.toUpperCase()));
        apiRJCount.value = result.data.length;
        cacheStatus.value = `✓ 已是最新数据，共扫描 ${apiRJCount.value} 个`;
        return;
      }

      // API结果显示在API栏
      const existing = new Set([
        ...txtSet.value,
        ...tgSet.value,
        ...apiSet.value,
      ]);
      const newCodes = result.data.filter(
        (rj) => !existing.has(rj.toUpperCase()),
      );
      apiSet.value = new Set(newCodes.map((rj) => rj.toUpperCase()));
      apiRJCount.value = apiSet.value.size;
      cacheStatus.value = `✓ 扫描完成，新增 ${newCodes.length} 个`;
    } else {
      alert(`API扫描失败: ${result?.error || "未知错误"}`);
      cacheStatus.value = "";
    }
  } catch (e) {
    console.error("API扫描失败:", e);
    alert("API扫描过程出错");
    cacheStatus.value = "";
  } finally {
    isScanningApi.value = false;
    scanProgress.value = {};
    window.api?.removeListener?.("chinese-list-progress", progressHandler);
  }
};

// 导出
const exportList = () => {
  const all = [...txtSet.value, ...tgSet.value, ...apiSet.value];
  const unique = [...new Set(all)].sort();

  const content = unique.join("\n");
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `RJ列表_${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
};

// 清除
const clearAll = () => {
  if (confirm("确定要清除所有数据吗？")) {
    txtSet.value = new Set();
    tgSet.value = new Set();
    apiSet.value = new Set();
    txtRJCount.value = 0;
    tgRJCount.value = 0;
    apiRJCount.value = 0;
  }
};

// 初始化时获取当前路径设置
const initPathSetting = async () => {
  try {
    const result = await window.api?.asmrGetChineseListPath?.();
    if (result) {
      txtFilePath.value = result.isCustom ? result.path : "";
    }
  } catch (e) {
    console.error("获取汉化列表路径失败:", e);
  }
};

// 选择TXT文件夹路径
const selectPath = async () => {
  try {
    const result = await window.api?.dialogOpenDirectory?.();
    if (result && !result.canceled && result.filePath) {
      txtFilePath.value = result.filePath;
      await savePathSetting();
    }
  } catch (e) {
    console.error("选择文件夹失败:", e);
  }
};

// 保存路径设置
const savePathSetting = async () => {
  try {
    await window.api?.asmrSetChineseListPath?.(txtFilePath.value);
  } catch (e) {
    console.error("保存路径设置失败:", e);
  }
};

// 清除路径设置（恢复默认）
const clearPathSetting = async () => {
  txtFilePath.value = "";
  await savePathSetting();
};

// 组件挂载时初始化
initPathSetting();
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  box-sizing: border-box;
}

.page-header {
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #262626;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 16px 20px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #262626;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.source-item {
  margin-bottom: 16px;
}

.source-item:last-child {
  margin-bottom: 0;
}

.source-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.source-icon {
  font-size: 16px;
}

.source-label {
  font-size: 14px;
  color: #333;
}

.source-desc {
  font-size: 12px;
  color: #999;
  margin: 0 0 8px 0;
}

.drop-zone {
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
}

.drop-zone:hover,
.drop-zone.active {
  border-color: #1890ff;
  background: #e6f7ff;
}

.drop-zone p {
  margin: 0;
  font-size: 13px;
  color: #999;
}

.api-options {
  margin-bottom: 8px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #666;
}

.option-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.stop-condition-text {
  font-size: 13px;
  color: #666;
}

.cache-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
}

.cache-info {
  font-size: 13px;
  color: #666;
}

.btn-warning {
  background: #fa8c16;
  color: #fff;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.btn-warning:hover {
  background: #d46b08;
}

.select-small {
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
}

.path-setting {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 6px;
}

.path-label {
  font-size: 13px;
  color: #666;
  white-space: nowrap;
}

.path-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 12px;
  color: #333;
}

.btn-small {
  padding: 4px 8px;
  font-size: 12px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 12px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
}

.stat-item.highlight {
  background: #e6f7ff;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 600;
  color: #1890ff;
}

.stat-item.highlight .stat-value {
  color: #52c41a;
}

.stat-label {
  font-size: 12px;
  color: #999;
}

.new-count {
  text-align: center;
}

.new-badge {
  display: inline-block;
  padding: 4px 12px;
  background: #52c41a;
  color: #fff;
  border-radius: 12px;
  font-size: 13px;
}

.badge-success {
  display: inline-block;
  padding: 2px 8px;
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  border-radius: 4px;
  font-size: 12px;
  color: #52c41a;
}

.badge-info {
  display: inline-block;
  padding: 2px 8px;
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  border-radius: 4px;
  font-size: 12px;
  color: #1890ff;
}

.badge-warning {
  display: inline-block;
  padding: 2px 8px;
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 4px;
  font-size: 12px;
  color: #fa8c16;
}

.actions-section {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px 0;
}

.btn-primary {
  background: #1890ff;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-primary:hover {
  background: #40a9ff;
}

.btn-primary:disabled {
  background: #d9d9d9;
  cursor: not-allowed;
}

.btn-secondary {
  background: #fff;
  color: #333;
  border: 1px solid #d9d9d9;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.btn-secondary:hover {
  color: #1890ff;
  border-color: #1890ff;
}

.btn-secondary:disabled {
  color: #d9d9d9;
  border-color: #d9d9d9;
  cursor: not-allowed;
}

.btn-large {
  padding: 12px 32px;
  font-size: 16px;
}

/* 弹窗 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
}

.help-content h4 {
  font-size: 14px;
  margin: 16px 0 8px 0;
  color: #333;
}

.help-content p,
.help-content li {
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}

.help-content ul,
.help-content ol {
  padding-left: 20px;
}

.help-content li {
  margin-bottom: 4px;
}
</style>
