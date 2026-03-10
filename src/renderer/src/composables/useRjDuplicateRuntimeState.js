import { ref } from "vue";

const createInitialStatistics = () => ({
  totalScanned: 0,
  duplicateRJs: 0,
  messagesToDelete: 0,
  deletedCount: 0,
});

export const useRjDuplicateRuntimeState = () => {
  const scanLimit = ref(1000);
  const isScanning = ref(false);
  const isDeleting = ref(false);
  const scanResults = ref([]);
  const hasScanned = ref(false);
  const scanProgress = ref(0);
  const scanProgressText = ref("");
  const scanStatus = ref("normal");
  const statistics = ref(createInitialStatistics());

  return {
    scanLimit,
    isScanning,
    isDeleting,
    scanResults,
    hasScanned,
    scanProgress,
    scanProgressText,
    scanStatus,
    statistics,
  };
};
