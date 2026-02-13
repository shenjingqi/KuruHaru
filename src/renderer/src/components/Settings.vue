<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">设置</h2>
      <span class="auto-save-status">✓ 自动保存已启用</span>
    </div>

    <div class="settings-container">
      <!-- 账户状态 -->
      <div class="section card">
        <div class="section-header" @click="togglePanel('accountStatus')">
          <span class="section-icon">👤</span>
          <h3 class="section-title">账户状态</h3>
          <span class="expand-icon">{{ expandedPanels.accountStatus ? '−' : '+' }}</span>
        </div>
        <div v-show="expandedPanels.accountStatus" class="section-body">
          <div class="status-grid">
            <div class="status-card" :class="{ connected: tgConnected }">
              <div class="status-top">
                <span class="status-icon">✈️</span>
                <span class="status-name">Telegram</span>
                <span class="status-badge" :class="tgConnected ? 'online' : 'offline'">
                  {{ tgConnected ? '已连接' : '未连接' }}
                </span>
              </div>
              <div v-if="tgConnected" class="status-info">{{ config.tg.phone }}</div>
            </div>
            <div class="status-card" :class="{ connected: asmrLoggedIn }">
              <div class="status-top">
                <span class="status-icon">🌐</span>
                <span class="status-name">ASMR.ONE</span>
                <span class="status-badge" :class="asmrLoggedIn ? 'online' : 'offline'">
                  {{ asmrLoggedIn ? '已登录' : '未登录' }}
                </span>
              </div>
              <div v-if="asmrLoggedIn" class="status-info">{{ config.asmr.username }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Telegram 设置 -->
      <div class="section card">
        <div class="section-header" @click="togglePanel('telegram')">
          <span class="section-icon">✈️</span>
          <h3 class="section-title">Telegram</h3>
          <span class="expand-icon">{{ expandedPanels.telegram ? '−' : '+' }}</span>
        </div>
        <div v-show="expandedPanels.telegram" class="section-body">
          <div class="form-grid">
            <div class="form-row">
              <label class="form-label">App ID</label>
              <input v-model="config.tg.apiId" class="input" placeholder="123456" />
            </div>
            <div class="form-row">
              <label class="form-label">App Hash</label>
              <div class="password-wrap">
                <input
                  v-model="config.tg.apiHash"
                  :type="showTgHash ? 'text' : 'password'"
                  class="input"
                  placeholder="abcdef..."
                />
                <button class="toggle-btn" @click="showTgHash = !showTgHash">
                  {{ showTgHash ? '🙈' : '👁' }}
                </button>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">手机号</label>
              <input v-model="config.tg.phone" class="input" placeholder="+86138..." />
            </div>
            <div class="form-row">
              <label class="form-label">讨论组 ID</label>
              <input v-model="config.tg.discussion" class="input" placeholder="讨论组链接或ID" />
            </div>
            <div class="form-row">
              <label class="form-label">频道 ID</label>
              <input v-model="config.tg.channel" class="input" placeholder="频道链接或ID" />
            </div>
            <div class="form-row path-row">
              <label class="form-label">下载目录</label>
              <div class="path-input-row">
                <input
                  v-model="config.paths.tgDownloadDir"
                  class="input"
                  placeholder="选择TG打包下载目录"
                  readonly
                />
                <button class="browse-btn" @click="browseTgDownloadDir">浏览</button>
              </div>
            </div>
            <span class="form-hint">TG打包下载的文件将保存到此目录</span>
          </div>
          <div class="action-row">
            <button
              class="btn"
              :class="tgConnected ? 'btn-secondary' : 'btn-primary'"
              :disabled="isTgLogging"
              @click="handleTelegramAction"
            >
              {{ tgConnected ? '退出登录' : isTgLogging ? '登录中...' : '登录' }}
            </button>
            <button
              v-if="!tgConnected"
              class="btn btn-secondary"
              :disabled="isTgLogging"
              @click="testTelegramConnection"
            >
              测试连接
            </button>
          </div>
        </div>
      </div>

      <!-- ASMR 设置 -->
      <div class="section card">
        <div class="section-header" @click="togglePanel('asmr')">
          <span class="section-icon">🌐</span>
          <h3 class="section-title">ASMR.ONE</h3>
          <span class="expand-icon">{{ expandedPanels.asmr ? '−' : '+' }}</span>
        </div>
        <div v-show="expandedPanels.asmr" class="section-body">
          <div class="form-grid">
            <div class="form-row">
              <label class="form-label">用户名</label>
              <input v-model="config.asmr.username" class="input" placeholder="用户名或邮箱" />
            </div>
            <div class="form-row">
              <label class="form-label">密码</label>
              <div class="password-wrap">
                <input
                  v-model="config.asmr.password"
                  :type="showAsmrPassword ? 'text' : 'password'"
                  class="input"
                  placeholder="密码"
                />
                <button class="toggle-btn" @click="showAsmrPassword = !showAsmrPassword">
                  {{ showAsmrPassword ? '🙈' : '👁' }}
                </button>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">播放列表 ID</label>
              <input v-model="config.asmr.playlistId" class="input" placeholder="a7868acf-..." />
            </div>
          </div>
          <div class="action-row">
            <button
              class="btn"
              :class="asmrLoggedIn ? 'btn-primary' : 'btn-secondary'"
              :disabled="isAsmrLogging"
              @click="handleAsmrAction"
            >
              {{ asmrLoggedIn ? '退出登录' : isAsmrLogging ? '登录中...' : '登录' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 系统配置 -->
      <div class="section card">
        <div class="section-header" @click="togglePanel('systemConfig')">
          <span class="section-icon">⚙️</span>
          <h3 class="section-title">系统配置</h3>
          <span class="expand-icon">{{ expandedPanels.systemConfig ? '−' : '+' }}</span>
        </div>
        <div v-show="expandedPanels.systemConfig" class="section-body">
          <div class="form-row">
            <label class="form-label">日志目录</label>
            <div class="path-input-wrap">
              <input v-model="config.paths.logsDir" class="input" placeholder="日志目录" />
              <button class="btn btn-secondary" @click="selectLogsPath">选择</button>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">配置文件夹</label>
            <div class="path-input-wrap">
              <input
                v-model="config.paths.configDir"
                class="input"
                placeholder="配置文件所在文件夹"
              />
              <button class="btn btn-secondary" @click="selectConfigDir">选择</button>
            </div>
          </div>
          <p class="path-hint">提示：工具输出的路径会保存到此文件夹下的 config.json</p>
        </div>
      </div>
    </div>

    <!-- Toast 提示 -->
    <transition name="fade">
      <div v-if="showToast" class="toast" :class="toastType">
        {{ toastMessage }}
      </div>
    </transition>

    <!-- 验证码弹窗 -->
    <div v-if="showTgAuthModal" class="modal-mask">
      <div class="modal-box card">
        <h3>{{ tgAuthType === 'Password' ? '二级密码' : '验证码' }}</h3>
        <p>
          请输入发送到你手机/客户端的{{ tgAuthType === 'Password' ? '两步验证密码' : '5位数字' }}
        </p>
        <input v-model="tgAuthCode" class="input big-input" @keyup.enter="submitTgAuth" />
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="cancelTgAuth">取消</button>
          <button class="btn btn-primary" @click="submitTgAuth">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, inject, watch } from 'vue'

const tgConnected = ref(false)
const asmrLoggedIn = ref(false)
const isTgLogging = ref(false)
const isAsmrLogging = ref(false)
const showTgHash = ref(false)
const showAsmrPassword = ref(false)
const tgAuthCode = ref('')
const tgAuthType = ref('Code')
const showTgAuthModal = ref(false)
let unsubscribeTgAuth = null // 存储取消监听的函数

// 注入待处理的验证码数据（从 App.vue）
const pendingAuthData = inject('pendingAuthData', null)
const showToast = ref(false)
const toastMessage = ref('')
const toastType = ref('success')

const expandedPanels = reactive({
  accountStatus: true,
  telegram: false,
  asmr: false,
  systemConfig: false
})

const config = reactive({
  tg: { apiId: '', apiHash: '', phone: '', session: '', discussion: '', channel: '' },
  asmr: { username: '', password: '', token: '', playlistId: '', rememberMe: false },
  paths: {
    configDir: '',
    logsDir: '',
    sourceDir: '',
    toolOutputDir: '',
    whisperTargetPath: '',
    dataDir: '',
    configFilePath: '',
    chineseListPath: '',
    tgDownloadDir: ''
  },
  upload: { channelId: '' },
  logging: { level: 'info', enableFileLog: true },
  system: { autoStart: false, minimizeToTray: false }
})

const togglePanel = (panel) => {
  expandedPanels[panel] = !expandedPanels[panel]
}

const selectLogsPath = async () => {
  const res = await window.api.dialogOpenDirectory()
  if (res && res.filePath) {
    config.paths.logsDir = res.filePath
    // 立即保存，不等待防抖
    saveAllSettings()
  }
}

const selectConfigDir = async () => {
  const res = await window.api.dialogOpenDirectory()
  if (res && res.filePath) {
    config.paths.configDir = res.filePath
    // 立即保存，不等待防抖
    saveAllSettings()
  }
}

const saveAllSettings = async () => {
  try {
    // 保存前端管理的设置，包含路径配置
    // 使用 JSON 序列化/反序列化将 reactive 对象转换为普通对象
    // 避免 Electron IPC "An object could not be cloned" 错误
    const settingsToSave = JSON.parse(
      JSON.stringify({
        asmr: config.asmr,
        tg: config.tg,
        logging: config.logging,
        system: config.system,
        upload: config.upload,
        paths: config.paths
      })
    )
    const result = await window.api.invoke('save-config', settingsToSave)

    // 处理返回结果：支持 { success: true } 或 true
    const isSuccess = result && (result.success === true || result === true)

    if (isSuccess) {
      showToastMessage('设置已保存', 'success')
    } else {
      showToastMessage('保存失败: 未知错误', 'error')
    }
  } catch (error) {
    showToastMessage('保存失败: ' + error.message, 'error')
  }
}

// 防抖自动保存
let autoSaveTimer = null
const debouncedAutoSave = () => {
  // 清除之前的定时器
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
  }
  // 设置新的定时器，500ms 后自动保存
  autoSaveTimer = setTimeout(() => {
    console.log('[Settings] 自动保存配置...')
    saveAllSettings()
  }, 500)
}

// 监听配置变化，自动保存
watch(
  () => ({
    asmr: config.asmr,
    tg: config.tg,
    logging: config.logging,
    system: config.system,
    upload: config.upload,
    paths: config.paths
  }),
  (newVal, oldVal) => {
    // 深比较，避免初始加载时触发保存
    if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
      debouncedAutoSave()
    }
  },
  { deep: true }
)

