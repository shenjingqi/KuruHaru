import { ref } from "vue";
import { loadConfig } from "../api/configApi";
import { readImageAsBase64, getDefaultAvatar } from "../api/systemApi";

export const useProfileBootstrap = () => {
  const userAvatar = ref("");
  const userAvatarBase64 = ref("");
  const userName = ref("");
  const defaultAvatarBase64 = ref("");

  const loadUserConfig = async () => {
    try {
      console.log("🔍 开始加载用户配置...");
      const result = await loadConfig();
      // 兼容 IPC 两种返回格式：直接配置对象或 { data } 包裹结构。
      const config = result?.data || result;
      console.log("📋 配置已加载:", config?.profile);
      if (config?.profile) {
        userAvatar.value = config.profile.avatar || "";
        userName.value = config.profile.username || "";
        console.log("👤 用户头像路径:", userAvatar.value);

        if (userAvatar.value) {
          // 有自定义头像时优先加载本地文件，失败由 catch 统一兜底。
          console.log("🖼️ 加载自定义头像...");
          userAvatarBase64.value = await readImageAsBase64(userAvatar.value);
          console.log(
            "✅ 自定义头像已加载，长度:",
            userAvatarBase64.value?.length,
          );
        } else {
          // 无自定义头像时回退默认头像，确保 UI 始终有可渲染头像源。
          console.log("🎨 加载默认头像...");
          defaultAvatarBase64.value = await getDefaultAvatar();
          console.log(
            "✅ 默认头像已加载:",
            defaultAvatarBase64.value ? "成功" : "失败",
          );
          if (defaultAvatarBase64.value) {
            console.log("📏 默认头像大小:", defaultAvatarBase64.value.length);
          }
        }
      }
      console.log(
        "📊 最终状态 - userAvatarBase64:",
        !!userAvatarBase64.value,
        "defaultAvatarBase64:",
        !!defaultAvatarBase64.value,
      );
    } catch (e) {
      // 任一加载环节异常都统一记录，避免初始化中断抛到调用层。
      console.error("❌ 加载用户配置失败:", e);
    }
  };

  return {
    userAvatar,
    userAvatarBase64,
    userName,
    defaultAvatarBase64,
    loadUserConfig,
  };
};
