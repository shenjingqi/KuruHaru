/**
 * ASMR 登录工具
 * 提供标准化的 ASMR 登录流程和验证
 *
 * 以 asmr.js 的登录逻辑为主
 */

import { ipcMain, app } from 'electron'
import axios from 'axios'
import { getConfig, saveConfig } from '../modules/config'
import { createLogSender } from '../utils/logger'
import { normalizeError } from '../utils/errorHandler'
import { withRetry } from '../utils/retry'
import { getAsmrClient } from './httpClient'

// 创建日志发送器
const logger = createLogSender('asmr')

/**
 * 验证登录参数（第一步：只验证用户名和密码）
 * @param {Object} params - 登录参数 {username, password}
 * @returns {Object|null} 验证错误或null
 */
export function validateLoginParams(params) {
  const errors = []

  // 验证用户名
  if (!params.username || params.username.trim() === '') {
    errors.push('用户名不能为空')
  } else if (params.username.length < 5) {
    errors.push('用户名至少5个字符')
  }

  // 验证密码
  if (!params.password || params.password.trim() === '') {
    errors.push('密码不能为空')
  }

  // 注意：playlistId 不在第一步验证，第二步验证

  if (errors.length > 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        code: 'VALIDATION_FAILED',
        message: errors.join('; '),
        severity: 'warning',
        retryable: false,
        fieldErrors: {
          username: errors.find((e) => e.includes('用户名')),
          password: errors.find((e) => e.includes('密码'))
        }
      }
    }
  }

  return null
}

/**
 * 验证 Token 是否有效
 * @param {string} token - JWT Token
 * @returns {Promise<boolean>}
 */
export async function validateToken(token) {
  try {
    const response = await axios.get('https://api.asmr-200.com/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000
    })

    return response.status === 200
  } catch (error) {
    const normalized = normalizeError(error, { context: 'token_validation' })

    // 记录完整的 token 验证错误信息
    const errorDetails = {
      message: normalized.error.message,
      statusCode: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      headers: error.response?.headers
    }

    logger.error('ASMR Token 验证失败 - 完整错误信息:')
    logger.error(JSON.stringify(errorDetails, null, 2))

    // 401/403 表示 Token 无效或过期
    if (error.response?.status === 401 || error.response?.status === 403) {
      return false
    }

    // 其他错误认为 Token 可能有效（网络问题等）
    return true
  }
}

/**
 * 第一步：登录获取 token（只用用户名和密码）
 * @param {Object} params - 登录参数 {username, password}
 * @returns {Promise<Object>}
 */
export async function loginStep1(params) {
  // 验证输入
  const validationError = validateLoginParams(params)
  if (validationError) {
    logger.warn('ASMR 登录参数验证失败:')
    logger.warn(
      JSON.stringify(
        {
          params: {
            username: params.username,
            password: params.password ? '******' : '(empty)'
          },
          errors: validationError.error
        },
        null,
        2
      )
    )
    return validationError
  }

  try {
    logger.info('第一步：正在登录 ASMR.ONE 获取 token...')

    // 使用统一的 HTTP 客户端
    const client = getAsmrClient()

    // 使用重试机制发送登录请求
    const response = await withRetry(
      async () => {
        const res = await client.post('https://api.asmr-200.com/api/auth/me', {
          name: params.username,
          password: params.password
        })
        return res
      },
      {
        maxRetries: 2,
        backoff: 2000,
        context: 'asmr_login'
      }
    )

    // 提取 Token
    let token = null
    const data = response.data || {}

    // 尝试从响应中提取 token（支持多种格式）
    token = data.token || data.access_token || data.jwt || data.data?.token || data.auth_token

    if (token) {
      logger.info('第一步：登录成功，获取到 token')
      return {
        success: true,
        token: token,
        username: params.username
      }
    }

    // 尝试从其他位置提取 token（向后兼容）
    if (data.user && data.user.loggedIn) {
      logger.info('用户已登录但未返回 token')

      // 尝试从 cookie 中提取
      const cookies = response.headers?.['set-cookie']
      if (cookies) {
        const tokenCookie = cookies.find((c) => c.includes('token') || c.includes('jwt'))
        if (tokenCookie) {
          const match = tokenCookie.match(/(token|jwt)=([^;]+)/)
          if (match && match[2]) {
            token = match[2]

            logger.info('登录成功（从 Cookie 提取 Token）！')
            return {
              success: true,
              token: token,
              username: params.username
            }
          }
        }
      }
    }

    // 无效的响应格式
    const responseDetails = {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data
    }

    const errorMsg = response.data ? JSON.stringify(response.data).substring(0, 500) : '无响应数据'

    logger.error('ASMR 登录响应未找到 token - 完整响应信息:')
    logger.error(JSON.stringify(responseDetails, null, 2))

    const error = normalizeError(new Error('No token in response'), { context: 'asmr_login' })
    return {
      success: false,
      error: {
        ...error.error,
        message: `登录成功但未找到 token，响应格式: ${errorMsg}`,
        details: errorMsg
      }
    }
  } catch (error) {
    const normalized = normalizeError(error, { context: 'asmr_login' })

    // 记录完整的错误信息
    const errorDetails = {
      message: normalized.error.message,
      statusCode: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      headers: error.response?.headers,
      config: {
        url: error.config?.url,
        method: error.config?.method,
        headers: error.config?.headers
      }
    }

    logger.error('ASMR 登录失败 - 完整错误信息:')
    logger.error(JSON.stringify(errorDetails, null, 2))

    return {
      success: false,
      error: normalized.error
    }
  }
}

