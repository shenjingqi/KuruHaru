/**
 * Telegram 历史文件处理模块 - 最终修复版 (v2.0)
 * * 功能亮点：
 * 1. 增量扫描：仅获取本地最新ID之后的消息，极速响应。
 * 2. 自动熔断：检测到 >150MB 的文件视为"新整合包"，自动重置计数列表。
 * 3. 冷启动回溯：若本地无缓存，自动倒序回溯查找最近的基准点。
 * 4. 稳定性：修复了下载连接、Entity解析和空指针异常。
 */

import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { ipcMain, app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getConfig, getDataDir } from './config' // 确保 config 模块路径正确

// ==========================================
// 全局配置与状态
// ==========================================

// 日志工具
const logger = {
  debug: () => {}, // 生产环境关闭 debug 以减少噪音
  info: (...args) => console.log('[tg-recent-activity]', ...args),
  warn: (...args) => console.warn('[tg-recent-activity:warn]', ...args),
  error: (...args) => console.error('[tg-recent-activity:error]', ...args)
}

// 【关键配置】整合包体积阈值：150MB
// 大于此文件的消息会被视为"新基准"，触发列表重置
const ANCHOR_SIZE_THRESHOLD = 150 * 1024 * 1024

let telegramClient = null
let isConnected = false

// 缓存：对话列表 (避免重复获取 dialogs)
let cachedDialogs = null
let cachedDialogsTime = 0
const DIALOGS_CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

// ==========================================
// 核心工具函数
// ==========================================

/**
 * 核心修复：解析 Entity (群组/频道对象)
 * 解决 CHAT_ID_INVALID 的关键：如果直接用 ID 失败，就拉取列表刷新缓存
 * 优化：添加对话列表缓存，减少重复 API 调用
 */
async function resolveEntity(_client, chatIdInput) {
  let peerId = chatIdInput

  // 1. 尝试将 ID 转为 BigInt (如果输入是字符串形式的数字)
  if (typeof chatIdInput === 'string' || typeof chatIdInput === 'number') {
    const cleanId = String(chatIdInput).trim()
    try {
      if (/^-?\d+$/.test(cleanId)) {
        peerId = BigInt(cleanId)
      }
    } catch {
      peerId = cleanId
    }
  }

  // 2. 尝试直接获取 (利用 GramJS 本地缓存)
  try {
    return await telegramClient.getEntity(peerId)
  } catch {
    logger.warn(`本地缓存未找到 ID ${chatIdInput}，正在刷新对话列表...`)
  }

  // 3. 检查缓存是否有效
  const now = Date.now()
  const isCacheValid = cachedDialogs && now - cachedDialogsTime < DIALOGS_CACHE_TTL

  // 4. 刷新对话列表 (使用缓存或获取新的)
  try {
    if (!isCacheValid) {
      logger.info('[resolveEntity] 刷新对话列表缓存')
      await telegramClient.getDialogs({ limit: 100 })
      cachedDialogs = true
      cachedDialogsTime = now
    } else {
      logger.info('[resolveEntity] 使用缓存的对话列表')
    }
    return await telegramClient.getEntity(peerId)
  } catch (e) {
    logger.error(`无法解析群组 ID: ${chatIdInput}`, e.message)
    throw new Error(`无法找到群组/频道 (ID: ${chatIdInput})。请确保机器人已加入该群组且配置正确。`)
  }
}

/**
 * 获取连接的客户端 (单例模式，防止重复连接)
 */
async function getConnectedClient() {
  const config = getConfig()
  const { apiId, apiHash, session } = config.tg

  if (!apiId || !apiHash || !session) {
    throw new Error('TG 配置不完整 (API ID, Hash 或 Session 缺失)，请在设置中检查。')
  }

  if (!isConnected || !telegramClient) {
    logger.info('正在初始化 Telegram 客户端连接...')
    telegramClient = new TelegramClient(new StringSession(session), Number(apiId), apiHash, {
      connectionRetries: 2,
      useWSS: false
    })
    // 禁用默认日志输出
    telegramClient.setLogLevel('none')
    await telegramClient.connect()
    isConnected = true
    logger.info('Telegram 客户端已连接')
  }
  return telegramClient
}

