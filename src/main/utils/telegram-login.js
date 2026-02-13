/**
 * Telegram 登录工具
 * 提供标准化的 Telegram 登录流程和状态管理
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { ipcMain } from 'electron'
import path from 'path'
import { getConfig, saveConfig } from '../modules/config'
import { normalizeError } from './errorHandler'

// 创建完整的logger对象
const logger = {
  debug: (...args) => console.debug('[telegram:debug]', ...args),
  info: (...args) => console.info('[telegram:info]', ...args),
  warn: (...args) => console.warn('[telegram:warn]', ...args),
  error: (...args) => console.error('[telegram:error]', ...args),
  canSend: () => true,
  canReceive: () => true,
  connection: {
    debug: (...args) => console.debug('[telegram:connection:debug]', ...args),
    info: (...args) => console.info('[telegram:connection:info]', ...args),
    warn: (...args) => console.warn('[telegram:connection:warn]', ...args),
    error: (...args) => console.error('[telegram:connection:error]', ...args)
  }
}

export const LOGIN_STATE = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  AUTHENTICATING: 'authenticating',
  CONNECTED: 'connected',
  AUTH_FAILED: 'auth_failed',
  CANCELLED: 'cancelled'
}

let telegramClient = null
let currentState = LOGIN_STATE.DISCONNECTED
let isLoginInProgress = false
let currentAuthReject = null

/**
 * 尝试自动重连
 */
export async function tryAutoConnect() {
  try {
    const cfg = getConfig()
    // 修复：增加可选链检查，防止 cfg.tg 为 undefined 时报错
    if (!cfg?.tg?.session || !cfg?.tg?.apiId || !cfg?.tg?.apiHash) {
      return { connected: false, reason: 'missing_credentials' }
    }

    if (isLoginInProgress) {
      return { connected: false, reason: 'login_in_progress' }
    }

    currentState = LOGIN_STATE.CONNECTING
    notifyStatusChange()

    if (telegramClient) {
      try {
        await telegramClient.disconnect()
      } catch {
        /* ignore */
      }
    }

    telegramClient = new TelegramClient(
      new StringSession(cfg.tg.session),
      Number(cfg.tg.apiId),
      cfg.tg.apiHash,
      {
        connectionRetries: 2,
        useWSS: false,
        deviceModel: 'KuruHaru',
        baseLogger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
          log: () => {},
          canSend: () => true,
          canReceive: () => true
        }
      }
    )

    await telegramClient.connect()

    const isAuthorized = await telegramClient.isUserAuthorized()

    if (!isAuthorized) {
      logger.warn('Auto-connect: Session invalid or expired')
      currentState = LOGIN_STATE.AUTH_FAILED
      notifyStatusChange()
      return { connected: false, reason: 'session_invalid' }
    }

    currentState = LOGIN_STATE.CONNECTED
    notifyStatusChange()
    logger.info('自动重连成功')

    return { connected: true }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error('Auto-connect failed:', normalized.error.message)

    currentState = LOGIN_STATE.AUTH_FAILED
    notifyStatusChange()

    return {
      connected: false,
      reason: normalized.error.code,
      error: normalized
    }
  }
}

/**
 * 发起登录流程
 */
