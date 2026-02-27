<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">工具箱</h2>
    </div>

    <div class="tools-grid">
      <!-- 提取文件名工具 -->
      <div class="tool-card card">
        <div class="tool-header">
          <span class="tool-icon">📦</span>
          <h3 class="tool-name">提取文件名</h3>
        </div>
        <p class="tool-desc">
          从指定目录提取所有zip文件名和文件夹名，写入txt文档
        </p>

        <div class="tool-form">
          <div class="form-row">
            <label class="form-label">源目录</label>
            <div class="input-wrap">
              <input
                v-model="sourceDir"
                class="input"
                readonly
                placeholder="选择要扫描的目录"
              />
              <button class="btn-secondary" @click="selectSourceDir">
                选择
              </button>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">输出路径</label>
            <div class="input-wrap">
              <input
                v-model="outputPath"
                class="input"
                readonly
                placeholder="默认输出到源目录"
              />
              <button class="btn-secondary" @click="selectOutputPath">
                选择
              </button>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">输出文件名</label>
            <input
              v-model="outputFileName"
              class="input"
              placeholder="filelist.txt"
            />
          </div>

          <button
            class="btn-primary full"
            :disabled="!sourceDir || isProcessing"
            @click="extractFileNames"
          >
            {{ isProcessing ? "处理中..." : "开始提取" }}
          </button>

          <div v-if="extractResult" class="result-box">
            <p>{{ extractResult }}</p>
          </div>
        </div>
      </div>

      <!-- 数据清洗工具 -->
      <div class="tool-card card">
        <div class="tool-header">
          <span class="tool-icon">🧹</span>
          <h3 class="tool-name">数据清洗</h3>
        </div>
        <p class="tool-desc">以主文件为参照，去重后输出到目标文件</p>

        <div class="tool-form">
          <div class="form-row">
            <label class="form-label">主文件 (参照)</label>
            <div class="input-wrap">
              <input
                v-model="mainFile"
                class="input"
                readonly
                placeholder="选择主文件txt"
              />
              <button class="btn-secondary" @click="selectMainFile">
                选择
              </button>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">要比对的文件夹</label>
            <div class="input-wrap">
              <input
                v-model="compareDir"
                class="input"
                readonly
                placeholder="选择包含zip文件的文件夹"
              />
              <button class="btn-secondary" @click="selectCompareDir">
                选择
              </button>
            </div>
          </div>

          <div class="form-row checkbox-row">
            <label class="checkbox-label">
              <input
                v-model="shouldDeleteFiles"
                type="checkbox"
                class="checkbox"
              />
              <span>实际删除重复文件（否则仅预览）</span>
            </label>
          </div>

          <button
            class="btn-primary full"
            :disabled="!mainFile || !compareDir || isCleaning"
            @click="cleanData"
          >
            {{
              isCleaning
                ? "处理中..."
                : shouldDeleteFiles
                  ? "开始清洗并删除"
                  : "预览清洗结果"
            }}
          </button>

          <div v-if="cleanResult" class="result-box">
            <p>{{ cleanResult }}</p>
          </div>

          <div
            v-if="deletedCodes.length > 0"
            class="result-box"
            style="margin-top: 12px"
          >
            <p style="font-weight: 600; color: #ef4444">
              🗑️ 被删除的RJ/VJ/BJ号 ({{ deletedCodes.length }}个):
            </p>
            <pre style="max-height: 200px; overflow-y: auto">{{
              deletedCodes.join("\n")
            }}</pre>
          </div>
        </div>
      </div>

      <!-- 打包字幕工具 -->

      <div class="tool-card card">
        <div class="tool-header">
          <span class="tool-icon">📦</span>
          <h3 class="tool-name">打包字幕</h3>
        </div>
        <p class="tool-desc">将媒体目录下的字幕文件打包成zip</p>

        <div class="tool-form">
          <div class="form-row">
            <label class="form-label">媒体目录</label>
            <div class="input-wrap">
              <input
                v-model="zipMediaPath"
                class="input"
                readonly
                placeholder="选择字幕所在目录"
              />
              <button class="btn-secondary" @click="selectZipMediaPath">
                选择
              </button>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">输出目录</label>
            <div class="input-wrap">
              <input
                v-model="zipOutputPath"
                class="input"
                readonly
                placeholder="选择输出目录"
              />
              <button class="btn-secondary" @click="selectZipOutputPath">
                选择
              </button>
            </div>
          </div>

          <button
            class="btn-primary full"
            :disabled="!zipMediaPath || isZipping"
            @click="startZipSubtitles"
          >
            {{ isZipping ? "打包中..." : "开始打包" }}
          </button>

          <div v-if="zipResult" class="result-box">
            <pre>{{ zipResult }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";

// 提取文件名功能
const sourceDir = ref("");
const outputPath = ref("");
const outputFileName = ref("filelist.txt");
const isProcessing = ref(false);
const extractResult = ref("");

// 数据清洗功能
const mainFile = ref("");
const compareDir = ref("");
const isCleaning = ref(false);
const cleanResult = ref("");
const deletedCodes = ref([]);
const shouldDeleteFiles = ref(false); // 是否实际删除文件

// 打包字幕功能
const zipMediaPath = ref("");
const zipOutputPath = ref("");
const isZipping = ref(false);
const zipResult = ref("");

onMounted(async () => {
  const result = await window.api.invoke("get-config");
  const cfg = result?.data || result;
  if (cfg?.paths?.toolOutputDir) {
    outputPath.value = cfg.paths.toolOutputDir;
    zipOutputPath.value = cfg.paths.toolOutputDir;
  }
  if (cfg?.whisper?.targetPath) {
    zipMediaPath.value = cfg.whisper.targetPath;
  }
});

// 提取文件名相关
const selectSourceDir = async () => {
  const res = await window.api.dialogOpenDirectory();
  if (res && res.filePath) {
    sourceDir.value = res.filePath;
    if (!outputPath.value) {
      outputPath.value = res.filePath;
    }
  }
};

const selectOutputPath = async () => {
  const res = await window.api.dialogOpenDirectory();
  if (res && res.filePath) {
    outputPath.value = res.filePath;
  }
};

const extractFileNames = async () => {
  if (!sourceDir.value) return;

  isProcessing.value = true;
  extractResult.value = "";

  try {
    const res = await window.api.invoke("extract-file-names", {
      sourceDir: sourceDir.value,
      outputDir: outputPath.value || sourceDir.value,
      fileName: outputFileName.value || "filelist.txt",
    });

    if (res.success) {
      extractResult.value = `✅ 完成！${res.fileCount} 个文件名已写入 ${res.outputPath}`;
      // 保存源目录和输出路径到配置文件夹下的 config.json
      await window.api.invoke("save-custom-paths", {
        sourceDir: sourceDir.value,
        toolOutputDir: outputPath.value || sourceDir.value,
      });
    } else {
      extractResult.value = `❌ 失败: ${res.msg}`;
    }
  } catch (e) {
    extractResult.value = `❌ 错误: ${e.message}`;
  } finally {
    isProcessing.value = false;
  }
};

// 数据清洗相关
const selectMainFile = async () => {
  const res = await window.api.dialogOpenFile({
    type: "file",
    filters: [{ name: "TXT", extensions: ["txt"] }],
  });
  if (res && res.filePath) {
    mainFile.value = res.filePath;
  }
};

const selectCompareDir = async () => {
  const res = await window.api.dialogOpenDirectory();
  if (res && res.filePath) {
    compareDir.value = res.filePath;
  }
};

const cleanData = async () => {
  if (!mainFile.value || !compareDir.value) return;

  isCleaning.value = true;
  cleanResult.value = "";
  deletedCodes.value = [];

  try {
    console.log("[cleanData] 发送请求:", {
      mainFile: mainFile.value,
      compareDir: compareDir.value,
      deleteFiles: shouldDeleteFiles.value,
      shouldDeleteFilesType: typeof shouldDeleteFiles.value,
    });

    const res = await window.api.invoke("clean-data", {
      mainFile: mainFile.value,
      compareDir: compareDir.value,
      deleteFiles: shouldDeleteFiles.value === true, // 确保是布尔值
    });

    console.log("[cleanData] 收到响应:", res);

    if (res.success) {
      const actionText = res.actuallyDeleted ? "已删除" : "预览";
      cleanResult.value = `✅ ${actionText}完成！扫描 ${res.zipFileCount} 个zip文件，发现 ${res.deletedCount} 个重复文件，保留 ${res.cleanedCount} 个`;
      deletedCodes.value = res.deletedCodes || [];
    } else {
      cleanResult.value = `❌ 失败: ${res.msg}`;
    }
  } catch (e) {
    cleanResult.value = `❌ 错误: ${e.message}`;
  } finally {
    isCleaning.value = false;
  }
};

// 打包字幕相关
const selectZipMediaPath = async () => {
  const res = await window.api.dialogOpenDirectory();
  if (res && res.filePath) {
    zipMediaPath.value = res.filePath;
  }
};

const selectZipOutputPath = async () => {
  const res = await window.api.dialogOpenDirectory();
  if (res && res.filePath) {
    zipOutputPath.value = res.filePath;
  }
};

const startZipSubtitles = async () => {
  if (!zipMediaPath.value) return;

  isZipping.value = true;
  zipResult.value = "";

  try {
    const res = await window.api.invoke("zip-subtitles", {
      targetPath: zipMediaPath.value,
      outputDir: zipOutputPath.value || zipMediaPath.value,
    });

    if (res.success) {
      // 🟢 显示打包摘要和详细信息
      let summary = `✅ ${res.msg}\n\n`;
      if (res.results && res.results.length > 0) {
        summary += "详细结果:\n";
        res.results.forEach((r, i) => {
          summary += `${i + 1}. ${r}\n`;
        });
      }
      zipResult.value = summary;
      // 保存路径到配置
      await window.api.invoke("save-custom-paths", {
        whisperTargetPath: zipMediaPath.value,
        toolOutputDir: zipOutputPath.value || zipMediaPath.value,
      });
    } else {
      zipResult.value = `❌ 失败: ${res.msg || "未知错误"}`;
    }
  } catch (e) {
    zipResult.value = `❌ 错误: ${e.message}`;
  } finally {
    isZipping.value = false;
  }
};
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  box-sizing: border-box;
}

