import { tgLogin, tgCheckLogin, tgAuthReply } from "../api/tgApi";
import { asmrLogin, asmrFetchCloudWorks } from "../api/asmrApi";

export const useSettingsAuthFlows = ({
  config,
  tgConnected,
  asmrLoggedIn,
  isTgLogging,
  isAsmrLogging,
  pendingAuthData,
  tgAuthCode,
  showTgAuthModal,
  showToastMessage,
  saveAllSettings,
}) => {
  const handleTelegramAction = async () => {
    if (tgConnected.value) {
      tgConnected.value = false;
      showToastMessage("已退出 Telegram 登录");
    } else {
      isTgLogging.value = true;
      const loginPayload = JSON.parse(
        JSON.stringify({
          apiId: config.tg.apiId,
          apiHash: config.tg.apiHash,
          phone: config.tg.phone,
        }),
      );
      const res = await tgLogin(loginPayload);
      isTgLogging.value = false;
      if (res.success) {
        tgConnected.value = true;
        config.tg.session = res.session;
        showToastMessage("Telegram 登录成功");
        // 登录成功后清理待处理验证码，防止重复弹窗
        if (pendingAuthData && pendingAuthData.value) {
          console.log("[Settings] 登录成功，清理待处理验证码");
          pendingAuthData.value = null;
        }
        saveAllSettings();
      } else {
        const errorMsg =
          res.msg ||
          res.error?.message ||
          (typeof res.error === "string"
            ? res.error
            : JSON.stringify(res.error)) ||
          "未知错误";
        showToastMessage("登录失败: " + errorMsg, "error");
      }
    }
  };

  const testTelegramConnection = async () => {
    showToastMessage("测试连接中...");
    const isConnected = await tgCheckLogin();
    tgConnected.value = isConnected;
    showToastMessage(
      isConnected ? "连接正常" : "未连接",
      isConnected ? "success" : "warning",
    );
  };

  const handleAsmrAction = async () => {
    if (asmrLoggedIn.value) {
      asmrLoggedIn.value = false;
      config.asmr.token = "";
      showToastMessage("已退出登录");
    } else {
      if (!config.asmr.username || !config.asmr.password) {
        showToastMessage("请输入用户名和密码", "warning");
        return;
      }
      isAsmrLogging.value = true;
      const loginPayload = JSON.parse(
        JSON.stringify({
          username: config.asmr.username,
          password: config.asmr.password,
          playlistId: config.asmr.playlistId,
        }),
      );
      const res = await asmrLogin(loginPayload);
      isAsmrLogging.value = false;
      if (res.success && res.token) {
        asmrLoggedIn.value = true;
        config.asmr.token = res.token;
        showToastMessage("登录成功");
        saveAllSettings();
        // 登录成功后刷新云端列表
        showToastMessage("正在刷新云端列表...", "info");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await asmrFetchCloudWorks();
      } else {
        showToastMessage("登录失败: " + (res.msg || "未知错误"), "error");
      }
    }
  };

  const submitTgAuth = () => {
    tgAuthReply({ code: tgAuthCode.value, cancel: false });
    showTgAuthModal.value = false;
  };

  const cancelTgAuth = () => {
    tgAuthReply({ code: "", cancel: true });
    showTgAuthModal.value = false;
  };

  return {
    handleTelegramAction,
    testTelegramConnection,
    handleAsmrAction,
    submitTgAuth,
    cancelTgAuth,
  };
};
