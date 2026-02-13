/**
 * 数据过滤工具
 * 提供标签过滤、搜索等常用过滤逻辑
 */

/**
 * 检查项目是否匹配标签
 * @param {Array} itemTags - 项目的标签数组
 * @param {Array} activeTags - 激活的标签数组
 * @param {string} mode - 过滤模式 ('OR' | 'AND')
 * @returns {boolean} 是否匹配
 */
export function matchesTags(itemTags, activeTags, mode = 'OR') {
  // 标准化标签格式（支持字符串和对象）
  const normalizedItemTags = itemTags.map((tag) => {
    if (typeof tag === 'string') return tag
    return tag.name || tag
  })

  if (activeTags.length === 0) return true
  if (!normalizedItemTags || normalizedItemTags.length === 0) return false

  if (mode === 'OR') {
    // 并集：至少匹配一个标签
    return activeTags.some((activeTag) => normalizedItemTags.includes(activeTag))
  } else if (mode === 'AND') {
    // 交集：必须匹配所有标签
    return activeTags.every((activeTag) => normalizedItemTags.includes(activeTag))
  }

  return false
}

/**
 * 按搜索文本过滤项目
 * @param {Array} items - 项目数组
 * @param {string} searchText - 搜索文本
 * @param {Array} searchFields - 要搜索的字段数组
 * @returns {Array} 过滤后的项目数组
 */
export function filterBySearchText(items, searchText, searchFields = ['name', 'code', 'title']) {
  if (!searchText || searchText.trim() === '') return items

  const searchLower = searchText.toLowerCase().trim()

  return items.filter((item) => {
    return searchFields.some((field) => {
      const value = item[field]
      if (!value) return false
      return String(value).toLowerCase().includes(searchLower)
    })
  })
}

/**
 * 对项目数组进行排序
 * @param {Array} items - 项目数组
 * @param {string} sortBy - 排序字段 ('code' | 'name' | 'date')
 * @param {string} order - 排序顺序 ('asc' | 'desc')
 * @returns {Array} 排序后的数组
 */
export function sortItems(items, sortBy = 'code', order = 'asc') {
  const sorted = [...items]

  sorted.sort((a, b) => {
    let valueA = a[sortBy]
    let valueB = b[sortBy]

    // 处理 RJ 号排序（提取数字）
    if (sortBy === 'code') {
      const numA = parseInt(a.code?.replace(/\D/g, '')) || 0
      const numB = parseInt(b.code?.replace(/\D/g, '')) || 0
      valueA = numA
      valueB = numB
    }

    // 字符串比较
    if (typeof valueA === 'string' && typeof valueB === 'string') {
      valueA = valueA.toLowerCase()
      valueB = valueB.toLowerCase()
    }

    // 处理 null/undefined
    if (valueA == null) valueA = ''
    if (valueB == null) valueB = ''

    let comparison = 0
    if (valueA < valueB) comparison = -1
    if (valueA > valueB) comparison = 1

    return order === 'desc' ? -comparison : comparison
  })

  return sorted
}

/**
 * 从项目列表中聚合标签统计
 * @param {Array} items - 项目数组
 * @param {string} tagsField - 标签字段名（默认 'tags'）
 * @returns {Object} 标签统计对象 { tagName: count }
 */
export function aggregateTags(items, tagsField = 'tags') {
  const tagCount = {}

  items.forEach((item) => {
    const tags = item[tagsField] || []
    const normalizedTags = Array.isArray(tags) ? tags : [tags]

    normalizedTags.forEach((tag) => {
      // 标准化标签格式
      const tagName = typeof tag === 'string' ? tag : tag.name || tag

      if (tagName) {
        tagCount[tagName] = (tagCount[tagName] || 0) + 1
      }
    })
  })

  return tagCount
}
