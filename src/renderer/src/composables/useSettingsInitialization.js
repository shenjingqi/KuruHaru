import { onMounted, onUnmounted } from "vue";
import { onTgAuthNeeded } from "../api/tgApi";

export const useSettingsInitialization = ({
  initializeBaseSettings,
  pendingAuthData,
  tgConnected,
  tgAuthType,
  showTgAuthModal,
  tgAuthCode,
}) => {
  let unsubscribeTgAuth = null;

  const consumePendingAuthData = () => {
    // 从全局桥接态“消费一次”验证码请求，避免重复弹窗。
    if (pendingAuthData && pendingAuthData.value && !tgConnected.value) {
      console.log("[Settings] 发现待处理验证码:", pendingAuthData.value);
      tgAuthType.value = pendingAuthData.value.type;
      showTgAuthModal.value = true;
      tgAuthCode.value = "";
      pendingAuthData.value = null;
      return;
    }

    if (pendingAuthData && pendingAuthData.value && tgConnected.value) {
      console.log("[Settings] 已登录，忽略待处理验证码");
      pendingAuthData.value = null;
    }
  };

  const registerTgAuthListener = () => {
    // 已登录时不注册验证码监听，减少无效事件处理。
    if (tgConnected.value) {
      return;
    }

    unsubscribeTgAuth = onTgAuthNeeded((authData) => {
      console.log("[Settings] 收到验证码需求:", authData);
      if (!tgConnected.value) {
        tgAuthType.value = authData.type;
        showTgAuthModal.value = true;
        tgAuthCode.value = "";
      } else {
        console.log("[Settings] 已登录，忽略验证码需求");
      }
    });
  };

  onMounted(async () => {
    try {
      // 初始化顺序：先拉配置/登录态，再处理待办验证码，再挂监听。
      await initializeBaseSettings();
      consumePendingAuthData();
      registerTgAuthListener();
    } catch (e) {
      console.error("Settings: 初始化失败:", e);
    }
  });

  onUnmounted(() => {
    if (unsubscribeTgAuth) {
      // 离开设置页时释放监听，防止下次进入出现重复回调。
      unsubscribeTgAuth();
      console.log("[Settings] 已清理 tgAuth 事件监听");
    }
  });
};
