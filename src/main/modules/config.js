import fs from 'fs'
import path from 'path'
import { app, ipcMain } from 'electron'
import { createLogSender } from '../utils/logger'

// 默认配置文件路径
const DEFAULT_CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

/**
 * 获取默认配置
 */
const DEFAULT_CONFIG = {
  // 用户配置
  profile: {
    username: 'User',
    avatar: null,
    status: 'online',
    lastActive: null
  },
  tg: {
    apiId: '',
    apiHash: '',
    phone: '',
    session: '',
    discussion: '',
    channel: ''
  },
  asmr: {
    username: '',
    password: '',
    token: '',
    playlistId: ''
  },
  paths: {
    configDir: '',
    sourceDir: '',
    toolOutputDir: '',
    whisperTargetPath: '',
    dataDir: path.join(app.getPath('userData'), 'data'),
    logsDir: path.join(app.getPath('userData'), 'logs'),
    chineseListPath: undefined,
    tgDownloadDir: path.join(app.getPath('documents'), 'KuruHaruDownloads'),
    uploadHistoryDir: path.join(app.getPath('userData'), 'data', 'upload_history')
  },
  // 上传配置
  upload: {
    channelId: ''
  },
  // 视频翻译配置
  whisper: {
    exePath: '',
    targetPath: '',
    subFormats: ['lrc']
  },
  // 日志配置
  logging: {
    level: 'info',
    enableFileLog: true
  },
  // 系统配置
  system: {
    theme: 'auto',
    language: 'zh',
    autoStart: false,
    minimizeToTray: true,
    saveCustomPaths: true
  }
}

// 创建日志发送器
const logger = createLogSender('config')

/**
 * 读取配置（直接从文件读取，不使用缓存）
 */
export function getConfig() {
  try {
    const userDataPath = app.getPath('userData')
    const defaultConfigPath = path.join(userDataPath, 'config.json')
    const projectConfigPath = path.join(process.cwd(), 'config', 'config.json')

    // 1. 读取 AppData 配置
    let appDataConfig = null
    if (fs.existsSync(defaultConfigPath)) {
      try {
        appDataConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'))
      } catch {
        // 忽略错误
      }
    }

    // 2. 读取项目配置（如果存在）
    let projectConfig = null
    if (fs.existsSync(projectConfigPath)) {
      try {
        projectConfig = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'))
      } catch {
        // 忽略错误
      }
    }

    // 3. 确定用户设置的配置文件夹路径
    // 优先使用 AppData 中的 configDir，如果没有则使用项目配置中的
    let userConfigDir = ''
    if (appDataConfig?.paths?.configDir?.trim()) {
      userConfigDir = appDataConfig.paths.configDir
    } else if (projectConfig?.paths?.configDir?.trim()) {
      userConfigDir = projectConfig.paths.configDir
    }

    // 4. 如果用户设置了 configDir，从该目录读取配置
    if (userConfigDir) {
      const userConfigPath = path.join(userConfigDir, 'config.json')
      if (fs.existsSync(userConfigPath)) {
        const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf-8'))

        // 合并所有配置，userConfig 优先级最高
        return {
          profile: { ...DEFAULT_CONFIG.profile, ...userConfig.profile },
          tg: { ...DEFAULT_CONFIG.tg, ...userConfig.tg },
          asmr: { ...DEFAULT_CONFIG.asmr, ...userConfig.asmr },
          paths: { ...DEFAULT_CONFIG.paths, ...userConfig.paths },
          upload: { ...DEFAULT_CONFIG.upload, ...userConfig.upload },
          whisper: { ...DEFAULT_CONFIG.whisper, ...userConfig.whisper },
          logging: { ...DEFAULT_CONFIG.logging, ...userConfig.logging },
          system: { ...DEFAULT_CONFIG.system, ...userConfig.system }
        }
      }
    }

    // 5. 使用 AppData 配置
    if (appDataConfig) {
      return {
        profile: { ...DEFAULT_CONFIG.profile, ...appDataConfig.profile },
        tg: { ...DEFAULT_CONFIG.tg, ...appDataConfig.tg },
        asmr: { ...DEFAULT_CONFIG.asmr, ...appDataConfig.asmr },
        paths: { ...DEFAULT_CONFIG.paths, ...appDataConfig.paths },
        upload: { ...DEFAULT_CONFIG.upload, ...appDataConfig.upload },
        whisper: { ...DEFAULT_CONFIG.whisper, ...appDataConfig.whisper },
        logging: { ...DEFAULT_CONFIG.logging, ...appDataConfig.logging },
        system: { ...DEFAULT_CONFIG.system, ...appDataConfig.system }
      }
    }
  } catch (e) {
    logger.error('Config read error:', e.message)
    return DEFAULT_CONFIG
  }
}

