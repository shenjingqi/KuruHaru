import { openDirectory, openFile } from "../api/dialogApi";

export const useSettingsPathPickers = ({
  config,
  saveAllSettings,
  showToastMessage,
}) => {
  const selectLogsPath = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      config.paths.logsDir = res.filePath;
      // 立即保存，不等待防抖
      saveAllSettings();
    }
  };

  const selectConfigDir = async () => {
    const res = await openDirectory();
    if (res && res.filePath) {
      config.paths.configDir = res.filePath;
      // 立即保存，不等待防抖
      saveAllSettings();
    }
  };

  // 浏览选择 TG 下载目录
  const browseTgDownloadDir = async () => {
    try {
      const res = await openDirectory();
      if (res && res.filePath) {
        config.paths.tgDownloadDir = res.filePath;
        // 立即保存，不等待防抖
        saveAllSettings();
      }
    } catch (e) {
      showToastMessage("选择目录失败: " + e.message, "error");
    }
  };

  // 浏览选择前置包 txt 文件
  const browsePrePackageFile = async () => {
    try {
      const res = await openFile({ type: "file" });
      const selectedPath =
        res?.filePath ||
        (Array.isArray(res?.filePaths) ? res.filePaths[0] : null);

      if (selectedPath) {
        config.tg.prePackagePath = selectedPath;
        saveAllSettings();
      }
    } catch (e) {
      showToastMessage("选择前置包文件失败: " + e.message, "error");
    }
  };

  return {
    selectLogsPath,
    selectConfigDir,
    browseTgDownloadDir,
    browsePrePackageFile,
  };
};
