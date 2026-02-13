/**
 * ASMR API 数据转换工具
 * 统一处理API响应数据格式
 */

/**
 * 标准化作品数据项
 * @param {Object} item - 原始作品项
 * @returns {Object} 标准化后的作品项
 */
export function normalizeWorkItem(item) {
  return {
    id: String(item.id),
    source_id: item.source_id,
    title: item.title,
    tags: item.tags || []
  }
}

/**
 * 批量标准化作品数据
 * @param {Array} items - 原始作品数组
 * @returns {Array} 标准化后的作品数组
 */
export function normalizeWorkItems(items) {
  return items.map(normalizeWorkItem)
}