/**
 * 获取配置文件路径
 */
export function getConfigPath() {
  try {
    // 直接读取配置文件中的 configFilePath，不调用 getConfig() 避免递归
    if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
      try {
        const configData = JSON.parse(fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf-8'))
        if (configData.paths?.configFilePath?.trim()) {
          return configData.paths.configFilePath
        }
      } catch {
        // 忽略读取错误
      }
    }
    return DEFAULT_CONFIG_PATH
  } catch {
    return DEFAULT_CONFIG_PATH
  }
}

/**
 * 获取日志文件路径
 */
export function getLogPath(module) {
  const config = getDefaultConfig()
  const logsDir = config.paths.logsDir || path.join(app.getPath('userData'), 'logs')

  const logFiles = {
    main: 'app_main.log',
    asmr: 'asmr_asmr-login.log',
    telegram: 'telegram.log',
    upload: 'upload.log',
    delete: 'delete-tool.log',
    cleaner: 'warehouse-cleaner.log',
    whisper: 'whisper.log'
  }

  return path.join(logsDir, logFiles[module] || 'app_main.log')
}

/**
 * 保存配置
 */
// 配置保存锁，防止并发写入
let saveConfigLock = Promise.resolve()

export async function saveConfig(newConfig) {
  // 等待之前的保存完成
  await saveConfigLock

  // 创建新的锁
  let resolveLock
  saveConfigLock = new Promise((resolve) => (resolveLock = resolve))

  try {
    let configPath = DEFAULT_CONFIG_PATH

    // 获取用户设置的 configDir
    const config = getConfig()
    if (config.paths?.configDir?.trim()) {
      const userConfigDir = config.paths.configDir
      if (userConfigDir) {
        configPath = path.join(userConfigDir, 'config.json')
      }
    } else {
      configPath = DEFAULT_CONFIG_PATH
    }

    // 确保目录存在
    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    console.log(`[SAVECONFIG] 准备保存配置，configPath: ${configPath}`)

    // 读取当前配置
    const current = getConfig()
    console.log(`[SAVECONFIG] 当前 chineseListPath: ${current.paths?.chineseListPath}`)

    // 合并配置
    const final = {
      ...current,
      ...newConfig
    }

    // 只保存非空的路径配置
    const pathsToSave = {}
    Object.keys(newConfig.paths || {}).forEach((key) => {
      const value = newConfig.paths[key]
      if (value && typeof value === 'string' && value.trim()) {
        pathsToSave[key] = value.trim()
      }
    })

    console.log(`[SAVECONFIG] pathsToSave:`, pathsToSave)

    // 更新 paths 配置
    final.paths = {
      ...current.paths,
      ...pathsToSave
    }

    fs.writeFileSync(configPath, JSON.stringify(final, null, 2))

    console.log(`[SAVECONFIG] 配置保存成功，chineseListPath: "${final.paths?.chineseListPath}"`)

    return true
  } catch (e) {
    console.error('保存配置失败:', e)
    return false
  } finally {
    // 释放锁
    resolveLock()
  }
}