export async function startLogin(sender, loginParams) {
  const cfg = getConfig()

  if (isLoginInProgress) {
    return { success: false, error: { message: 'Login already in progress' } }
  }

  const apiId = loginParams?.apiId || cfg?.tg?.apiId
  const apiHash = loginParams?.apiHash || cfg?.tg?.apiHash
  const phone = loginParams?.phone || cfg?.tg?.phone

  if (!apiId || !apiHash || !phone) {
    return {
      success: false,
      error: { message: 'Missing credentials' }
    }
  }

  isLoginInProgress = true

  try {
    if (telegramClient) {
      await telegramClient.disconnect()
      telegramClient = null
    }

    currentState = LOGIN_STATE.AUTHENTICATING
    notifyStatusChange()

    logger.info(`开始登录流程: Phone=${phone}, API_ID=${apiId}`)

    telegramClient = new TelegramClient(new StringSession(''), Number(apiId), apiHash, {
      connectionRetries: 5,
      useWSS: false,
      deviceModel: 'KuruHaru',
      baseLogger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        log: () => {},
        canSend: () => true,
        canReceive: () => true
      }
    })

    const createAuthCallback = (type) => {
      return new Promise((resolve, reject) => {
        currentAuthReject = reject
        const timeoutId = setTimeout(() => {
          cleanup()
          reject(new Error('TIMEOUT'))
        }, 180000)

        const handleReply = (_, result) => {
          cleanup()
          logger.info(`收到验证回复 [${type}]:`, result)
          if (result?.cancel) {
            reject(new Error('USER_CANCEL'))
          } else if (result?.code) {
            resolve(result.code)
          } else {
            reject(new Error('INVALID_INPUT'))
          }
        }

        const cleanup = () => {
          clearTimeout(timeoutId)
          ipcMain.removeListener('tg-auth-reply', handleReply)
          currentAuthReject = null
        }

        ipcMain.once('tg-auth-reply', handleReply)

        sender.send('tg-auth-needed', {
          type,
          timeout: 180000
        })
      })
    }

    await telegramClient.start({
      phoneNumber: phone,
      phoneCode: () => createAuthCallback('Code'),
      password: (hint) => {
        logger.info(`需要两步验证密码 (Hint: ${hint})`)
        return createAuthCallback('Password')
      },
      onError: (err) => {
        logger.error('GramJS Internal Error:', err)
      }
    })

    const sessionStr = telegramClient.session.save()

    const saveData = {
      tg: {
        ...(cfg.tg || {}),
        apiId: apiId,
        apiHash: apiHash,
        phone: phone,
        session: sessionStr
      }
    }

    const pathsToSave = {}
    Object.keys(cfg.paths || {}).forEach((key) => {
      if (cfg.paths[key] && typeof cfg.paths[key] === 'string' && cfg.paths[key].trim()) {
        pathsToSave[key] = cfg.paths[key]
      }
    })
    if (Object.keys(pathsToSave).length > 0) {
      saveData.paths = pathsToSave
    }

    saveConfig(saveData)

    currentState = LOGIN_STATE.CONNECTED
    notifyStatusChange()
    logger.info('Telegram 登录成功并保存 Session')

    ipcMain.removeAllListeners('tg-auth-reply')
    currentAuthReject = null

    return { success: true, session: sessionStr }
  } catch (error) {
    const errorMsg = error?.message || 'Unknown Error'

    if (errorMsg === 'USER_CANCEL' || errorMsg.includes('CANCEL')) {
      logger.info('登录流程被用户取消')
      currentState = LOGIN_STATE.CANCELLED
    } else {
      logger.error('登录流程发生异常:', error)
      currentState = LOGIN_STATE.AUTH_FAILED
    }

    notifyStatusChange()

    if (telegramClient) {
      await telegramClient.disconnect()
    }

    return {
      success: false,
      error: { message: errorMsg, code: error?.code }
    }
  } finally {
    isLoginInProgress = false
    currentAuthReject = null
  }
}

export function cancelAuth() {
  if (currentAuthReject) {
    currentAuthReject(new Error('USER_CANCEL'))
    currentAuthReject = null
    logger.info('触发手动取消登录')
  }
  ipcMain.removeAllListeners('tg-auth-reply')
}

function notifyStatusChange() {
  // TODO: 实现状态通知逻辑
}

export function isConnected() {
  return telegramClient && telegramClient.connected && currentState === LOGIN_STATE.CONNECTED
}

export function getConnectionState() {
  return currentState
}