/**
 * 异步获取云端列表（用于登录后自动缓存）
 */
async function fetchCloudWorksAsync(token, playlistId) {
  // 使用统一的 HTTP 客户端
  const client = getAsmrClient()

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }

  const pageSize = 100
  const firstPageUrl = `https://api.asmr.one/api/playlist/get-playlist-works?id=${playlistId}&page=1&pageSize=${pageSize}`

  logger.info(`异步获取云端列表: ${firstPageUrl}`)
  logger.info(`使用Token: ${token.substring(0, 20)}...`)

  // 获取第一页，确定总页数
  let firstRes
  try {
    firstRes = await client.get(firstPageUrl, { headers, timeout: 30000 })
  } catch (error) {
    logger.error('获取第一页失败:', error.message)
    return { success: false, msg: error.message }
  }

  logger.info(`第一页响应状态: ${firstRes.status}`)

  // 提取第一页数据
  let items = []
  if (Array.isArray(firstRes.data)) {
    items = firstRes.data
  } else if (firstRes.data.works && Array.isArray(firstRes.data.works)) {
    items = firstRes.data.works
  } else if (firstRes.data.data && Array.isArray(firstRes.data.data)) {
    items = firstRes.data.data
  } else if (firstRes.data.items && Array.isArray(firstRes.data.items)) {
    items = firstRes.data.items
  } else if (firstRes.data.list && Array.isArray(firstRes.data.list)) {
    items = firstRes.data.list
  }

  if (items.length === 0) {
    logger.warn('第一页没有数据')
    // 通知主进程更新缓存
    ipcMain.emit('cloud-works-updated', null, { data: [] })
    return { success: true, data: [] }
  }

  // 获取总页数
  let totalPages = 1
  if (firstRes.data.pagination) {
    const pagination = firstRes.data.pagination
    totalPages = Math.ceil(pagination.totalCount / pagination.pageSize)
    logger.info(`总页数: ${totalPages}，总作品数: ${pagination.totalCount}`)
  }

  // 如果只有一页，直接返回
  if (totalPages === 1) {
    const resultData = items.map((item) => ({
      id: String(item.id),
      source_id: item.source_id,
      title: item.title,
      tags: item.tags || []
    }))

    logger.info(`获取到 ${resultData.length} 个作品`)
    // 通知主进程更新缓存
    ipcMain.emit('cloud-works-updated', null, { data: resultData })
    return { success: true, data: resultData }
  }

  // 并发获取剩余页面
  logger.info(`开始并发获取第 2-${totalPages} 页...`)
  const pagePromises = []
  for (let page = 2; page <= totalPages; page++) {
    const url = `https://api.asmr.one/api/playlist/get-playlist-works?id=${playlistId}&page=${page}&pageSize=${pageSize}`

    const fetchWithRetry = async (pageNum) => {
      let retryCount = 0
      const maxRetries = 3
      let res

      while (retryCount < maxRetries) {
        try {
          res = await client.get(url, { headers, timeout: 30000 })
          break
        } catch (error) {
          retryCount++
          if (retryCount >= maxRetries) {
            logger.error(`第 ${pageNum} 页第 ${maxRetries} 次重试后仍失败:`, error.message)
            return { pageNum, error: true, errorMsg: error.message }
          }
          logger.warn(`第 ${pageNum} 页第 ${retryCount} 次重试...`)
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
        }
      }

      return { pageNum, res }
    }

    pagePromises.push(fetchWithRetry(page))
  }

  const results = await Promise.all(pagePromises)

  // 合并所有数据
  const allItems = [...items]

  for (const result of results) {
    if (result.error) {
      logger.error(`第 ${result.pageNum} 页获取失败: ${result.errorMsg}`)
      continue
    }

    const res = result.res
    let pageItems = []
    if (Array.isArray(res.data)) {
      pageItems = res.data
    } else if (res.data.works && Array.isArray(res.data.works)) {
      pageItems = res.data.works
    } else if (res.data.data && Array.isArray(res.data.data)) {
      pageItems = res.data.data
    } else if (res.data.items && Array.isArray(res.data.items)) {
      pageItems = res.data.items
    } else if (res.data.list && Array.isArray(res.data.list)) {
      pageItems = res.data.list
    }

    logger.info(`第 ${result.pageNum} 页获取到 ${pageItems.length} 个作品`)
    allItems.push(...pageItems)
  }

  // 格式化数据
  const resultData = allItems.map((item) => ({
    id: String(item.id),
    source_id: item.source_id,
    title: item.title,
    tags: item.tags || []
  }))

  logger.info(`✅ 云端列表获取完成，共 ${resultData.length} 个作品`)

  // 使用 ipcMain 事件通知主进程
  ipcMain.emit('cloud-works-updated', null, { data: resultData })

  return { success: true, data: resultData }
}

