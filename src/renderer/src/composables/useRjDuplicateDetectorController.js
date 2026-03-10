import { useRjDuplicateActions } from "./useRjDuplicateActions";
import { useRjDuplicateRuntimeState } from "./useRjDuplicateRuntimeState";
import { useRjDuplicateTableViewState } from "./useRjDuplicateTableViewState";

export const useRjDuplicateDetectorController = ({ message, dialog }) => {
  const runtimeState = useRjDuplicateRuntimeState();

  const tableViewState = useRjDuplicateTableViewState({
    scanResults: runtimeState.scanResults,
    statistics: runtimeState.statistics,
  });

  const actions = useRjDuplicateActions({
    message,
    dialog,
    scanLimit: runtimeState.scanLimit,
    isScanning: runtimeState.isScanning,
    isDeleting: runtimeState.isDeleting,
    scanResults: runtimeState.scanResults,
    hasScanned: runtimeState.hasScanned,
    scanProgress: runtimeState.scanProgress,
    scanProgressText: runtimeState.scanProgressText,
    scanStatus: runtimeState.scanStatus,
    selectedRowKeys: tableViewState.selectedRowKeys,
    statistics: runtimeState.statistics,
    duplicatesToDelete: tableViewState.duplicatesToDelete,
    selectedRowKeySet: tableViewState.selectedRowKeySet,
  });

  return {
    ...runtimeState,
    ...tableViewState,
    ...actions,
  };
};
