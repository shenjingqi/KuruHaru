class BlockListManager {
  constructor() {
    this.key = "asmr_search_blocklist";
    this.presets = {
      default: [
        { type: "tag", value: "NTR", label: "NTR" },
        { type: "tag", value: "寝取", label: "寝取" },
      ],
      light: [{ type: "tag", value: "NTR", label: "NTR" }],
      strict: [
        { type: "tag", value: "NTR", label: "NTR" },
        { type: "tag", value: "寝取", label: "寝取" },
      ],
      none: [],
    };
  }
  getBlockList() {
    try {
      const saved = localStorage.getItem(this.key);
      // 本地无数据或解析失败时回退默认预设，保证首次使用可用。
      return saved ? JSON.parse(saved) : [...this.presets.default];
    } catch {
      return [...this.presets.default];
    }
  }
  saveBlockList(list) {
    localStorage.setItem(this.key, JSON.stringify(list));
  }
  addRule(rule) {
    const list = this.getBlockList();
    // 去重维度为 type+value，避免同一规则重复叠加影响查询语义。
    const exists = list.some(
      (item) => item.type === rule.type && item.value === rule.value,
    );
    if (!exists) {
      list.push({ ...rule });
      this.saveBlockList(list);
    }
    return list;
  }
  removeRule(index) {
    const list = this.getBlockList();
    if (index >= 0 && index < list.length) {
      list.splice(index, 1);
      this.saveBlockList(list);
    }
    return list;
  }
  clearBlockList() {
    this.saveBlockList([]);
    return [];
  }
  loadPreset(presetName) {
    if (this.presets[presetName]) {
      // 复制一份预设再保存，避免调用方误改内部 presets 常量。
      const preset = [...this.presets[presetName]];
      this.saveBlockList(preset);
      return preset;
    }
    return this.getBlockList();
  }
  getRuleSyntax(rule) {
    // 屏蔽规则统一转换为搜索 DSL 负向语法片段，供查询拼接直接使用。
    switch (rule.type) {
      case "tag":
        return "$-tag:" + rule.value + "$";
      case "duration":
        return "$-duration:" + rule.value + (rule.unit || "m") + "$";
      case "rate":
        return "$-rate:" + rule.value + "$";
      case "age":
        return "$-age:" + rule.value + "$";
      default:
        return "";
    }
  }
}
export default new BlockListManager();
