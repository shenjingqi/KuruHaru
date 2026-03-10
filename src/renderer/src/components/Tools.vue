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

.input {
  flex: 1;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #d8d0bb;
  background: #fff;
  font-size: 14px;
  outline: none;
  color: #26251f;
}

.input:focus {
  border-color: #adb571;
}

.input:readonly {
  background: #f7f2e8;
  color: #86806f;
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
</style>
