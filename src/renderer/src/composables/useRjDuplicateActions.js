import { tgScanRjDuplicates, tgDeleteDuplicateMessages } from "../api/tgApi";
import {
  toMessageId,
  getMessageId,
  getSenderId,
  getSenderName,
  collectMessageIds,
} from "../modules/rj-duplicate/message-helpers";

const getDeleteFailureText = (result) => {
  const firstError = Array.isArray(result?.errors) ? result.errors[0] : null;
  if (!firstError) {
    return result?.error || "未知错误";
  }

  const reason = firstError.error || firstError.message || "未知错误";
  const code =
    firstError.code !== undefined && firstError.code !== null
      ? ` (code=${firstError.code})`
      : "";

  return `${reason}${code}`;
};

const confirmDeleteAction = (dialog, options) => {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (value) => {
      // 弹窗可能触发多个关闭路径，只允许第一次结果生效，避免重复 resolve。
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    dialog.warning({
      ...options,
      onPositiveClick: () => {
        settle(true);
        return true;
      },
      onNegativeClick: () => {
        settle(false);
        return true;
      },
      onClose: () => {
        settle(false);
      },
      onMaskClick: () => {
        settle(false);
      },
    });
  });
};

export const useRjDuplicateActions = ({
  message,
  dialog,
  scanLimit,
  isScanning,
  isDeleting,
  scanResults,
  hasScanned,
  scanProgress,
  scanProgressText,
  scanStatus,
  selectedRowKeys,
  statistics,
  duplicatesToDelete,
  selectedRowKeySet,
}) => {
  const applyDeletedMessageIds = (deletedMessageIds) => {
    // 后端回传 message id 可能混杂类型，这里统一归一后再做集合匹配。
    const deletedIds = new Set(
      (Array.isArray(deletedMessageIds) ? deletedMessageIds : [])
        .map((id) => toMessageId(id))
        .filter((id) => id !== null),
    );

    if (deletedIds.size === 0) {
      return;
    }

    scanResults.value = scanResults.value.filter((row) => {
      const userMessageId = getMessageId(row.userMessage);
      const botMessageId = getMessageId(row.botMessage);

      // 成对消息只要任一侧被删除，就从列表移除，保持 UI 与真实状态一致。
      return (
        (userMessageId === null || !deletedIds.has(userMessageId)) &&
        (botMessageId === null || !deletedIds.has(botMessageId))
      );
    });

    selectedRowKeys.value = [];
    statistics.value.messagesToDelete = scanResults.value.filter(
      (row) => row.keepStatus === "delete",
    ).length;
  };

  const handleScan = async () => {
    // 新一轮扫描前先重置进度与选择态，避免残留上次结果影响当前操作。
    isScanning.value = true;
    hasScanned.value = true;
    scanProgress.value = 0;
    scanProgressText.value = "正在连接到Telegram...";
    scanStatus.value = "normal";
    selectedRowKeys.value = [];

    try {
      console.info("[RJ重复检测] tg-scan-rj-duplicates 请求", {
        limit: scanLimit.value,
      });

      const result = await tgScanRjDuplicates({
        limit: scanLimit.value,
      });

      console.info("[RJ重复检测] tg-scan-rj-duplicates 响应", {
        success: result?.success,
        duplicateCount: result?.duplicates?.length ?? 0,
        statistics: result?.statistics,
        sample: Array.isArray(result?.duplicates)
          ? result.duplicates.slice(0, 3).map((row) => ({
              rjCode: row.rjCode,
              userMessageId: getMessageId(row.userMessage),
              userSenderId: getSenderId(row.userMessage),
              userSenderName: getSenderName(row.userMessage),
              botMessageId: getMessageId(row.botMessage),
              botSenderId: getSenderId(row.botMessage),
              botSenderName: getSenderName(row.botMessage),
            }))
          : [],
      });

      if (result.success) {
        scanResults.value = Array.isArray(result.duplicates)
          ? result.duplicates
          : [];
        statistics.value = result.statistics;
        message.success(
          `扫描完成，找到 ${result.statistics.duplicateRJs} 个重复RJ号`,
        );
      } else {
        message.error(`扫描失败: ${result.error}`);
      }
    } catch (error) {
      message.error(`扫描失败: ${error.message}`);
    } finally {
      isScanning.value = false;
      scanProgress.value = 100;
      scanProgressText.value = "扫描完成";
      scanStatus.value = scanResults.value.length > 0 ? "warning" : "success";
    }
  };

  const handleBatchDelete = async () => {
    const messageIds = collectMessageIds(duplicatesToDelete.value);

    if (messageIds.length === 0) {
      message.warning("没有需要删除的消息");
      return;
    }

    const confirmed = await confirmDeleteAction(dialog, {
      title: "确认删除",
      content: `确定要删除 ${duplicatesToDelete.value.length} 个待删除配对中的所有消息吗？此操作不可恢复。`,
      positiveText: "删除",
      negativeText: "取消",
    });

    if (!confirmed) return;

    isDeleting.value = true;
    try {
      console.info("[RJ重复检测] tg-delete-duplicate-messages 请求", {
        scene: "batch",
        pairCount: duplicatesToDelete.value.length,
        messageIds,
      });

      const result = await tgDeleteDuplicateMessages(messageIds);

      console.info("[RJ重复检测] tg-delete-duplicate-messages 响应", {
        scene: "batch",
        success: result?.success,
        deletedCount: result?.deletedCount,
        errors: result?.errors,
      });

      const deletedCount = Number(result?.deletedCount || 0);
      if (deletedCount > 0) {
        statistics.value.deletedCount += deletedCount;
        applyDeletedMessageIds(result?.deletedMessageIds || []);
      }

      // 保留 success/partial/fail 三态提示，方便用户区分是否需要重试。
      if (result?.success) {
        message.success(`成功删除 ${deletedCount} 条消息`);
      } else if (result?.partial) {
        message.warning(
          `部分删除成功：成功 ${deletedCount} 条，失败 ${result?.errors?.length || 0} 条。失败原因：${getDeleteFailureText(result)}`,
        );
      } else {
        message.error(`删除失败：${getDeleteFailureText(result)}`);
      }
    } catch (error) {
      message.error(`删除失败: ${error.message}`);
    } finally {
      isDeleting.value = false;
    }
  };

  const handleSelectedDelete = async () => {
    const selectedData = scanResults.value.filter((row) =>
      selectedRowKeySet.value.has(getMessageId(row.userMessage)),
    );

    const messageIds = collectMessageIds(selectedData);

    if (messageIds.length === 0) {
      message.warning("没有选中的消息");
      return;
    }

    const confirmed = await confirmDeleteAction(dialog, {
      title: "确认删除",
      content: `确定要删除选中的 ${selectedData.length} 个配对中的所有消息吗？此操作不可恢复。`,
      positiveText: "删除",
      negativeText: "取消",
    });

    if (!confirmed) return;

    isDeleting.value = true;
    try {
      console.info("[RJ重复检测] tg-delete-duplicate-messages 请求", {
        scene: "selected",
        selectedPairs: selectedData.length,
        messageIds,
      });

      const result = await tgDeleteDuplicateMessages(messageIds);

      console.info("[RJ重复检测] tg-delete-duplicate-messages 响应", {
        scene: "selected",
        success: result?.success,
        deletedCount: result?.deletedCount,
        errors: result?.errors,
      });

      const deletedCount = Number(result?.deletedCount || 0);
      if (deletedCount > 0) {
        statistics.value.deletedCount += deletedCount;
        applyDeletedMessageIds(result?.deletedMessageIds || []);
      }

      // 选中删除与批量删除复用同一反馈策略，保证交互预期一致。
      if (result?.success) {
        message.success(`成功删除 ${deletedCount} 条消息`);
      } else if (result?.partial) {
        message.warning(
          `部分删除成功：成功 ${deletedCount} 条，失败 ${result?.errors?.length || 0} 条。失败原因：${getDeleteFailureText(result)}`,
        );
      } else {
        message.error(`删除失败：${getDeleteFailureText(result)}`);
      }
    } catch (error) {
      message.error(`删除失败: ${error.message}`);
    } finally {
      isDeleting.value = false;
    }
  };

  return {
    handleScan,
    handleBatchDelete,
    handleSelectedDelete,
  };
};