const showToastMessage = (message, type = 'success') => {
  toastMessage.value = message
  toastType.value = type
  showToast.value = true
  setTimeout(() => {
    showToast.value = false
  }, 3000)
}

const handleTelegramAction = async () => {
  if (tgConnected.value) {
    tgConnected.value = false
    showToastMessage('已退出 Telegram 登录')
  } else {
    isTgLogging.value = true
    const loginPayload = JSON.parse(
      JSON.stringify({
        apiId: config.tg.apiId,
        apiHash: config.tg.apiHash,
        phone: config.tg.phone
      })
    )
    const res = await window.api.tgLogin(loginPayload)
    isTgLogging.value = false
    if (res.success) {
      tgConnected.value = true
      config.tg.session = res.session
      showToastMessage('Telegram 登录成功')
      // 登录成功后清理待处理验证码，防止重复弹窗
      if (pendingAuthData && pendingAuthData.value) {
        console.log('[Settings] 登录成功，清理待处理验证码')
        pendingAuthData.value = null
      }
      saveAllSettings()
    } else {
      const errorMsg =
        res.msg ||
        res.error?.message ||
        (typeof res.error === 'string' ? res.error : JSON.stringify(res.error)) ||
        '未知错误'
      showToastMessage('登录失败: ' + errorMsg, 'error')
    }
  }
}