/**
 * 判断是否为基准文件（整合包）
 * 逻辑：只要体积大于 150MB，就认为是新版本的整合包
 */
function isReferenceFile(msgOrDoc) {
  let size = 0

  // 处理 document 对象 (GramJS document 结构)
  if (msgOrDoc.size && typeof msgOrDoc.size === 'number') {
    size = msgOrDoc.size
  }
  // 处理 message 对象 (包含 document)
  else if (msgOrDoc.document) {
    size = msgOrDoc.document.size
  }
  // 处理手动构造的普通对象
  else if (msgOrDoc.fileSize) {
    size = msgOrDoc.fileSize
  }

  return size >= ANCHOR_SIZE_THRESHOLD
}

/**
 * 辅助：获取文件名
 */
function getFileName(fileDocument) {
  if (!fileDocument) return 'unknown'

  // 优先从 attributes 中查找文件名
  if (fileDocument.attributes) {
    const nameAttr = fileDocument.attributes.find(
      (a) => a.className === 'DocumentAttributeFilename'
    )
    if (nameAttr && nameAttr.fileName) {
      return nameAttr.fileName
    }
  }
  if (fileDocument.name) return fileDocument.name
  return 'unknown.dat'
}

/**
 * 辅助：从文件名/文本提取 RJ 号
 */
function extractRJCode(str) {
  if (!str) return null
  // 提取 RJ/VJ/BJ + 数字 (6-8位)
  const match = str.match(/(RJ|VJ|BJ)\d{6,8}/i)
  return match ? match[0].toUpperCase() : null
}

function extractRJCodeFromMsg(msg) {
  const text = msg.text || msg.caption || ''
  return extractRJCode(text)
}

/**
 * 辅助：判断是否是有效的资源文件
 */
function isValidRJFile(msg) {
  const file = msg.document || msg // 兼容直接传 document 或 message
  const fileName = getFileName(file)

  // 1. 检查文件名后缀 (只保留压缩包)
  const supportedExtensions = /\.(zip|rar|7z|tar|gz|tgz|tar\.gz)$/i
  if (!supportedExtensions.test(fileName)) {
    return false
  }

  // 2. 检查文件大小 (只下载小于2MB的文件)
  const fileSize = file.size || 0
  const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
  if (fileSize >= MAX_FILE_SIZE) {
    return false
  }

  // 3. (可选) 如果你只想看 RJ 号文件，取消下面注释
  // if (!extractRJCode(fileName) && !extractRJCodeFromMsg(msg)) return false;

  return true
}

/**
 * 辅助：格式化文件信息为统一结构
 */
function formatFile(msg) {
  const file = msg.document
  const fileName = getFileName(file)
  const RJCode = extractRJCode(fileName) || extractRJCodeFromMsg(msg)

  const formattedFile = {
    id: RJCode || fileName, // 优先用 RJ 号做 ID
    messageId: msg.id, // Telegram 消息 ID
    tgMessageId: msg.id, // 兼容字段
    date: new Date(msg.date * 1000).toISOString(),
    timestamp: msg.date * 1000,
    name: fileName, // 文件名（前端期望的字段）
    fileName: fileName, // 兼容字段
    fileSize: file.size,
    rjCode: RJCode,
    source: 'telegram'
  }

  logger.debug(`[formatFile] Formatted file: name=${formattedFile.name}, id=${formattedFile.id}`)

  return formattedFile
}

/**
 * 辅助：去除重复文件
 */
function removeDuplicates(files) {
  const map = new Map()
  for (const file of files) {
    // 使用 tgMessageId 作为唯一键 (最准确)
    const key = file.tgMessageId || file.id
    if (!map.has(key)) {
      map.set(key, file)
    }
  }
  return Array.from(map.values())
}

// ==========================================
// 业务逻辑函数
// ==========================================

/**
 * 倒序回溯初始化：从当前时间往历史查找最近的整合包
 * 【场景】只在本地没有数据、或清空缓存后首次运行时调用
 */
