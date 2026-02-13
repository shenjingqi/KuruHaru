class BlockListManager {
  constructor() {
    this.key = 'asmr_search_blocklist'
    this.presets = {
      default: [
        { type: 'tag', value: 'NTR', label: 'NTR' },
        { type: 'tag', value: '寝取', label: '寝取' }
      ],
      light: [{ type: 'tag', value: 'NTR', label: 'NTR' }],
      strict: [
        { type: 'tag', value: 'NTR', label: 'NTR' },
        { type: 'tag', value: '寝取', label: '寝取' }
      ],
      none: []
    }
  }
  getBlockList() {
    try {
      const saved = localStorage.getItem(this.key)
      return saved ? JSON.parse(saved) : [...this.presets.default]
    } catch {
      return [...this.presets.default]
    }
  }
  saveBlockList(list) {
    localStorage.setItem(this.key, JSON.stringify(list))
  }
  addRule(rule) {
    const list = this.getBlockList()
    const exists = list.some((item) => item.type === rule.type && item.value === rule.value)
    if (!exists) {
      list.push({ ...rule })
      this.saveBlockList(list)
    }
    return list
  }
  removeRule(index) {
    const list = this.getBlockList()
    if (index >= 0 && index < list.length) {
      list.splice(index, 1)
      this.saveBlockList(list)
    }
    return list
  }
  clearBlockList() {
    this.saveBlockList([])
    return []
  }
  loadPreset(presetName) {
    if (this.presets[presetName]) {
      const preset = [...this.presets[presetName]]
      this.saveBlockList(preset)
      return preset
    }
    return this.getBlockList()
  }
  getRuleSyntax(rule) {
    switch (rule.type) {
      case 'tag':
        return '$-tag:' + rule.value + '$'
      case 'duration':
        return '$-duration:' + rule.value + (rule.unit || 'm') + '$'
      case 'rate':
        return '$-rate:' + rule.value + '$'
      case 'age':
        return '$-age:' + rule.value + '$'
      default:
        return ''
    }
  }
}
export default new BlockListManager()
