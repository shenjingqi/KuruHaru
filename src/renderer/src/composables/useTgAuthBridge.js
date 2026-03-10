import { ref, onMounted, onUnmounted } from "vue";
import { onTgAuthNeeded } from "../api/tgApi";

export const useTgAuthBridge = ({ onAuthRequired }) => {
  const pendingAuthData = ref(null);
  let unsubscribeTgAuth = null;

  onMounted(() => {
    unsubscribeTgAuth = onTgAuthNeeded((authData) => {
      console.log("[App] 收到验证码需求，自动跳转到设置页面", authData);
      pendingAuthData.value = authData;
      if (typeof onAuthRequired === "function") {
        onAuthRequired(authData);
      }
    });
  });

  onUnmounted(() => {
    if (unsubscribeTgAuth) {
      unsubscribeTgAuth();
      console.log("[App] 已清理 tgAuth 事件监听");
    }
  });

  return {
    pendingAuthData,
  };
};