async function findLatestAnchorAndFill() {
  logger.info('[初始化] 本地为空，正在倒序回溯寻找最近的整合包(>150MB)...')

  const BACKWARD_LIMIT = 2000 // 限制回溯最近 2000 条消息，避免卡死
  const tempFiles = []
  let foundAnchor = null
  let maxIdScanned = 0

  try {
    const config = getConfig()
    const chatIdStr = config.tg.discussion || config.tg.channel
    if (!chatIdStr) throw new Error('未配置讨论组或频道 ID')

    const entity = await resolveEntity(telegramClient, chatIdStr)

    // 使用 iterMessages 进行倒序遍历（从新到旧）
    const iterator = telegramClient.iterMessages(entity, { limit: BACKWARD_LIMIT })

    for await (const msg of iterator) {
      // 记录见过的最大 ID，作为下次增量扫描的起点
      if (msg.id > maxIdScanned) maxIdScanned = msg.id

      if (!msg || !msg.document) continue

      const fileName = getFileName(msg.document)

      // 1. 判断是否是整合包（基准点）
      if (isReferenceFile(msg)) {
        logger.info(
          `[初始化] 找到基准整合包: ID ${msg.id}, 大小: ${(msg.document.size / 1024 / 1024).toFixed(2)}MB, 文件名: ${fileName}`
        )
        foundAnchor = {
          messageId: msg.id,
          date: new Date(msg.date * 1000).toISOString(),
          RJCode: extractRJCode(fileName) || 'Unknown'
        }
        break // 关键：找到最新的一个大包就停止，不再往历史找
      }

      // 2. 还没找到基准，先把路过的有效 RJ 文件收集起来
      if (isValidRJFile(msg)) {
        tempFiles.push(formatFile(msg))
      }
    }

    // 因为是倒序找的 [新 -> 旧]，需要反转回 [旧 -> 新]
    tempFiles.reverse()

    if (!foundAnchor) {
      logger.warn('[初始化] 警告：在最近限制范围内未找到整合包，仅显示已扫描到的文件。')
    }

    return {
      metadata: {
        lastScannedId: maxIdScanned,
        anchor: foundAnchor,
        lastUpdated: new Date().toISOString()
      },
      files: tempFiles,
      statistics: {
        totalFiles: tempFiles.length,
        anchorRj: foundAnchor ? foundAnchor.rjCode : 'N/A'
      }
    }
  } catch (error) {
    logger.error('[初始化] 倒序回溯失败:', error.message)
    // 失败时返回空结构防止前端报错
    return {
      metadata: { lastScannedId: 0, anchor: null, lastUpdated: new Date().toISOString() },
      files: [],
      statistics: { totalFiles: 0, anchorRj: 'N/A' }
    }
  }
}

/**
 * 辅助函数：获取增量消息（使用 min_id 参数）
 */
async function getNewMessages(_client, discussionId, minId) {
  try {
    if (!discussionId) return []
    const entity = await resolveEntity(telegramClient, discussionId)

    // 使用 min_id 只获取比指定 ID 更新的消息
    // GramJS getMessages 返回顺序通常是 [最新 -> 最旧]，我们需要反转
    const messages = await telegramClient.getMessages(entity, {
      limit: 500, // 一次最多拿500条，不够再拿（通常够了）
      minId: minId
    })

    // 过滤无文件的消息并反转顺序 -> [旧 -> 新]
    return messages.filter((msg) => msg && msg.document).reverse()
  } catch (error) {
    logger.error('获取增量消息失败:', error.message)
    return []
  }
}

/**
 * 主逻辑：执行完整的最近活动扫描和保存流程
 */
