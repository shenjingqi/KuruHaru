import { ref, computed } from "vue";
import {
  toMessageId,
  getMessageId,
  getMessageTimestamp,
  getRowKey,
} from "../modules/rj-duplicate/message-helpers";
import { createRjDuplicateColumns } from "../modules/rj-duplicate/table-columns";

export const useRjDuplicateTableViewState = ({ scanResults, statistics }) => {
  const selectedRowKeys = ref([]);

  // 频繁命中“是否已选中”判断，转 Set 降低列表操作开销。
  const selectedRowKeySet = computed(() => new Set(selectedRowKeys.value));

  const duplicatesToDelete = computed(() => {
    return scanResults.value.filter((row) => {
      const userMessageId = getMessageId(row.userMessage);
      return (
        row.keepStatus === "delete" &&
        userMessageId !== null &&
        // 手动勾选项不进入“待批量删除”集合，避免重复提交。
        !selectedRowKeySet.value.has(userMessageId)
      );
    });
  });

  const sortedScanResults = computed(() => {
    // 排序优先级：是否重复 -> 是否待删 -> 时间倒序 -> RJ 号字典序。
    return [...scanResults.value].sort((leftRow, rightRow) => {
      const leftIsDuplicate = leftRow.isDuplicate ? 1 : 0;
      const rightIsDuplicate = rightRow.isDuplicate ? 1 : 0;
      if (leftIsDuplicate !== rightIsDuplicate) {
        return rightIsDuplicate - leftIsDuplicate;
      }

      const leftNeedsDelete = leftRow.keepStatus === "delete" ? 1 : 0;
      const rightNeedsDelete = rightRow.keepStatus === "delete" ? 1 : 0;
      if (leftNeedsDelete !== rightNeedsDelete) {
        return rightNeedsDelete - leftNeedsDelete;
      }

      const leftTime = getMessageTimestamp(leftRow.userMessage);
      const rightTime = getMessageTimestamp(rightRow.userMessage);
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }

      return String(leftRow.rjCode || "").localeCompare(
        String(rightRow.rjCode || ""),
      );
    });
  });

  const columns = createRjDuplicateColumns();

  const getRowClassName = (row) => {
    if (row.keepStatus === "keep") return "row-keep";
    if (row.keepStatus === "delete") return "row-delete";
    return "";
  };

  const handleSelectionChange = (keys) => {
    // 表格勾选 key 统一归一为 messageId，过滤非法值避免污染状态。
    selectedRowKeys.value = keys
      .map((key) => toMessageId(key))
      .filter((key) => key !== null);
  };

  const clearSelection = () => {
    selectedRowKeys.value = [];
  };

  const getResultStatusClass = () => {
    if (statistics.value.duplicateRJs === 0) {
      return "status-tag online";
    }
    return "status-tag running";
  };

  return {
    columns,
    selectedRowKeys,
    selectedRowKeySet,
    duplicatesToDelete,
    sortedScanResults,
    getRowKey,
    getRowClassName,
    handleSelectionChange,
    clearSelection,
    getResultStatusClass,
  };
};