const testTelegramConnection = async () => {
  showToastMessage('测试连接中...')
  const isConnected = await window.api.tgCheckLogin()
  tgConnected.value = isConnected
  showToastMessage(isConnected ? '连接正常' : '未连接', isConnected ? 'success' : 'warning')
}

const handleAsmrAction = async () => {
  if (asmrLoggedIn.value) {
    asmrLoggedIn.value = false
    config.asmr.token = ''
    showToastMessage('已退出登录')
  } else {
    if (!config.asmr.username || !config.asmr.password) {
      showToastMessage('请输入用户名和密码', 'warning')
      return
    }
    isAsmrLogging.value = true
    const loginPayload = JSON.parse(
      JSON.stringify({
        username: config.asmr.username,
        password: config.asmr.password,
        playlistId: config.asmr.playlistId
      })
    )
    const res = await window.api.asmrLogin(loginPayload)
    isAsmrLogging.value = false
    if (res.success && res.token) {
      asmrLoggedIn.value = true
      config.asmr.token = res.token
      showToastMessage('登录成功')
      saveAllSettings()
      // 登录成功后刷新云端列表
      showToastMessage('正在刷新云端列表...', 'info')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await window.api.invoke('asmr-fetch-cloud-works')
    } else {
      showToastMessage('登录失败: ' + (res.msg || '未知错误'), 'error')
    }
  }
}