export function setupTelegramIPC() {
  ipcMain.handle('tg-check-login', async () => {
    const result = await tryAutoConnect()
    return result.connected
  })

  ipcMain.handle('tg-login', async (event, loginParams) => {
    try {
      const result = await startLogin(event.sender, loginParams)
      return result
    } catch (error) {
      console.error('startLogin 异常:', error)
      return { success: false, error: { message: String(error) } }
    }
  })

  ipcMain.handle('tg-cancel-auth', () => {
    cancelAuth()
    return { success: true }
  })

  ipcMain.handle('tg-get-status', () => {
    return {
      state: currentState,
      connected: isConnected()
    }
  })

  // 上传文件逻辑
  ipcMain.on('tg-upload-files', async (event, { files, channelId }) => {
    const MAX_RETRIES = 3
    const RETRY_DELAY = 5000
    const UPLOAD_DELAY = 4000
    const STEP1_TIMEOUT = 20000
    const STEP2_TIMEOUT = 30000

    const withTimeout = (promise, ms) => {
      let timeoutId
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('TIMEOUT')), ms)
      })
      return Promise.race([
        promise.then((res) => {
          clearTimeout(timeoutId)
          return res
        }),
        timeoutPromise
      ])
    }

    const checkConnection = async () => {
      if (!telegramClient) return false
      if (!telegramClient.connected || currentState !== LOGIN_STATE.CONNECTED) {
        try {
          await telegramClient.connect()
          const isAuth = await telegramClient.isUserAuthorized()
          if (!isAuth) return false
          currentState = LOGIN_STATE.CONNECTED
          return true
        } catch {
          return false
        }
      }
      return true
    }

    // 辅助函数：发送日志
    const sendLog = (msg) => {
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('log-update', { type: 'tg', msg })
      }
    }

    if (!(await checkConnection())) {
      sendLog('❌ 未连接')
      return
    }

    sendLog(`🚀 开始上传 ${files.length} 个文件`)

    let peerId = channelId
    if (typeof channelId === 'string' && channelId.startsWith('-100')) {
      peerId = parseInt(channelId)
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const fileName = path.basename(file.path)
      const filenameNoExt = path.parse(fileName).name

      let txtMsg = null

      // ========== 步骤 1: 发送文字消息 ==========
      let step1Success = false
      let step1Attempts = 0
      while (!step1Success && step1Attempts < MAX_RETRIES) {
        step1Attempts++
        try {
          if (!(await checkConnection())) {
            sendLog(`⚠️ 连接断开，重试 (${step1Attempts}/${MAX_RETRIES})`)
            await new Promise((r) => setTimeout(r, RETRY_DELAY))
            continue
          }

          sendLog(`✉️ ${i + 1}/${files.length} 发送索引: ${filenameNoExt}`)
          sendLog(`⏳ 步骤1/2: 发送中...`)

          txtMsg = await withTimeout(
            telegramClient.sendMessage(peerId, { message: filenameNoExt }),
            STEP1_TIMEOUT
          )

          sendLog(`✅ 步骤1完成`)
          step1Success = true
        } catch (e) {
          if (e.message === 'TIMEOUT') {
            sendLog(`⏰ 步骤1超时 (${step1Attempts}/${MAX_RETRIES})`)
          } else if (e.seconds) {
            sendLog(`⏳ 流控 ${e.seconds}s...`)
            await new Promise((r) => setTimeout(r, e.seconds * 1000))
          } else {
            sendLog(`❌ 步骤1失败: ${e.message} (${step1Attempts}/${MAX_RETRIES})`)
          }

          if (step1Attempts < MAX_RETRIES) {
            sendLog(`💤 ${RETRY_DELAY / 1000}s 后重试...`)
            await new Promise((r) => setTimeout(r, RETRY_DELAY))
          }
        }
      }

      if (!step1Success) {
        sendLog(`❌ 放弃: ${filenameNoExt}`)
        if (i < files.length - 1) await new Promise((r) => setTimeout(r, UPLOAD_DELAY))
        continue
      }

      await new Promise((r) => setTimeout(r, 2000))

      // ========== 步骤 2: 上传文件 ==========
      // 修复：删除了重复的变量声明和 while 循环头
      let step2Success = false
      let step2Attempts = 0
      while (!step2Success && step2Attempts < MAX_RETRIES) {
        step2Attempts++
        try {
          if (!(await checkConnection())) {
            sendLog(`⚠️ 连接断开，重试 (${step2Attempts}/${MAX_RETRIES})`)
            await new Promise((r) => setTimeout(r, RETRY_DELAY))
            continue
          }

          sendLog(`⬆️ 步骤2/2: 上传文件: ${fileName}`)

          await new Promise((resolve, reject) => {
            let isCompleted = false
            const timeoutId = setTimeout(() => {
              if (!isCompleted) {
                isCompleted = true // 防止超时后又成功
                reject(new Error('TIMEOUT'))
              }
            }, STEP2_TIMEOUT)

            telegramClient
              .sendFile(peerId, {
                file: file.path,
                forceDocument: true,
                commentTo: txtMsg.id,
                progressCallback: (progress) => {
                  const pct = Math.round(progress * 100)
                  if (pct % 20 === 0 || pct === 100) {
                    sendLog(`[${filenameNoExt}] ${pct}%`)
                    // 100% 视为完成，清理定时器
                    if (pct === 100 && !isCompleted) {
                      isCompleted = true
                      clearTimeout(timeoutId)
                      resolve()
                    }
                  }
                }
              })
              .then(() => {
                // API 正常返回
                if (!isCompleted) {
                  isCompleted = true
                  clearTimeout(timeoutId)
                  resolve()
                }
              })
              .catch((err) => {
                if (!isCompleted) {
                  isCompleted = true
                  clearTimeout(timeoutId)
                  reject(err)
                }
              })
          })

          sendLog(`✅ 完成: ${filenameNoExt}`)
          step2Success = true
        } catch (e) {
          if (e.message === 'TIMEOUT') {
            sendLog(`⏰ 步骤2超时 (${step2Attempts}/${MAX_RETRIES})`)
          } else if (e.seconds) {
            sendLog(`⏳ 流控 ${e.seconds}s...`)
            await new Promise((r) => setTimeout(r, e.seconds * 1000))
          } else {
            sendLog(`❌ 步骤2失败: ${e.message} (${step2Attempts}/${MAX_RETRIES})`)
          }

          if (step2Attempts < MAX_RETRIES) {
            sendLog(`💤 ${RETRY_DELAY / 1000}s 后重试...`)
            await new Promise((r) => setTimeout(r, RETRY_DELAY))
          }
        }
      }

      if (!step2Success) {
        sendLog(`❌ 放弃: ${filenameNoExt}`)
      }

      if (i < files.length - 1) {
        sendLog(`💤 等待 ${UPLOAD_DELAY / 1000}s...`)
        await new Promise((r) => setTimeout(r, UPLOAD_DELAY))
      }
    }
  })
}