/**
 * 导出触发函数（供 asmr.js 调用）
 */
export async function triggerCloudDataFetch() {
  // 等待 300ms，确保配置文件已写入
  await new Promise((resolve) => setTimeout(resolve, 300))

  const config = await getConfig()
  if (!config.asmr || !config.asmr.token || !config.asmr.playlistId) {
    logger.warn('未配置 ASMR 信息，无法获取云端列表')
    return
  }

  logger.info('异步触发获取云端列表...')
  logger.info(
    `配置信息: token=${config.asmr.token ? '已设置' : '未设置'}, playlistId=${config.asmr.playlistId}`
  )

  const result = await fetchCloudWorksAsync(config.asmr.token, config.asmr.playlistId)

  if (result.success) {
    logger.info(`✅ 云端列表已更新，共 ${result.data?.length || 0} 个作品`)
  } else {
    logger.error(`❌ 获取云端列表失败: ${result.msg || '未知错误'}`)
  }

  return result
}

/**
 * 执行完整登录流程
 * @param {Object} sender - IPC sender
 * @param {Object} params - 登录参数 {username, password, playlistId}
 * @returns {Promise<Object>}
 */
export async function loginAsmr(sender, params) {
  // 第一步：登录获取 token
  const loginResult = await loginStep1({
    username: params.username,
    password: params.password
  })

  if (!loginResult.success) {
    return loginResult
  }

  // 第一步成功，保存 token 和基本信息（包括密码用于自动登录）
  // 注意：只保存非空的路径配置，避免覆盖用户设置的自定义路径
  const currentConfig = await getConfig()
  const saveData = {
    asmr: {
      username: params.username,
      password: params.password,
      token: loginResult.token,
      playlistId: params.playlistId
    }
  }

  // 只包含非空的路径配置
  const pathsToSave = {}
  Object.keys(currentConfig.paths || {}).forEach((key) => {
    if (
      currentConfig.paths[key] &&
      typeof currentConfig.paths[key] === 'string' &&
      currentConfig.paths[key].trim()
    ) {
      pathsToSave[key] = currentConfig.paths[key]
    }
  })

  logger.info(`[ASMR-LOGIN] pathsToSave keys:`, Object.keys(pathsToSave))
  logger.info(`[ASMR-LOGIN] pathsToSave chineseListPath:`, pathsToSave.chineseListPath)
  logger.info(`[ASMR-LOGIN] Object.keys(pathsToSave).length:`, Object.keys(pathsToSave).length)

  if (Object.keys(pathsToSave).length > 0) {
    saveData.paths = pathsToSave
    logger.info(`[ASMR-LOGIN] saveData.paths 已设置`)
  } else {
    logger.warn(`[ASMR-LOGIN] pathsToSave 为空，saveData.paths 未设置`)
  }

  saveConfig(saveData)

  // 等待文件系统刷新，确保配置文件已写入
  await new Promise((resolve) => setTimeout(resolve, 500))

  // 登录成功后，异步获取云端列表（作为缓存）
  // 直接传递 token 和 playlistId，不重新读取配置文件
  logger.info('登录成功，异步获取云端列表作为缓存...')

  // 不等待异步获取，直接返回登录成功
  fetchCloudWorksAsync(loginResult.token, params.playlistId).catch((error) => {
    logger.error('异步获取云端列表失败:', error.message)
  })

  // 立即返回登录成功（不等待云端列表）
  logger.info('ASMR 登录成功（云端列表在异步获取中）')

  // 通知前端登录成功，前端可以重新加载配置
  app.emit('asmr-logged-in')

  return {
    success: true,
    token: loginResult.token,
    username: params.username
  }
}