// 浏览选择 TG 下载目录
const browseTgDownloadDir = async () => {
  try {
    const res = await window.api.dialogOpenDirectory()
    if (res && res.filePath) {
      config.paths.tgDownloadDir = res.filePath
      // 立即保存，不等待防抖
      saveAllSettings()
    }
  } catch (e) {
    showToastMessage('选择目录失败: ' + e.message, 'error')
  }
}

const submitTgAuth = () => {
  window.api.send('tg-auth-reply', { code: tgAuthCode.value, cancel: false })
  showTgAuthModal.value = false
}

const cancelTgAuth = () => {
  window.api.send('tg-auth-reply', { code: '', cancel: true })
  showTgAuthModal.value = false
}

onMounted(async () => {
  try {
    console.log('Settings: 开始加载配置')
    const result = await window.api.invoke('get-config')
    console.log('Settings: 获取到的配置结果:', result)
    const cfg = result?.data || result
    console.log('Settings: 提取的配置数据:', cfg)
    if (cfg) {
      // 完整覆盖，不使用 Object.assign（防止遗漏字段）
      if (cfg.tg) {
        config.tg = { ...config.tg, ...cfg.tg }
        console.log('Settings: tg 更新后:', config.tg)
      }
      if (cfg.asmr) {
        config.asmr = { ...config.asmr, ...cfg.asmr }
        console.log('Settings: asmr 更新后:', config.asmr)
      }
      if (cfg.paths) {
        config.paths = { ...config.paths, ...cfg.paths }
        console.log('Settings: paths 更新后:', config.paths)
      }
      if (cfg.logging) {
        config.logging = { ...config.logging, ...cfg.logging }
        console.log('Settings: logging 更新后:', config.logging)
      }
      if (cfg.system) {
        config.system = { ...config.system, ...cfg.system }
        console.log('Settings: system 更新后:', config.system)
      }
      if (cfg.upload) {
        config.upload = { ...config.upload, ...cfg.upload }
        console.log('Settings: upload 更新后:', config.upload)
      }
      console.log('Settings: 配置加载完成，当前 config:', config)
    }
    tgConnected.value = await window.api.tgCheckLogin()
    asmrLoggedIn.value = !!config.asmr.token
    console.log('Settings: 登录状态 - TG:', tgConnected.value, 'ASMR:', asmrLoggedIn.value)

    // 检查是否有待处理的验证码（从 App.vue 跳转过来）
    // 注意：如果已经登录成功，则忽略待处理的验证码（防止登录成功后重复弹窗）
    if (pendingAuthData && pendingAuthData.value && !tgConnected.value) {
      console.log('[Settings] 发现待处理验证码:', pendingAuthData.value)
      tgAuthType.value = pendingAuthData.value.type
      showTgAuthModal.value = true
      tgAuthCode.value = ''
      // 清空待处理状态
      pendingAuthData.value = null
    } else if (pendingAuthData && pendingAuthData.value && tgConnected.value) {
      // 已登录状态，清空待处理的验证码数据
      console.log('[Settings] 已登录，忽略待处理验证码')
      pendingAuthData.value = null
    }

    // 注册验证码监听（用于后续验证码需求）
    // 只有未登录时才监听验证码（防止登录成功后重复弹窗）
    if (window.api.onTgAuthNeeded && !tgConnected.value) {
      unsubscribeTgAuth = window.api.onTgAuthNeeded((authData) => {
        console.log('[Settings] 收到验证码需求:', authData)
        // 再次检查登录状态，防止登录成功后仍收到事件
        if (!tgConnected.value) {
          tgAuthType.value = authData.type
          showTgAuthModal.value = true
          tgAuthCode.value = ''
        } else {
          console.log('[Settings] 已登录，忽略验证码需求')
        }
      })
    }
  } catch (e) {
    console.error('Settings: 初始化失败:', e)
  }
})

