<template>
  <div class="page-container settings-theme">
    <div class="page-header settings-header">
      <div class="page-header-main">
        <span class="page-eyebrow">Control Center</span>
        <h2 class="page-title">设置</h2>
        <p class="page-header-subtitle">
          统一管理账号连接、机器人参数、外观和本地路径。
        </p>
      </div>
      <div class="page-header-meta">
        <span class="summary-chip"
          >{{ [tgConnected, asmrLoggedIn].filter(Boolean).length }} / 2
          已接入</span
        >
        <span class="auto-save-status">自动保存已启用</span>
      </div>
    </div>

    <div class="settings-container">
      <!-- 账户状态 -->
      <div class="section card">
        <div class="section-header" @click="togglePanel('accountStatus')">
          <span class="section-icon">
            <n-icon :size="20">
              <Person24Regular />
            </n-icon>
          </span>
          <div class="section-head-copy">
            <h3 class="section-title">账户状态</h3>
            <span class="section-summary"
              >Telegram 与 ASMR.ONE 的连接概览。</span
            >
          </div>
          <div class="section-head-side">
            <span class="section-meta"
              >{{ [tgConnected, asmrLoggedIn].filter(Boolean).length }} / 2
              已连接</span
            >
            <span class="expand-icon">{{
              expandedPanels.accountStatus ? "-" : "+"
            }}</span>
          </div>
        </div>
        <div v-show="expandedPanels.accountStatus" class="section-body">
          <div class="status-grid">
            <div class="status-card" :class="{ connected: tgConnected }">
              <div class="status-top">
                <span class="status-icon">
                  <n-icon :size="18">
                    <Airplane24Regular />
                  </n-icon>
                </span>
                <span class="status-name">Telegram</span>
                <span
                  class="status-badge"
                  :class="tgConnected ? 'online' : 'offline'"
                >
                  {{ tgConnected ? "已连接" : "未连接" }}
                </span>
              </div>
              <div v-if="tgConnected" class="status-info">
                {{ config.tg.phone }}
              </div>
            </div>
            <div class="status-card" :class="{ connected: asmrLoggedIn }">
              <div class="status-top">
                <span class="status-icon">
                  <n-icon :size="18">
                    <Globe24Regular />
                  </n-icon>
                </span>
                <span class="status-name">ASMR.ONE</span>
                <span
                  class="status-badge"
                  :class="asmrLoggedIn ? 'online' : 'offline'"
                >
                  {{ asmrLoggedIn ? "已登录" : "未登录" }}
                </span>
              </div>
              <div v-if="asmrLoggedIn" class="status-info">
                {{ config.asmr.username }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Telegram 设置 -->
      <div class="section card">
        <div class="section-header" @click="togglePanel('telegram')">
          <span class="section-icon">
            <n-icon :size="20">
              <Airplane24Regular />
            </n-icon>
          </span>
          <div class="section-head-copy">
            <h3 class="section-title">Telegram</h3>
            <span class="section-summary"
              >管理 Bot、频道、下载目录与账号授权。</span
            >
          </div>
          <div class="section-head-side">
            <span class="section-meta"
              >{{ tgConnected ? "账号已连接" : "等待连接" }} ?
              {{
                config.tg.botMode === "webhook" ? "Webhook" : "Polling"
              }}</span
            >
            <span class="expand-icon">{{
              expandedPanels.telegram ? "-" : "+"
            }}</span>
          </div>
        </div>
        <div v-show="expandedPanels.telegram" class="section-body">
          <div class="form-grid">
            <div class="form-row">
              <label class="form-label">Bot Token</label>
              <div class="password-wrap">
                <input
                  v-model="config.tg.botToken"
                  :type="showBotToken ? 'text' : 'password'"
                  class="input"
                  placeholder="123456:ABC..."
                />
                <button
                  class="toggle-btn"
                  @click="showBotToken = !showBotToken"
                >
                  <n-icon :size="16">
                    <component
                      :is="showBotToken ? EyeOff24Regular : Eye24Regular"
                    />
                  </n-icon>
                </button>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">Bot 模式</label>
              <select v-model="config.tg.botMode" class="input">
                <option value="polling">polling（开发）</option>
                <option value="webhook">webhook（生产）</option>
              </select>
            </div>
            <div v-if="config.tg.botMode === 'webhook'" class="form-row">
              <label class="form-label">Webhook URL</label>
              <input
                v-model="config.tg.botWebhookUrl"
                class="input"
                placeholder="https://example.com/tg/bot/webhook"
              />
            </div>
            <div v-if="config.tg.botMode === 'webhook'" class="form-row">
              <label class="form-label">Webhook Port</label>
              <input
                v-model="config.tg.botWebhookPort"
                class="input"
                type="number"
                min="1"
                placeholder="8443"
              />
            </div>
            <div class="form-row">
              <label class="form-label">搜索频道 ID</label>
              <input
                v-model="config.tg.searchChannelId"
                class="input"
                placeholder="@channel 或 -100xxxxxxxxxx"
              />
            </div>
            <div class="form-row path-row">
              <label class="form-label">前置包 TXT</label>
              <div class="path-input-row">
                <input
                  v-model="config.tg.prePackagePath"
                  class="input"
                  placeholder="选择前置包 txt 文件"
                  readonly
                />
                <button class="browse-btn" @click="browsePrePackageFile">
                  浏览
                </button>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">前置包链接</label>
              <input
                v-model="config.tg.prePackageLink"
                class="input"
                placeholder="https://...（可选，用于 TXT 无链接场景）"
              />
            </div>
            <div class="form-row">
              <label class="form-label">白名单用户 ID</label>
              <input
                v-model="config.tg.botAllowedUsers"
                class="input"
                placeholder="12345678, 87654321"
              />
            </div>
            <div class="form-row">
              <label class="form-label">白名单群组 ID</label>
              <input
                v-model="config.tg.botAllowedChats"
                class="input"
                placeholder="-1001234567890, -1009876543210"
              />
            </div>
            <div class="form-row">
              <div class="toggle-row">
                <span class="toggle-label">白名单调试日志（完整内容）</span>
                <input
                  v-model="config.tg.botWhitelistDebugLog"
                  class="toggle"
                  type="checkbox"
                />
              </div>
              <span class="form-hint"
                >开启后记录完整 sender/chat/content，关闭时默认脱敏</span
              >
            </div>
            <div class="form-row">
              <div class="toggle-row">
                <span class="toggle-label">应用启动自动启动 Bot</span>
                <input
                  v-model="config.tg.botAutoStartOnStartup"
                  class="toggle"
                  type="checkbox"
                  @change="saveAllSettings"
                />
              </div>
              <span class="form-hint"
                >默认开启；关闭后仅保留手动点击“启动 Bot”。</span
              >
            </div>
            <div class="form-row">
              <label class="form-label">Bot 搜索上限</label>
              <input
                v-model="config.tg.botSearchLimit"
                class="input"
                type="text"
                placeholder="3000（支持 3w / 3万 / 30k）"
                @blur="saveAllSettings"
                @change="saveAllSettings"
              />
            </div>
            <div class="form-row">
              <label class="form-label">Bot 索引文件</label>
              <input
                v-model="config.tg.botHistoryPath"
                class="input"
                placeholder="留空则默认 userData/data/tg-bot-history.json"
              />
            </div>
            <div class="form-row">
              <label class="form-label">作品信息缓存最大大小 (MB)</label>
              <input
                v-model="config.tg.infoCacheMaxFileSizeMB"
                class="input"
                type="number"
                min="1"
                max="4096"
                placeholder="50"
                @blur="saveAllSettings"
                @change="saveAllSettings"
              />
              <span class="form-hint"
                >仅作用于纯文本/详情作品信息缓存，不影响 /search
                链接索引缓存。</span
              >
            </div>
            <div class="form-row">
              <label class="form-label">App ID</label>
              <input
                v-model="config.tg.apiId"
                class="input"
                placeholder="123456"
              />
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
                  <n-icon :size="16">
                    <component
                      :is="showTgHash ? EyeOff24Regular : Eye24Regular"
                    />
                  </n-icon>
                </button>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">手机号</label>
              <input
                v-model="config.tg.phone"
                class="input"
                placeholder="+86138..."
              />
            </div>
            <div class="form-row">
              <label class="form-label">讨论组 ID</label>
              <input
                v-model="config.tg.discussion"
                class="input"
                placeholder="讨论组链接或ID"
              />
            </div>
            <div class="form-row">
              <label class="form-label">频道 ID</label>
              <input
                v-model="config.tg.channel"
                class="input"
                placeholder="频道链接或ID"
              />
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
                <button class="browse-btn" @click="browseTgDownloadDir">
                  浏览
                </button>
              </div>
            </div>
            <span class="form-hint">TG打包下载的文件将保存到此目录</span>
            <span class="form-hint"
              >若要频道历史实时检索，需要先完成 User API 登录并保存
              session</span
            >
          </div>
          <div class="action-row">
            <button
              class="btn"
              :class="tgConnected ? 'btn-secondary' : 'btn-primary'"
              :disabled="isTgLogging"
              @click="handleTelegramAction"
            >
              {{
                tgConnected ? "退出登录" : isTgLogging ? "登录中..." : "登录"
              }}
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
          <span class="section-icon">
            <n-icon :size="20">
              <Globe24Regular />
            </n-icon>
          </span>
          <div class="section-head-copy">
            <h3 class="section-title">ASMR.ONE</h3>
            <span class="section-summary"
              >管理站点登录、账号信息与资源同步配置。</span
            >
          </div>
          <div class="section-head-side">
            <span class="section-meta"
              >{{ asmrLoggedIn ? "已登录" : "待登录" }} ?
              {{ config.asmr.username || "未填写账号" }}</span
            >
            <span class="expand-icon">{{
              expandedPanels.asmr ? "-" : "+"
            }}</span>
          </div>
        </div>
        <div v-show="expandedPanels.asmr" class="section-body">
          <div class="form-grid">
            <div class="form-row">
              <label class="form-label">用户名</label>
              <input
                v-model="config.asmr.username"
                class="input"
                placeholder="用户名或邮箱"
              />
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
                <button
                  class="toggle-btn"
                  @click="showAsmrPassword = !showAsmrPassword"
                >
                  <n-icon :size="16">
                    <component
                      :is="showAsmrPassword ? EyeOff24Regular : Eye24Regular"
                    />
                  </n-icon>
                </button>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">播放列表 ID</label>
              <input
                v-model="config.asmr.playlistId"
                class="input"
                placeholder="a7868acf-..."
              />
            </div>
          </div>
          <div class="action-row">
            <button
              class="btn"
              :class="asmrLoggedIn ? 'btn-primary' : 'btn-secondary'"
              :disabled="isAsmrLogging"
              @click="handleAsmrAction"
            >
              {{
                asmrLoggedIn ? "退出登录" : isAsmrLogging ? "登录中..." : "登录"
              }}
            </button>
          </div>
        </div>
      </div>

      <!-- 系统配置 -->
      <div class="section card">
        <div class="section-header" @click="togglePanel('systemConfig')">
          <span class="section-icon">
            <n-icon :size="20">
              <Settings24Regular />
            </n-icon>
          </span>
          <div class="section-head-copy">
            <h3 class="section-title">系统配置</h3>
            <span class="section-summary"
              >窗口外观、主题、代理与本地路径管理。</span
            >
          </div>
          <div class="section-head-side">
            <span class="section-meta"
              >{{
                config.system.windowFrameMode === "custom"
                  ? "自定义窗口"
                  : "系统边框"
              }}
              ?
              {{
                config.system.theme === "dark"
                  ? "暗色"
                  : config.system.theme === "light"
                    ? "浅色"
                    : "跟随系统"
              }}</span
            >
            <span class="expand-icon">{{
              expandedPanels.systemConfig ? "-" : "+"
            }}</span>
          </div>
        </div>
        <div v-show="expandedPanels.systemConfig" class="section-body">
          <div class="form-row">
            <label class="form-label">窗口边框模式</label>
            <select v-model="config.system.windowFrameMode" class="select">
              <option value="custom">无边框（Windows 推荐）</option>
              <option value="system">系统边框（兼容）</option>
            </select>
            <span class="form-hint"
              >切换后需重启应用生效；非 Windows 会自动回退系统边框模式。</span
            >
          </div>
          <div class="form-row">
            <label class="form-label">明暗模式</label>
            <select
              v-model="config.system.theme"
              class="select"
              @change="saveAllSettings"
            >
              <option value="auto">跟随系统</option>
              <option value="light">浅色模式</option>
              <option value="dark">暗色模式</option>
            </select>
            <span class="form-hint"
              >切换后立即生效；“跟随系统”会使用系统主题。</span
            >
          </div>
          <div class="form-row">
            <label class="form-label">主色调</label>
            <div class="color-input-wrap">
              <n-color-picker
                v-model:value="config.system.accentColor"
                class="accent-picker"
                :show-alpha="false"
                :modes="['hex']"
                @update:value="saveAllSettings"
              />
              <input
                v-model="config.system.accentColor"
                class="input"
                placeholder="#adb571"
                @blur="saveAllSettings"
              />
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">窗口透明度</label>
            <div class="range-row">
              <input
                v-model.number="config.system.windowOpacity"
                type="range"
                min="0.55"
                max="1"
                step="0.01"
                class="range-input"
                @input="saveAllSettings"
              />
              <span class="range-value">
                {{
                  Math.round(
                    (Number(config.system.windowOpacity || 0.92) || 0.92) * 100,
                  )
                }}%
              </span>
            </div>
          </div>
          <div class="form-row">
            <div class="toggle-row">
              <span class="toggle-label">启用毛玻璃</span>
              <input
                v-model="config.system.blurEnabled"
                class="toggle"
                type="checkbox"
                @change="saveAllSettings"
              />
            </div>
          </div>
          <div v-if="config.system.blurEnabled" class="form-row">
            <label class="form-label">毛玻璃强度</label>
            <div class="range-row">
              <input
                v-model.number="config.system.blurIntensity"
                type="range"
                min="0"
                max="40"
                step="1"
                class="range-input"
                @input="saveAllSettings"
              />
              <span class="range-value"
                >{{ Number(config.system.blurIntensity || 8) }}px</span
              >
            </div>
          </div>
          <div v-if="config.system.blurEnabled" class="form-row">
            <label class="form-label">毛玻璃渲染模式</label>
            <select
              v-model="config.system.blurRenderMode"
              class="select"
              @change="saveAllSettings"
            >
              <option value="system">系统渲染（Windows Acrylic）</option>
              <option value="gpu">显卡渲染（GPU Backdrop）</option>
            </select>
            <span class="form-hint"
              >系统模式更接近 Win10 原生；GPU 模式更柔和、跨主题一致。</span
            >
          </div>
          <div class="form-row">
            <label class="form-label">代理地址（全局）</label>
            <input
              v-model="config.system.proxyUrl"
              class="input"
              placeholder="例如: http://127.0.0.1:7890（留空表示不覆盖模块代理）"
              @blur="saveAllSettings"
            />
            <span class="form-hint"
              >将作为 ASMR/TG 默认代理地址，留空时使用模块内代理配置。</span
            >
          </div>
          <div class="form-row">
            <label class="form-label">日志目录</label>
            <div class="path-input-wrap">
              <input
                v-model="config.paths.logsDir"
                class="input"
                placeholder="日志目录"
              />
              <button class="btn btn-secondary" @click="selectLogsPath">
                选择
              </button>
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
              <button class="btn btn-secondary" @click="selectConfigDir">
                选择
              </button>
            </div>
          </div>
          <p class="path-hint">
            提示：工具输出的路径会保存到此文件夹下的 config.json
          </p>
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
        <h3>{{ tgAuthType === "Password" ? "二级密码" : "验证码" }}</h3>
        <p>
          请输入发送到你手机/客户端的{{
            tgAuthType === "Password" ? "两步验证密码" : "5位数字"
          }}
        </p>
        <input
          v-model="tgAuthCode"
          class="input big-input"
          @keyup.enter="submitTgAuth"
        />
        <div class="modal-actions">
          <button class="btn btn-secondary" @click="cancelTgAuth">取消</button>
          <button class="btn btn-primary" @click="submitTgAuth">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from "vue";
import { NColorPicker, NIcon } from "naive-ui";
import {
  Airplane24Regular,
  Eye24Regular,
  EyeOff24Regular,
  Globe24Regular,
  Person24Regular,
  Settings24Regular,
} from "@vicons/fluent";
import { useSettingsPathPickers } from "../../composables/useSettingsPathPickers";
import { useSettingsAuthFlows } from "../../composables/useSettingsAuthFlows";
import { useSettingsConfigState } from "../../composables/useSettingsConfigState";
import { useSettingsUiState } from "../../composables/useSettingsUiState";
import { useSettingsInitialization } from "../../composables/useSettingsInitialization";

const {
  isTgLogging,
  isAsmrLogging,
  showTgHash,
  showBotToken,
  showAsmrPassword,
  tgAuthCode,
  tgAuthType,
  showTgAuthModal,
  expandedPanels,
  togglePanel,
} = useSettingsUiState();

// 注入待处理的验证码数据（从 App.vue）
const pendingAuthData = inject("pendingAuthData", null);

const {
  tgConnected,
  asmrLoggedIn,
  showToast,
  toastMessage,
  toastType,
  config,
  saveAllSettings,
  showToastMessage,
  initializeBaseSettings,
} = useSettingsConfigState();

const {
  selectLogsPath,
  selectConfigDir,
  browseTgDownloadDir,
  browsePrePackageFile,
} = useSettingsPathPickers({
  config,
  saveAllSettings,
  showToastMessage,
});

const {
  handleTelegramAction,
  testTelegramConnection,
  handleAsmrAction,
  submitTgAuth,
  cancelTgAuth,
} = useSettingsAuthFlows({
  config,
  tgConnected,
  asmrLoggedIn,
  isTgLogging,
  isAsmrLogging,
  pendingAuthData,
  tgAuthCode,
  showTgAuthModal,
  showToastMessage,
  saveAllSettings,
});

useSettingsInitialization({
  initializeBaseSettings,
  pendingAuthData,
  tgConnected,
  tgAuthType,
  showTgAuthModal,
  tgAuthCode,
});
</script>
<style scoped src="./SettingsPageContentCore.css"></style>