export async function scanAndSaveRecentActivity() {
  try {
    const config = getConfig()
    const telegramClient = await getConnectedClient() // 确保连接

    // 1. 读取本地缓存
    const store = loadRecentActivity(config.paths.uploadHistoryDir)

    // 初始化数据结构 (如果读取失败或为空)
    let localData = {
      metadata: { lastScannedId: 0, anchor: null, lastUpdated: null },
      files: [],
      statistics: { totalFiles: 0 }
    }

    if (store.success && store.data) {
      localData = store.data
      // 防御性：确保 files 是数组
      if (!Array.isArray(localData.files)) localData.files = []
    }

    // =========================================================
    // 分支 1：如果本地无记录，执行"倒序初始化"
    // =========================================================
    if (!localData.metadata.lastScannedId) {
      logger.info('[状态] 全新环境或缓存丢失，执行回溯初始化...')
      const initData = await findLatestAnchorAndFill(telegramClient)
      saveRecentActivity(config.paths.uploadHistoryDir, initData)
      return { success: true, data: initData }
    }

    // =========================================================
    // 分支 2：执行"增量更新"
    // =========================================================
    const minId = localData.metadata.lastScannedId
    logger.info(`[状态] 增量更新，起点 Message ID: ${minId}`)

    const newMessages = await getNewMessages(telegramClient, config.tg.discussion, minId)

    if (newMessages.length === 0) {
      logger.info('没有新消息，无需更新')
      return { success: true, data: localData }
    }

    logger.info(`获取到 ${newMessages.length} 条新消息，开始处理...`)

    let hasChanges = false
    let newFilesBuffer = [] // 暂存本次发现的新资源

    for (const msg of newMessages) {
      // Check A: 发现新整合包 (体积 > 150MB)
      if (isReferenceFile(msg)) {
        logger.info(
          `🔥 [重置] 发现新整合包 (ID: ${msg.id}, Size: ${msg.document.size})，清空旧列表。`
        )

        // 1. 更新基准信息
        const fileName = getFileName(msg.document)
        localData.metadata.anchor = {
          messageId: msg.id,
          date: new Date(msg.date * 1000).toISOString(),
          RJCode: extractRJCode(fileName) || 'Unknown'
        }

        // 2. 关键：清空历史列表，重新计数！
        localData.files = []
        newFilesBuffer = [] // 清空当前缓存
        hasChanges = true

        // ✅ 修复：只在找到有效内容时更新扫描进度
        if (msg.id > localData.metadata.lastScannedId) {
          localData.metadata.lastScannedId = msg.id
        }

        continue // 整合包本身不进入资源列表
      }

      // Check B: 有效资源文件
      if (isValidRJFile(msg)) {
        newFilesBuffer.push(formatFile(msg))
        hasChanges = true

        // ✅ 修复：只在找到有效文件时更新扫描进度
        if (msg.id > localData.metadata.lastScannedId) {
          localData.metadata.lastScannedId = msg.id
        }
      }
    }

    // 合并新文件到旧列表
    if (newFilesBuffer.length > 0) {
      localData.files = [...localData.files, ...newFilesBuffer]
    }

    if (hasChanges) {
      // 去重 (防止 Message ID 重复)
      localData.files = removeDuplicates(localData.files)

      // 更新统计信息
      localData.statistics = {
        totalFiles: localData.files.length,
        anchorRj: localData.metadata.anchor?.rjCode || 'N/A'
      }
      localData.metadata.lastUpdated = new Date().toISOString()

      // 写入磁盘
      saveRecentActivity(config.paths.uploadHistoryDir, localData)
      logger.info(`更新完成，当前列表数量: ${localData.files.length}`)
    }

    return { success: true, data: localData }
  } catch (error) {
    logger.error('扫描失败:', error.message)
    return { success: false, error: error.message }
  }
}

// ==========================================
// 下载功能 (核心修复)
// ==========================================

async function downloadTelegramFileByMessage(messageId, savePath) {
  try {
    const telegramClient = await getConnectedClient()
    const config = getConfig()
    const chatIdStr = config.tg.discussion || config.tg.channel

    logger.info(`准备下载消息 ID: ${messageId} 到 ${savePath}`)

    const entity = await resolveEntity(telegramClient, chatIdStr)

    // 获取单条消息对象
    const messages = await telegramClient.getMessages(entity, { ids: [messageId] })
    const msg = messages[0]

    if (!msg || !msg.document) {
      throw new Error('未找到消息或消息不包含文件')
    }

    // 进度回调 (可选：如果前端需要进度条，可通过 IPC 发送)
    const progressCallback = () => {
      // const percent = Math.round((received / total) * 100);
      // console.log(`下载进度: ${percent}%`);
    }

    // 调用 GramJS 下载媒体
    await telegramClient.downloadMedia(msg, {
      outputFile: savePath,
      progressCallback: progressCallback,
      workers: 1 // 建议设为 1 避免某些情况下的文件损坏
    })

    logger.info('下载完成')
    return { success: true }
  } catch (e) {
    logger.error(`下载失败: ${e.message}`)
    return { success: false, error: e.message }
  }
}

// ==========================================
// 数据存取 (保持通用性)
// ==========================================

