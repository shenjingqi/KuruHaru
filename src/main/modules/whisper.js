import { ipcMain } from "electron";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import archiver from "archiver";
import { createLogSender } from "../utils/logger";

// 创建日志发送器
const logger = createLogSender("whisper");

export function setupWhisperIPC() {
  let pythonProcess = null;

  // 🟢 辅助函数：递归扫描子目录（用于原地打包）
  function scanSubDir(dir, basePath, fileList, onFile) {
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);

        if (stat.isDirectory()) {
          scanSubDir(full, basePath, fileList, onFile);
        } else if (
          [".srt", ".lrc", ".vtt", ".txt", ".ass"].includes(
            path.extname(item).toLowerCase(),
          )
        ) {
          fileList.push({ full, rel: path.relative(basePath, full) });
          if (onFile) onFile(stat);
        }
      }
    } catch {
      // 忽略读取错误
    }
  }

  // 🟢 辅助函数：原地打包（输出目录和源目录相同），避免扫描到zip文件
  async function packFolderInPlace(event, folderPath, rjCode) {
    const outputName = `${rjCode}.zip`;
    const outputPath = path.join(folderPath, outputName);

    // 扫描字幕文件（先收集所有文件）
    const filesToZip = [];
    let maxMtime = 0;

    try {
      const allItems = fs.readdirSync(folderPath);
      for (const f of allItems) {
        // 跳过 zip 文件本身（包括旧的）
        if (f.toLowerCase() === outputName.toLowerCase()) continue;

        const full = path.join(folderPath, f);
        const stat = fs.statSync(full);

        if (stat.isDirectory()) {
          // 递归扫描子目录（不递归到zip文件，因为zip文件不是目录）
          scanSubDir(full, folderPath, filesToZip, (stat) => {
            if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
          });
        } else if (
          [".srt", ".lrc", ".vtt", ".txt", ".ass"].includes(
            path.extname(f).toLowerCase(),
          )
        ) {
          filesToZip.push({ full, rel: path.relative(folderPath, full) });
          if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
        }
      }
    } catch (e) {
      logger.error(`扫描文件夹失败: ${e.message}`);
      return { success: false, msg: `扫描失败: ${e.message}` };
    }

    if (filesToZip.length === 0) {
      return { success: false, msg: "无字幕文件" };
    }

    // 检查是否有更新
    if (fs.existsSync(outputPath)) {
      const zipStat = fs.statSync(outputPath);
      if (zipStat.mtimeMs >= maxMtime) {
        logger.info(`跳过 ${outputName} (已是最新)`);
        return {
          success: true,
          msg: "已跳过 (已是最新)",
          fileCount: filesToZip.length,
          skipped: true,
        };
      }
      // 有更新：删除旧zip
      logger.info(`检测到更新，删除旧zip: ${outputName}`);
      fs.unlinkSync(outputPath);
    }

    logger.info(`打包中: ${outputName}`);

    return new Promise((resolve) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => {
        logger.info(`打包完成: ${outputName}`);
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send("task-finished", {
            taskType: "pack",
            success: true,
            msg: `文件已生成: ${outputName}`,
          });
        }
        resolve({
          success: true,
          msg: `已打包 ${filesToZip.length} 个字幕文件`,
          outputPath,
          fileCount: filesToZip.length,
        });
      });

      archive.on("error", (e) => {
        logger.error(e.message);
        resolve({ success: false, msg: e.message });
      });

      archive.on("warning", (err) => {
        if (err.code !== "ENOENT") {
          logger.warn(err.message);
        }
      });

      archive.pipe(output);
      filesToZip.forEach((f) => archive.file(f.full, { name: f.rel }));
      archive.finalize();
    });
  }

  // 新增：统计文件数 (给前端用)
  ipcMain.handle("count-media-files", async (event, dirPath) => {
    if (!fs.existsSync(dirPath)) return 0;
    let count = 0;
    const exts = [".mp4", ".mkv", ".avi", ".mp3", ".wav", ".flac", ".m4a"];
    function scan(d) {
      try {
        fs.readdirSync(d).forEach((f) => {
          const full = path.join(d, f);
          if (fs.statSync(full).isDirectory()) scan(full);
          else if (exts.includes(path.extname(f).toLowerCase())) count++;
        });
      } catch {
        // Ignore scan errors
      }
    }
    scan(dirPath);
    return count;
  });

  // 1. 开始翻译
  ipcMain.on("start-task", (event, config) => {
    // 写入任务开始标记
    const exePath = config?.exePath || "";
    const logPath = exePath
      ? path.join(path.dirname(exePath), "latest.log")
      : "";
    if (logPath) {
      fs.appendFileSync(logPath, "[TASK_START]\n", "utf-8");
    }

    logger.info("收到 start-task 事件");
    logger.info("config 参数原始值: " + JSON.stringify(config));
    logger.info("config 类型: " + typeof config);
    logger.info("config 是否为 null: " + (config === null));
    logger.info("config 是否为 undefined: " + (config === undefined));
    logger.info(
      "config 键值: " + (config ? Object.keys(config).join(",") : "N/A"),
    );

    const targetPath = config?.targetPath || "";
    const subFormats = config?.subFormats || [];

    logger.info("提取的 targetPath: " + targetPath);
    logger.info("提取的 subFormats: " + JSON.stringify(subFormats));

    // 验证必要参数
    if (!exePath) {
      logger.error("错误：exePath 为空，无法启动引擎");
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send("task-finished", {
          taskType: "translate",
          error: "引擎路径未设置",
        });
      }
      return;
    }

    if (!targetPath) {
      logger.error("错误：targetPath 为空，无法启动引擎");
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send("task-finished", {
          taskType: "translate",
          error: "目标路径未设置",
        });
      }
      return;
    }

    // 确保只传入用户选择的格式
    const formats =
      Array.isArray(subFormats) && subFormats.length > 0
        ? subFormats.join(",")
        : "srt";

    // 使用正确的参数格式：--sub_formats="lrc" 而非 --sub_formats lrc
    const args = [
      "--audio_suffixes=mp3,wav,flac,m4a,aac,ogg,wma,mp4,mkv,avi,mov,webm,flv,wmv",
      "--sub_formats=" + formats,
      "--device=cuda",
      targetPath,
    ];

    // 使用 shell:true + 命令行字符串，避免参数解析问题
    const command = exePath + " " + args.join(" ");
    logger.info("完整命令字符串: " + command);

    const spawnOptions = {
      shell: true,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    };

    try {
      logger.info("[SPAWN] 准备启动进程...");

      let spawnError = null;
      try {
        // Windows: 使用 cmd /c 来运行命令
        pythonProcess = spawn("cmd", ["/c", command], spawnOptions);
      } catch (e) {
        spawnError = e;
        logger.error("[SPAWN] spawn() 调用异常: " + e.message);
      }

      if (spawnError) {
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send("task-finished", {
            taskType: "translate",
            error: spawnError.message,
          });
        }
        pythonProcess = null;
        return;
      }

      logger.info(
        "[SPAWN] 进程对象已创建, pid: " +
          (pythonProcess ? pythonProcess.pid : "null"),
      );

      if (!pythonProcess) {
        logger.error("[SPAWN] 错误: spawn() 返回 null");
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send("task-finished", {
            taskType: "translate",
            error: "spawn() returned null",
          });
        }
        pythonProcess = null;
        return;
      }

      let stderrBuffer = "";
      let stdoutBuffer = "";
      let totalFiles = 0;
      let processedFiles = 0;
      let lastLogLine = ""; // 用于去重

      logger.info("[DEBUG] stdout exists: " + !!pythonProcess.stdout);
      logger.info("[DEBUG] stderr exists: " + !!pythonProcess.stderr);

      // 从 stderr 解析进度和日志
      const parseStderrLine = (line) => {
        // 发送到前端（去重）
        if (line === lastLogLine) return;
        lastLogLine = line;
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send("log-update", { type: "whisper", msg: line });
        }

        // 检测进度：找到 x 个文件待处理
        const fileCountMatch = line.match(/找到\s*(\d+)\s*个文件待处理/);
        if (fileCountMatch) {
          totalFiles = parseInt(fileCountMatch[1]);
          logger.info("[进度] 总文件数: " + totalFiles);
        }

        // 检测进度：正在翻译（1/3）
        const progressMatch = line.match(/正在翻译[（(](\d+)[）)]/);
        if (progressMatch) {
          processedFiles = parseInt(progressMatch[1]);
          const total = parseInt(progressMatch[2]);
          const percent = Math.round((processedFiles / total) * 100);
          const filePath = line.match(/：(.+)/);
          const fileName = filePath ? filePath[1].split(/[/\\]/).pop() : "";

          if (event.sender && !event.sender.isDestroyed()) {
            event.sender.send("log-update", {
              type: "whisper-progress",
              progress: percent,
              currentFile: fileName,
              totalFiles: total,
              file: fileName,
            });
          }
          logger.info(
            "[进度] " + processedFiles + "/" + total + " = " + percent + "%",
          );
        }

        // 提取文件名：正在处理：xxx
      };

      // 处理按行分割的数据
      const processBufferedData = (data, buffer, isStderr) => {
        buffer += data.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) continue;

          if (isStderr) {
            stderrBuffer += line + "\n";
            parseStderrLine(line);
          } else {
            stdoutBuffer += line + "\n";
            logger.info("[STDOUT] " + line);
          }
        }
        return buffer;
      };

      if (pythonProcess.stdout) {
        pythonProcess.stdout.on("data", (data) => {
          stdoutBuffer = processBufferedData(data, stdoutBuffer, false);
        });
      }

      if (pythonProcess.stderr) {
        pythonProcess.stderr.on("data", (data) => {
          stderrBuffer = processBufferedData(data, stderrBuffer, true);
        });
      }

      pythonProcess.on("error", (err) => {
        logger.error("[PROCESS_ERROR] Python 进程错误: " + err.message);
        logger.error("[PROCESS_ERROR] 错误代码: " + err.code);
        logger.error("[PROCESS_ERROR] 错误名称: " + err.name);
        if (event.sender && !event.sender.isDestroyed()) {
          event.sender.send("task-finished", {
            taskType: "translate",
            error: err.message,
          });
        }
        pythonProcess = null;
      });

      pythonProcess.on("close", (code, signal) => {
        logger.info("引擎关闭 - 退出码: " + code + ", 信号: " + signal);

        if (code !== 0 && code !== null) {
          logger.error("[ERROR] Python 异常退出，码: " + code);
          if (stderrBuffer.trim()) {
            logger.error("[ERROR] 捕获的 stderr 输出:");
            logger.error(stderrBuffer);
          }
        }

        if (event.sender && !event.sender.isDestroyed()) {
          let errorMsg = undefined;
          if (code !== 0 && code !== null) {
            errorMsg = "进程异常退出 (退出码: " + code + ")";
            if (stderrBuffer.trim()) {
              errorMsg +=
                "\n错误信息: " +
                stderrBuffer.split("\n").slice(0, 5).join("\n");
            }
          }
          event.sender.send("task-finished", {
            taskType: "translate",
            error: errorMsg,
          });
        }
        pythonProcess = null;
      });

      // 5秒后检查进程是否还在运行（用于调试）
      setTimeout(() => {
        if (pythonProcess && !pythonProcess.killed) {
          logger.info(
            "[DEBUG] 5秒后检查 - 进程仍运行中, pid: " + pythonProcess.pid,
          );
          logger.info("[DEBUG] 进程是否已退出: " + pythonProcess.killed);
          logger.info("[DEBUG] 进程退出码: " + pythonProcess.exitCode);
        }
      }, 5000);
    } catch (err) {
      logger.error("[启动错误] 启动 Python 进程失败: " + err.message);
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send("task-finished", {
          taskType: "translate",
          error: err.message,
        });
      }
      pythonProcess = null;
    }
  });

  // 2. 停止
  ipcMain.on("stop-task", (event) => {
    logger.info("收到停止任务请求");

    if (pythonProcess) {
      logger.info("正在停止进程, pid: " + pythonProcess.pid);

      // 使用 taskkill 强制杀死进程树（包含子进程）
      const { spawn } = require("child_process");
      spawn("taskkill", ["/pid", pythonProcess.pid, "/f", "/t"]);

      pythonProcess = null;
      logger.info("已发送停止命令");

      // 发送任务结束事件
      let finishTimeout = setTimeout(() => {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send("task-finished", {
            taskType: "translate",
            error: "用户停止任务",
          });
        }
      }, 500);

      // 清理timeout
      event.sender.on("destroyed", () => {
        if (finishTimeout) {
          clearTimeout(finishTimeout);
          finishTimeout = null;
        }
      });
    } else {
      logger.info("没有正在运行的进程，无需停止");
    }
  });

  // 3. 打包字幕 (🟢 只处理有RJ号的文件夹)
  ipcMain.handle("zip-subtitles", async (event, { targetPath, outputDir }) => {
    if (!fs.existsSync(targetPath)) {
      return { success: false, msg: "源目录不存在" };
    }

    // 🟢 确保输出目录存在
    const finalOutputDir = outputDir || targetPath;
    if (!fs.existsSync(finalOutputDir)) {
      try {
        fs.mkdirSync(finalOutputDir, { recursive: true });
        logger.info(`创建输出目录: ${finalOutputDir}`);
      } catch (e) {
        return { success: false, msg: `无法创建输出目录: ${e.message}` };
      }
    }

    // 🟢 策略1：如果目标路径本身是RJ号文件夹，直接打包
    const pathMatch = targetPath.match(/(RJ|VJ|BJ)\d+/i);
    if (pathMatch) {
      const rjCode = pathMatch[0].toUpperCase();
      // 🟢 如果输出目录和源目录相同，需要特殊处理
      if (finalOutputDir === targetPath) {
        return await packFolderInPlace(event, targetPath, rjCode);
      } else {
        return await packFolder(event, targetPath, rjCode, finalOutputDir);
      }
    }

    // 🟢 策略2：扫描子目录，只处理有RJ号的文件夹，没有的跳过
    logger.info("扫描子目录，查找RJ号文件夹...");
    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const folders = items
      .filter((item) => item.isDirectory())
      .map((item) => path.join(targetPath, item.name));

    let totalPacked = 0;
    let totalSkipped = 0;
    const results = [];

    for (const folder of folders) {
      const folderName = path.basename(folder);
      const folderMatch = folderName.match(/(RJ|VJ|BJ)\d+/i);

      if (folderMatch) {
        // 🟢 有RJ号：打包到输出目录
        const rjCode = folderMatch[0].toUpperCase();
        logger.info(`打包文件夹: ${folderName}`);
        // 🟢 始终打包到 finalOutputDir
        const result = await packFolder(event, folder, rjCode, finalOutputDir);
        if (result.skipped) {
          totalSkipped++;
        } else if (result.success) {
          totalPacked++;
        }
        results.push(`${rjCode}: ${result.msg}`);
      } else {
        // 🟢 没有RJ号：跳过
        logger.info(`跳过文件夹 (无RJ号): ${folderName}`);
      }
    }

    if (totalPacked === 0 && totalSkipped === 0) {
      return { success: false, msg: "未找到包含RJ号的文件夹" };
    }

    const summary = `打包完成: 成功 ${totalPacked} 个，跳过 ${totalSkipped} 个`;
    logger.info(summary);
    return {
      success: true,
      msg: summary,
      results,
      totalPacked,
      totalSkipped,
    };
  });

  // 🟢 辅助函数：打包单个文件夹到指定输出目录，有更新就覆盖
  async function packFolder(event, folderPath, rjCode, outputDir) {
    const outputName = `${rjCode}.zip`;
    const outputPath = path.join(outputDir, outputName);

    // 扫描字幕文件
    const filesToZip = [];
    let maxMtime = 0;

    function scan(dir) {
      try {
        fs.readdirSync(dir).forEach((f) => {
          if (f === outputName) return;
          const full = path.join(dir, f);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) scan(full);
          else if (
            [".srt", ".lrc", ".vtt", ".txt", ".ass"].includes(
              path.extname(f).toLowerCase(),
            )
          ) {
            filesToZip.push({ full, rel: path.relative(folderPath, full) });
            if (stat.mtimeMs > maxMtime) maxMtime = stat.mtimeMs;
          }
        });
      } catch {
        // 忽略读取错误
      }
    }

    try {
      scan(folderPath);

      if (filesToZip.length === 0) {
        return { success: false, msg: "无字幕文件" };
      }

      // 🟢 检查是否有更新：如果zip存在且比所有字幕文件新，则跳过
      if (fs.existsSync(outputPath)) {
        const zipStat = fs.statSync(outputPath);
        if (zipStat.mtimeMs >= maxMtime) {
          logger.info(`跳过 ${outputName} (已是最新)`);
          return {
            success: true,
            msg: "已跳过 (已是最新)",
            fileCount: filesToZip.length,
            skipped: true,
          };
        }
        // 🟢 有更新：删除旧zip，重新打包
        logger.info(`检测到更新，删除旧zip: ${outputName}`);
        fs.unlinkSync(outputPath);
      }

      logger.info(`打包中: ${outputName}`);

      return new Promise((resolve) => {
        const output = fs.createWriteStream(outputPath);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
          logger.info(`打包完成: ${outputName}`);
          event.sender.send("task-finished", {
            taskType: "pack",
            success: true,
            msg: `文件已生成: ${outputName}`,
          });
          resolve({
            success: true,
            msg: `已打包 ${filesToZip.length} 个字幕文件`,
            outputPath,
            fileCount: filesToZip.length,
          });
        });

        archive.on("error", (e) => {
          logger.error(e.message);
          resolve({ success: false, msg: e.message });
        });

        archive.on("warning", (err) => {
          if (err.code !== "ENOENT") {
            logger.warn(err.message);
          }
        });

        archive.pipe(output);
        filesToZip.forEach((f) => archive.file(f.full, { name: f.rel }));
        archive.finalize();
      });
    } catch (e) {
      logger.error(e.message);
      return { success: false, msg: e.message };
    }
  }
}
