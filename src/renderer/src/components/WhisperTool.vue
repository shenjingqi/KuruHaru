<template>
  <div class="page-container whisper-theme">
    <div class="page-header">
      <h2 class="page-title">音声翻译</h2>
      <div class="status-tag" :class="{ running: store.isBusy }">
        {{ statusText }}
      </div>
    </div>

    <div class="content-box card">
      <div class="setting-row">
        <div class="label">引擎路径</div>
        <div class="input-wrap">
          <input v-model="localExePath" class="input" readonly />
          <button class="btn-secondary" @click="selectExe">选择</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="label">媒体目录</div>
        <div class="input-wrap">
          <input v-model="targetPath" class="input" readonly />
          <button class="btn-secondary" @click="selectTarget">选择</button>
        </div>
      </div>
      <div class="setting-row">
        <div class="label">格式</div>
        <div class="tags-group">
          <label
            v-for="fmt in ['lrc', 'srt', 'vtt']"
            :key="fmt"
            class="tag-checkbox"
          >
            <input v-model="subFormats" type="checkbox" :value="fmt" />
            <span class="tag-body">{{ fmt.toUpperCase() }}</span>
          </label>
        </div>
      </div>

      <div class="action-footer">
        <button
          class="btn-primary"
          :disabled="store.isBusy || !canStart"
          @click="startTranslate"
        >
          开始翻译
        </button>
        <button
          v-if="store.isBusy"
          class="btn-secondary"
          @click="showProgressModal = true"
        >
          查看进度
        </button>
      </div>
    </div>

    <!-- 进度页面模态框 -->
    <Teleport to="body">
      <div v-if="showProgressModal" class="modal-mask">
        <div class="progress-modal-box">
          <WhisperProgress
            :is-busy="store.isBusy"
            @close="handleCloseProgress"
          />
        </div>
      </div>
    </Teleport>

    <!-- 结果弹窗 -->
    <div v-if="showResultModal" class="modal-mask">
      <div class="modal-box card">
        <div class="modal-icon">{{ resultData.success ? "✓" : "!" }}</div>
        <h3>{{ resultData.title }}</h3>
        <button class="btn-primary full" @click="showResultModal = false">
          关闭
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import WhisperProgress from "./WhisperProgress.vue";
import { useWhisperToolWorkflow } from "../composables/useWhisperToolWorkflow";

const {
  store,
  localExePath,
  targetPath,
  subFormats,
  canStart,
  showProgressModal,
  showResultModal,
  resultData,
  statusText,
  selectExe,
  selectTarget,
  startTranslate,
  handleCloseProgress,
} = useWhisperToolWorkflow();
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
  color: #26251f;
}

.status-tag {
  font-size: 13px;
  padding: 6px 14px;
  border-radius: 20px;
  background: #f2ede0;
  color: #86806f;
  border: 1px solid #d8d0bb;
}

.status-tag.running {
  color: #adb571;
  border-color: #adb571;
  background: #e8f1fa;
  font-weight: 500;
}

.content-box {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.label {
  font-size: 14px;
  font-weight: 500;
  color: #66614f;
}

.input-wrap {
  display: flex;
  gap: 10px;
}

.input {
  flex: 1;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid #d8d0bb;
  outline: none;
  font-size: 14px;
  color: #26251f;
  background: #fff;
}

.input:focus {
  border-color: #adb571;
}

.input:readonly {
  color: #86806f;
  background: #f7f2e8;
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

.btn-secondary {
  padding: 12px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  color: #66614f;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  background: #f2ede0;
}

.btn-secondary:hover {
  background: #d8d0bb;
}

.tags-group {
  display: flex;
  gap: 10px;
}

.tag-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.tag-checkbox input {
  display: none;
}

.tag-body {
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  background: #f2ede0;
  color: #86806f;
  transition: all 0.2s ease;
}

.tag-checkbox input:checked + .tag-body {
  background: #adb571;
  color: #fff;
}

.action-footer {
  margin-top: auto;
  display: flex;
  gap: 12px;
}

.action-footer .btn-primary,
.action-footer .btn-secondary {
  flex: 1;
  padding: 14px;
}

.card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  border: 1px solid #d8d0bb;
}

/* 进度页面模态框 */
.progress-modal-box {
  width: 90%;
  max-width: 900px;
  height: 80vh;
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* 结果弹窗 */
.modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99;
}

.modal-box {
  width: 380px;
  padding: 24px;
  text-align: center;
}

.modal-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.modal-box h3 {
  margin: 0 0 20px;
  font-size: 18px;
  font-weight: 500;
  color: #26251f;
}

.btn-full {
  width: 100%;
}
</style>