export function saveRecentActivity(outputDir, activityData) {
  try {
    let targetDir = outputDir || getDataDir() || path.join(app.getPath('userData'), 'data')

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const outputPath = path.join(targetDir, 'recent_activity.json')
    fs.writeFileSync(outputPath, JSON.stringify(activityData, null, 2), 'utf-8')
    return { success: true, filePath: outputPath }
  } catch (error) {
    logger.error('保存数据失败:', error.message)
    return { success: false, error: error.message }
  }
}

export function loadRecentActivity(inputDir) {
  try {
    let targetDir = inputDir || getDataDir() || path.join(app.getPath('userData'), 'data')
    const inputPath = path.join(targetDir, 'recent_activity.json')

    if (!fs.existsSync(inputPath)) return { success: false, error: '文件不存在' }

    const content = fs.readFileSync(inputPath, 'utf-8')
    if (!content.trim()) return { success: false, error: '文件为空' }

    const data = JSON.parse(content)

    // 兼容性处理：为旧数据添加name字段
    if (data.files && Array.isArray(data.files)) {
      let needsMigration = false
      data.files.forEach((file) => {
        if (!file.name && file.fileName) {
          file.name = file.fileName
          needsMigration = true
        }
      })

      // 如果数据被迁移，重新保存
      if (needsMigration) {
        logger.info('检测到旧版数据，已自动迁移添加name字段')
        saveRecentActivity(inputDir, data)
      }
    }

    return { success: true, data: data }
  } catch (error) {
    logger.error('读取数据失败:', error.message)
    return { success: false, error: error.message }
  }
}

// 兼容日志写入
export function saveRecentActivityLog() {
  return Promise.resolve({ success: true })
}

// ==========================================
// IPC 注册 (Electron 通信)
// ==========================================

export function setupTgHistoryIPC() {
  // 1. 扫描最近活动 (前端点击刷新时调用)
  ipcMain.handle('tg-scan-recent-activity', async () => {
    logger.info('IPC: tg-scan-recent-activity')
    return await scanAndSaveRecentActivity()
  })

  // 2. 读取缓存 (前端启动/挂载时调用)
  ipcMain.handle('tg-read-recent-activity', () => {
    const config = getConfig()
    return loadRecentActivity(config.paths?.uploadHistoryDir)
  })

  // 3. 下载文件
  ipcMain.handle('download-tg-file', async (event, { tgMessageId, fileName }) => {
    try {
      const config = getConfig()
      const downloadDir =
        config.paths?.tgDownloadDir || path.join(app.getPath('downloads'), 'TG_Downloads')

      if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })

      // 自动修正文件名
      const safeFileName = fileName || `download_${tgMessageId}.zip`
      const filePath = path.join(downloadDir, safeFileName)

      // 检查文件是否存在
      if (fs.existsSync(filePath)) {
        return { success: true, skipped: true, msg: '文件已存在', path: filePath }
      }

      if (!tgMessageId) return { success: false, error: '缺少 tgMessageId' }

      return await downloadTelegramFileByMessage(tgMessageId, filePath)
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // 4. 清除缓存
  ipcMain.handle('clear-cache', async (event, { cacheFile }) => {
    const config = getConfig()
    const targetPath = path.join(config.paths?.dataDir || getDataDir(), cacheFile)
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath)
      return { success: true }
    }
    return { success: false, error: 'File not found' }
  })

  // 5. 获取统计 (兼容旧接口)
  ipcMain.handle('tg-get-statistics', async () => {
    return { success: true, data: { zipFilesCount: 0 } }
  })

  // 6. 读取RJ号列表文件
  ipcMain.handle('read-rj-list', async (event, { path }) => {
    try {
      if (!path || !fs.existsSync(path)) {
        return { success: false, error: '文件不存在' }
      }

      const content = fs.readFileSync(path, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim())
      const rjList = []

      lines.forEach((line) => {
        // 提取RJ号（可能格式: RJ123456, rj123456, 123456）
        const match = line.match(/RJ?(\d+)/i)
        if (match) {
          rjList.push(match[1])
        } else if (/^\d+$/.test(line.trim())) {
          rjList.push(line.trim())
        }
      })

      return { success: true, data: rjList, count: rjList.length }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}