/**
 * 检查当前登录状态
 * @returns {Promise<string|null>} 返回 token 或 null
 */
export async function checkAsmrLoginStatus() {
  try {
    const config = await getConfig()

    if (!config.asmr || !config.asmr.token) {
      return null
    }

    // 验证 Token 是否仍然有效
    const isValid = await validateToken(config.asmr.token)

    if (isValid) {
      return config.asmr.token
    }

    // Token 无效，清除配置
    // 注意：只保存非空的路径配置，避免覆盖用户设置的自定义路径
    const saveData = {
      asmr: {
        username: config.asmr.username || '',
        token: '',
        playlistId: config.asmr.playlistId || ''
      }
    }

    // 只包含非空的路径配置
    const pathsToSave = {}
    Object.keys(config.paths || {}).forEach((key) => {
      if (config.paths[key] && typeof config.paths[key] === 'string' && config.paths[key].trim()) {
        pathsToSave[key] = config.paths[key]
      }
    })
    if (Object.keys(pathsToSave).length > 0) {
      saveData.paths = pathsToSave
    }

    saveConfig(saveData)

    return null
  } catch (error) {
    logger.error('Check login status failed:', error.message)
    return null
  }
}

/**
 * 退出登录
 * @returns {Promise<Object>}
 */
export async function logoutAsmr() {
  try {
    const config = await getConfig()

    // 清除 Token
    // 注意：只保存非空的路径配置，避免覆盖用户设置的自定义路径
    const saveData = {
      asmr: {
        username: config.asmr?.username || '',
        token: '',
        playlistId: config.asmr?.playlistId || ''
      }
    }

    // 只包含非空的路径配置
    const pathsToSave = {}
    Object.keys(config.paths || {}).forEach((key) => {
      if (config.paths[key] && typeof config.paths[key] === 'string' && config.paths[key].trim()) {
        pathsToSave[key] = config.paths[key]
      }
    })
    if (Object.keys(pathsToSave).length > 0) {
      saveData.paths = pathsToSave
    }

    saveConfig(saveData)

    logger.info('已退出登录')
    return {
      success: true,
      message: '已退出登录'
    }
  } catch (error) {
    logger.error('Logout failed:', error.message)
    return {
      success: false,
      error: normalizeError(error, { context: 'asmr_logout' }).error
    }
  }
}

/**
 * 设置 IPC 处理器
 */
export function setupAsmrIPCHandlers() {
  // 登录相关
  ipcMain.handle('asmr-login', async (event, params) => {
    return await loginAsmr(event.sender, params)
  })

  // 检查登录状态
  ipcMain.handle('asmr-check-login', async () => {
    return await checkAsmrLoginStatus()
  })

  // 退出登录
  ipcMain.handle('asmr-logout', async () => {
    return await logoutAsmr()
  })

  // 注意：其他 IPC 处理器（load-tag-db, scan-local-ids 等）保留在 asmr.js 中
  // 这些功能不会受到登录标准化影响
}
