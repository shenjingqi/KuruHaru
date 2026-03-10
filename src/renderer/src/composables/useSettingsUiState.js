import { ref, reactive } from "vue";

export const useSettingsUiState = () => {
  const isTgLogging = ref(false);
  const isAsmrLogging = ref(false);

  const showTgHash = ref(false);
  const showBotToken = ref(false);
  const showAsmrPassword = ref(false);

  const tgAuthCode = ref("");
  const tgAuthType = ref("Code");
  const showTgAuthModal = ref(false);

  const expandedPanels = reactive({
    accountStatus: true,
    telegram: false,
    asmr: false,
    systemConfig: false,
  });

  const togglePanel = (panel) => {
    expandedPanels[panel] = !expandedPanels[panel];
  };

  return {
    isTgLogging,
    isAsmrLogging,
    showTgHash,
    showBotToken,
    showAsmrPassword,
    tgAuthCode,
    tgAuthType,
    showTgAuthModal,
    expandedPanels,
    togglePanel,
  };
};