.page-header {
  padding: 16px 20px;
  background: #fff;
  border-radius: 12px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #262626;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
}

.tool-card {
  padding: 20px;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.tool-icon {
  font-size: 28px;
}

.tool-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #262626;
}

.tool-desc {
  font-size: 14px;
  color: #737373;
  margin: 0 0 20px;
}

.tool-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-row.checkbox-row {
  flex-direction: row;
  align-items: center;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #525252;
  cursor: pointer;
}

.checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: #525252;
}

.input-wrap {
  display: flex;
  gap: 8px;
}

.input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  background: #fff;
  font-size: 14px;
  outline: none;
  color: #262626;
}

.input:focus {
  border-color: #8b5cf6;
}

.input:readonly {
  background: #fafafa;
  color: #737373;
}

.btn-primary {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  background: #8b5cf6;
}

.btn-primary:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-primary:disabled {
  background: #d4d4d4;
  cursor: not-allowed;
}

.btn-primary.full {
  width: 100%;
}

.btn-secondary {
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: #525252;
  font-size: 14px;
  font-weight: 500;
  background: #f5f5f5;
  white-space: nowrap;
}

.btn-secondary:hover:not(:disabled) {
  background: #e5e5e5;
}

.result-box {
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
  font-size: 13px;
  color: #525252;
  max-height: 200px;
  overflow-y: auto;
}

.result-box pre {
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.result-box::-webkit-scrollbar {
  width: 6px;
}

.result-box::-webkit-scrollbar-track {
  background: transparent;
}

.result-box::-webkit-scrollbar-thumb {
  background: #e5e5e5;
  border-radius: 3px;
}

.result-box::-webkit-scrollbar-thumb:hover {
  background: #d4d4d4;
}

.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e5e5;
}
</style>