/**
 * 获取数据目录路径
 */
export function getDataDir() {
  try {
    const config = getConfig()
    if (!config || !config.paths) {
      const defaultPath = path.join(app.getPath('userData'), 'data')
      console.log('[getDataDir] Config invalid, using default:', defaultPath)
      return defaultPath
    }

    // 兜底处理：如果 config.paths.dataDir 是空字符串或 undefined，使用默认路径
    const dataDir = config.paths.dataDir?.trim()
    if (dataDir) {
      return dataDir
    }

    const defaultPath = path.join(app.getPath('userData'), 'data')
    console.log('[getDataDir] config.paths.dataDir is empty, using default:', defaultPath)
    return defaultPath
  } catch (e) {
    const defaultPath = path.join(app.getPath('userData'), 'data')
    console.error('[getDataDir] Error:', e.message, 'using default:', defaultPath)
    return defaultPath
  }
}

/**
 * 获取默认配置（不读取文件）
 */
export function getDefaultConfig() {
  return DEFAULT_CONFIG
}

/**
 * 设置配置 IPC
 */
export function setupConfigIPC() {
  // 每次调用都实时获取配置，确保一致性

  ipcMain.handle('get-config', () => {
    const config = getConfig()
    return { success: true, data: config }
  })

  // 通用保存配置
  ipcMain.handle('save-config', async (event, configData) => {
    try {
      const result = await saveConfig(configData)
      return { success: result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // ASMR 相关
  ipcMain.handle('get-asmr-config', () => {
    const config = getConfig()
    return { success: true, data: config.asmr }
  })

  ipcMain.handle('save-asmr-config', async (_event, _asmrConfig) => {
    try {
      const result = await saveConfig({ asmr: _asmrConfig })
      return { success: result }
    } catch (_e) {
      return { success: false, error: _e.message }
    }
  })

  // Telegram 相关
  ipcMain.handle('get-tg-config', () => {
    const config = getConfig()
    return { success: true, data: config.tg }
  })

  ipcMain.handle('save-tg-config', async (_event, _tgConfig) => {
    try {
      const result = await saveConfig({ tg: _tgConfig })
      return { success: result }
    } catch (_e) {
      return { success: false, error: _e.message }
    }
  })

  // Paths 相关
  ipcMain.handle('get-paths', () => {
    const config = getConfig()
    return { success: true, data: config.paths }
  })

  ipcMain.handle('save-paths', async (_event, paths) => {
    try {
      const result = await saveConfig({ paths })
      return { success: result }
    } catch (_e) {
      return { success: false, error: _e.message }
    }
  })

  // Upload 相关
  ipcMain.handle('get-upload-config', () => {
    const config = getConfig()
    return { success: true, data: config.upload }
  })

  ipcMain.handle('save-upload-config', async (_event, upload) => {
    try {
      const result = await saveConfig({ upload })
      return { success: result }
    } catch (_e) {
      return { success: false, error: _e.message }
    }
  })

  // Whisper 相关
  ipcMain.handle('get-whisper-config', () => {
    const config = getConfig()
    return { success: true, data: config.whisper }
  })

  ipcMain.handle('save-whisper-config', async (event, whisper) => {
    try {
      const result = await saveConfig({ whisper })
      return { success: result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // System 相关
  ipcMain.handle('get-system-config', () => {
    const config = getConfig()
    return { success: true, data: config.system }
  })

  ipcMain.handle('save-system-config', async (event, system) => {
    try {
      const result = await saveConfig({ system })
      return { success: result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  // Logging 相关
  ipcMain.handle('get-logging-config', () => {
    const config = getConfig()
    return { success: true, data: config.logging }
  })

  ipcMain.handle('save-logging-config', async (event, logging) => {
    try {
      const result = await saveConfig({ logging })
      return { success: result }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  console.log('配置模块已加载')
}
