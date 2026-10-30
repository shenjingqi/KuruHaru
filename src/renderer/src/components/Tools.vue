<template>
  <div class="page-container tools-theme">
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

      <div class="tool-card card">
        <div class="tool-header">
          <span class="tool-icon">🗑️</span>
          <h3 class="tool-name">清理最近上传字幕</h3>
        </div>
        <p class="tool-desc">
          根据最近上传缓存，删除本地字幕压缩包及对应 RJ/VJ/BJ 文件夹
        </p>

        <div class="tool-form">
          <div class="form-row">
            <label class="form-label">字幕压缩包目录</label>
            <div class="input-wrap">
              <input
                v-model="recentUploadArchiveDir"
                class="input"
                readonly
                placeholder="选择打包后的字幕 zip 所在目录"
              />
              <button
                class="btn-secondary"
                @click="selectRecentUploadArchiveDir"
              >
                选择
              </button>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">字幕文件夹根目录</label>
            <div class="input-wrap">
              <input
                v-model="recentUploadSubtitleDir"
                class="input"
                readonly
                placeholder="选择字幕文件夹根目录"
              />
              <button
                class="btn-secondary"
                @click="selectRecentUploadSubtitleDir"
              >
                选择
              </button>
            </div>
          </div>

          <div class="form-row checkbox-row">
            <label class="checkbox-label">
              <input
                v-model="shouldDeleteRecentUploadedFiles"
                type="checkbox"
                class="checkbox"
              />
              <span>实际删除最近上传字幕和文件夹（否则仅预览）</span>
            </label>
          </div>

          <button
            class="btn-primary full"
            :disabled="
              !recentUploadArchiveDir ||
              !recentUploadSubtitleDir ||
              isCleaningRecentUploaded
            "
            @click="cleanRecentUploadedSubtitles"
          >
            {{
              isCleaningRecentUploaded
                ? "处理中..."
                : shouldDeleteRecentUploadedFiles
                  ? "开始清理并删除"
                  : "预览最近上传清理"
            }}
          </button>

          <div v-if="recentUploadCleanupResult" class="result-box">
            <p>{{ recentUploadCleanupResult }}</p>
          </div>

          <div v-if="recentUploadCleanupDetails" class="result-box">
            <pre>{{ recentUploadCleanupDetails }}</pre>
          </div>
        </div>
      </div>

      <div class="tool-card card">
        <div class="tool-header">
          <span class="tool-icon">🔁</span>
          <h3 class="tool-name">SRT / LRC 互转</h3>
        </div>
        <p class="tool-desc">
          支持单文件互转，也可批量扫描目录内的字幕文件并输出到目标目录
        </p>

        <div class="tool-form">
          <div class="form-row">
            <label class="form-label">源文件或目录</label>
            <div class="input-wrap input-wrap-stack">
              <input
                v-model="subtitleConvertSourcePath"
                class="input"
                readonly
                placeholder="选择 .srt / .lrc 文件，或选择字幕目录"
              />
              <div class="action-row">
                <button
                  class="btn-secondary"
                  @click="selectSubtitleConvertSourcePath"
                >
                  选文件
                </button>
                <button
                  class="btn-secondary"
                  @click="selectSubtitleConvertSourceDir"
                >
                  选目录
                </button>
              </div>
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">目标格式</label>
            <select v-model="subtitleConvertTargetFormat" class="input select">
              <option value="srt">SRT</option>
              <option value="lrc">LRC</option>
            </select>
          </div>

          <div class="form-row">
            <label class="form-label">输出目录</label>
            <div class="input-wrap">
              <input
                v-model="subtitleConvertOutputPath"
                class="input"
                readonly
                placeholder="默认输出到源文件同目录 / 源目录"
              />
              <button
                class="btn-secondary"
                @click="selectSubtitleConvertOutputPath"
              >
                选择
              </button>
            </div>
          </div>

          <button
            class="btn-primary full"
            :disabled="!subtitleConvertSourcePath || isConvertingSubtitle"
            @click="convertSubtitleFormat"
          >
            {{ isConvertingSubtitle ? "转换中..." : "开始转换" }}
          </button>

          <div v-if="subtitleConvertResult" class="result-box">
            <p>{{ subtitleConvertResult }}</p>
          </div>

          <div v-if="subtitleConvertDetails" class="result-box">
            <pre>{{ subtitleConvertDetails }}</pre>
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
import { useToolsWorkflow } from "../composables/useToolsWorkflow";

const {
  sourceDir,
  outputPath,
  outputFileName,
  isProcessing,
  extractResult,
  mainFile,
  compareDir,
  isCleaning,
  cleanResult,
  deletedCodes,
  shouldDeleteFiles,
  recentUploadArchiveDir,
  recentUploadSubtitleDir,
  shouldDeleteRecentUploadedFiles,
  isCleaningRecentUploaded,
  recentUploadCleanupResult,
  recentUploadCleanupDetails,
  subtitleConvertSourcePath,
  subtitleConvertOutputPath,
  subtitleConvertTargetFormat,
  isConvertingSubtitle,
  subtitleConvertResult,
  subtitleConvertDetails,
  zipMediaPath,
  zipOutputPath,
  isZipping,
  zipResult,
  selectSourceDir,
  selectOutputPath,
  extractFileNames,
  selectMainFile,
  selectCompareDir,
  cleanData,
  selectRecentUploadArchiveDir,
  selectRecentUploadSubtitleDir,
  cleanRecentUploadedSubtitles,
  selectSubtitleConvertSourcePath,
  selectSubtitleConvertSourceDir,
  selectSubtitleConvertOutputPath,
  convertSubtitleFormat,
  selectZipMediaPath,
  selectZipOutputPath,
  startZipSubtitles,
} = useToolsWorkflow();
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
  color: #26251f;
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
  color: #26251f;
}

.tool-desc {
  font-size: 14px;
  color: #86806f;
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
  color: #66614f;
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
  color: #66614f;
}

.input-wrap {
  display: flex;
  gap: 8px;
}

.input-wrap-stack {
  flex-direction: column;
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #d8d0bb;
  background: #fff;
  font-size: 14px;
  outline: none;
  color: #26251f;
  min-height: 44px;
}

.input:focus {
  border-color: #adb571;
}

.input:readonly {
  background: #f7f2e8;
  color: #86806f;
}

.textarea {
  min-height: 120px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #d8d0bb;
  background: #fff;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  color: #26251f;
  resize: vertical;
}

.textarea:focus {
  border-color: #adb571;
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
  background: #adb571;
}

.btn-primary:hover:not(:disabled) {
  background: #0d5da3;
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
  color: #66614f;
  font-size: 14px;
  font-weight: 500;
  background: #f2ede0;
  white-space: nowrap;
  min-height: 44px;
}

.btn-secondary:hover:not(:disabled) {
  background: #d8d0bb;
}

.result-box {
  padding: 12px;
  background: #f7f2e8;
  border-radius: 8px;
  font-size: 13px;
  color: #66614f;
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
  background: #d8d0bb;
  border-radius: 3px;
}

.result-box::-webkit-scrollbar-thumb:hover {
  background: #d4d4d4;
}

.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #d8d0bb;
}

@media (max-width: 767px) {
  .tools-grid {
    grid-template-columns: 1fr;
  }

  .input-wrap {
    flex-direction: column;
  }

  .btn-secondary {
    width: 100%;
  }
}
</style>