// 组件卸载时清理事件监听
onUnmounted(() => {
  if (unsubscribeTgAuth) {
    unsubscribeTgAuth()
    console.log('[Settings] 已清理 tgAuth 事件监听')
  }
})
</script>

<style scoped>
.page-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  overflow-y: auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.auto-save-status {
  font-size: 13px;
  color: #16a34a;
  font-weight: 500;
  padding: 6px 12px;
  background: #dcfce7;
  border-radius: 20px;
}

.settings-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 响应式布局 */
@media (max-width: 1280px) {
  .page-container {
    padding: 16px;
  }
}

@media (max-width: 1024px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .status-grid {
    grid-template-columns: 1fr;
  }

  .action-row {
    flex-wrap: wrap;
    gap: 8px;
  }

  .action-row .btn {
    flex: 1;
    min-width: 100px;
    text-align: center;
  }

  .path-input-wrap {
    flex-direction: column;
  }

  .path-input-wrap .btn-secondary {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .page-container {
    padding: 12px;
  }

  .page-title {
    font-size: 20px;
  }

  .section-header {
    padding: 12px 16px;
  }

  .section-body {
    padding: 0 16px 16px;
  }

  .section-title {
    font-size: 14px;
  }

  .status-card {
    padding: 12px;
  }

  .form-row {
    gap: 4px;
  }

  .input,
  .select {
    padding: 8px 12px;
    font-size: 13px;
  }

  .toggle-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .modal-box {
    width: 90%;
    max-width: 380px;
  }
}

@media (max-width: 640px) {
  .page-title {
    font-size: 18px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 10px 16px;
    font-size: 13px;
  }
}

.section {
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.section-header:hover {
  background: #fafafa;
}

.section-icon {
  font-size: 20px;
}

.section-title {
  flex: 1;
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: #262626;
}

.expand-icon {
  font-size: 18px;
  color: #737373;
}

.section-body {
  padding: 0 20px 20px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.status-card {
  background: #fafafa;
  border-radius: 10px;
  padding: 16px;
  border: 1px solid #e5e5e5;
}

.status-card.connected {
  background: #f0ebfc;
  border-color: #8b5cf6;
}

.status-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.status-icon {
  font-size: 18px;
}

.status-name {
  font-weight: 500;
  color: #262626;
  flex: 1;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.online {
  background: #dcfce7;
  color: #16a34a;
}

.status-badge.offline {
  background: #fee2e2;
  color: #dc2626;
}

.status-info {
  font-size: 13px;
  color: #737373;
  font-family: monospace;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: #525252;
}

.input {
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  background: #fff;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
  color: #262626;
}

.input:focus {
  border-color: #8b5cf6;
}

.input::placeholder {
  color: #a3a3a3;
}

.input.big-input {
  padding: 14px;
  font-size: 18px;
  text-align: center;
  letter-spacing: 2px;
}

.password-wrap {
  position: relative;
}

.toggle-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}

.action-row {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn {
  padding: 10px 20px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.btn-primary {
  background: #8b5cf6;
  color: #fff;
}

.btn-primary:hover:not(:disabled) {
  background: #7c3aed;
}

.btn-secondary {
  background: #f5f5f5;
  color: #525252;
}

.btn-secondary:hover:not(:disabled) {
  background: #e5e5e5;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
}

.toggle-label {
  font-size: 14px;
  color: #525252;
}

.toggle {
  width: 44px;
  height: 24px;
  appearance: none;
  background: #e5e5e5;
  border-radius: 12px;
  position: relative;
  cursor: pointer;
  transition: background 0.2s ease;
}

.toggle::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.toggle:checked {
  background: #8b5cf6;
}

.toggle:checked::before {
  transform: translateX(20px);
}

.select {
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #e5e5e5;
  background: #fff;
  font-size: 14px;
  color: #262626;
  outline: none;
  cursor: pointer;
}

.select:focus {
  border-color: #8b5cf6;
}

.path-input-wrap {
  display: flex;
  gap: 8px;
}

.path-input-wrap .input {
  flex: 1;
}

.path-input-row {
  display: flex;
  gap: 8px;
}

.path-input-row .input {
  flex: 1;
}

.browse-btn {
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  background: #f5f5f5;
  color: #525252;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.browse-btn:hover:not(:disabled) {
  background: #e5e5e5;
}

.path-hint {
  font-size: 12px;
  color: #a3a3a3;
  margin-top: 8px;
}

.divider {
  height: 1px;
  background: #e5e5e5;
  margin: 16px 0;
}

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
  z-index: 100;
}

.modal-box {
  width: 380px;
  text-align: center;
}

.modal-box h3 {
  margin: 0 0 12px;
  font-size: 18px;
  font-weight: 500;
  color: #262626;
}

.modal-box p {
  color: #737373;
  font-size: 14px;
  margin-bottom: 20px;
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 20px;
}

.toast {
  position: fixed;
  bottom: 40px;
  left: 50%;
  transform: translateX(-50%);
  padding: 12px 24px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  z-index: 9999; /* 最高层级确保在最前面 */
  background: #22c55e; /* 默认绿色背景 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* 添加阴影 */
  min-width: 200px; /* 最小宽度 */
  text-align: center; /* 文字居中 */
  pointer-events: none; /* 不阻挡鼠标事件 */
}

.toast.success {
  background: #22c55e;
}

.toast.error {
  background: #ef4444;
}

.toast.warning {
  background: #f59e0b;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.card {
  background: #fff;
  border-radius: 12px;
  border: 1px solid #e5e5e5;
}

.page-container::-webkit-scrollbar {
  width: 6px;
}

.page-container::-webkit-scrollbar-track {
  background: transparent;
}

.page-container::-webkit-scrollbar-thumb {
  background: #e5e5e5;
  border-radius: 3px;
}

.page-container::-webkit-scrollbar-thumb:hover {
  background: #d4d4d4;
}
</style>
