import { onMounted } from "vue";
import { useRecentActivitySelectionFilter } from "./useRecentActivitySelectionFilter";
import { useRecentActivityDownload } from "./useRecentActivityDownload";
import {
  formatRecentActivityDate,
  formatRecentActivitySize,
} from "./useRecentActivityFormatters";

export const useRecentActivityPageController = ({ message, dialog }) => {
  const selectionState = useRecentActivitySelectionFilter({ message, dialog });

  const downloadState = useRecentActivityDownload({
    selectedFiles: selectionState.selectedFiles,
  });

  onMounted(() => {
    selectionState.loadRecentActivity();
  });

  return {
    ...selectionState,
    ...downloadState,
    formatDate: formatRecentActivityDate,
    formatSize: formatRecentActivitySize,
  };
};
