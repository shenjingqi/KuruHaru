import { h } from "vue";
import {
  getMessageIdText,
  getSenderIdText,
  getSenderNameText,
} from "./message-helpers";

// 关联方式来自扫描结果数据；集中映射便于后端新增枚举时统一维护文案和颜色。
const associationMethodMap = {
  reply_to: { text: "reply_to", color: "#3b82f6" },
  rj_match: { text: "RJ匹配", color: "#8b5cf6" },
  no_reply: { text: "无回复", color: "#9ca3af" },
};

// keepStatus 同时驱动视觉样式与选择禁用逻辑，避免误删已标记为保留的数据行。
const keepStatusMap = {
  keep: { text: "保留", color: "#10b981", bg: "#d1fae5" },
  delete: { text: "待删除", color: "#ef4444", bg: "#fee2e2" },
};

export const createRjDuplicateColumns = () => {
  return [
    {
      type: "selection",
      // 保留项不可再选，批量删除操作只针对待删除行生效。
      disabled: (row) => row.keepStatus === "keep",
      multiple: true,
    },
    {
      title: "RJ号",
      key: "rjCode",
      width: 120,
      render(row) {
        return h(
          "div",
          {
            style: {
              fontWeight: "bold",
              color: row.isDuplicate ? "#ef4444" : "#10b981",
            },
          },
          row.rjCode,
        );
      },
    },
    {
      title: "用户消息",
      key: "userMessage",
      width: 200,
      render(row) {
        return h("div", null, [
          h(
            "div",
            { style: { fontSize: "12px", color: "#666", fontWeight: "500" } },
            `发送者: ${getSenderNameText(row.userMessage)}`,
          ),
          h(
            "div",
            { style: { fontSize: "12px", color: "#666" } },
            `ID: ${getMessageIdText(row.userMessage)}`,
          ),
          h(
            "div",
            { style: { fontSize: "12px", color: "#999" } },
            `发送者ID: ${getSenderIdText(row.userMessage)}`,
          ),
          h(
            "div",
            { style: { fontSize: "12px", color: "#999" } },
            new Date(row.userMessage.date).toLocaleString(),
          ),
        ]);
      },
    },
    {
      title: "Bot回复",
      key: "botMessage",
      width: 200,
      render(row) {
        // 扫描结果可能只抓到用户消息而无 bot 回复，需显式展示“无”而不是空白列。
        if (!row.botMessage) {
          return h("span", { style: { color: "#999" } }, "无");
        }
        return h("div", null, [
          h(
            "div",
            { style: { fontSize: "12px", color: "#666", fontWeight: "500" } },
            `发送者: ${getSenderNameText(row.botMessage)}`,
          ),
          h(
            "div",
            { style: { fontSize: "12px", color: "#666" } },
            `ID: ${getMessageIdText(row.botMessage)}`,
          ),
          h(
            "div",
            { style: { fontSize: "12px", color: "#999" } },
            `发送者ID: ${getSenderIdText(row.botMessage)}`,
          ),
          h(
            "div",
            { style: { fontSize: "12px", color: "#999" } },
            new Date(row.botMessage.date).toLocaleString(),
          ),
        ]);
      },
    },
    {
      title: "关联方式",
      key: "associationMethod",
      width: 120,
      render(row) {
        // 允许后端下发未知 associationMethod，前端保留原值并降级为中性色展示。
        const method = associationMethodMap[row.associationMethod] || {
          text: row.associationMethod,
          color: "#666",
        };
        return h(
          "span",
          { style: { color: method.color, fontSize: "12px" } },
          method.text,
        );
      },
    },
    {
      title: "状态",
      key: "keepStatus",
      width: 100,
      render(row) {
        const status = keepStatusMap[row.keepStatus];
        return h(
          "span",
          {
            style: {
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "12px",
              color: status.color,
              background: status.bg,
            },
          },
          status.text,
        );
      },
    },
  ];
};
