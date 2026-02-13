/**
 * 深度克隆工具
 * 提供更高效的深度克隆替代 JSON.parse(JSON.stringify())
 */

/**
 * 深度克隆对象
 * @param {*} obj - 要克隆的对象
 * @returns {*} 克隆后的对象
 */
export function deepClone(obj) {
  // 优先使用原生的 structuredClone (Node.js 17+, 现代浏览器)
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(obj)
  }

  // 回退方案：使用 JSON 方法
  // 注意：不支持函数、undefined、Symbol、循环引用
  return JSON.parse(JSON.stringify(obj))
}
