import { extractWorksArrayBasic, formatPlaylistWorks } from "./search-utils";

const PLAYLIST_WORKS_API_PREFIX =
  "https://api.asmr.one/api/playlist/get-playlist-works";

// 统一拼接分页 URL，避免各处手动拼接参数时格式不一致。
function buildPlaylistWorksPageUrl(playlistId, page, pageSize = 100) {
  return `${PLAYLIST_WORKS_API_PREFIX}?id=${playlistId}&page=${page}&pageSize=${pageSize}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// sendLog 是可选回调，调用前先做类型守卫，避免日志本身引发异常。
function safeLog(sendLog, message) {
  if (typeof sendLog === "function") {
    sendLog(message);
  }
}

// 拉取播放列表全部作品：先探测第一页得到分页信息，再并发抓取剩余页并逐页重试。
export async function fetchAsmrPlaylistWorks({
  httpClient,
  token,
  playlistId,
  sendLog,
  timeout = 30000,
  pageSize = 100,
  maxRetries = 3,
}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let totalPages = 1;
  const works = [];

  try {
    safeLog(sendLog, `🚀 开始并发获取播放列表: ${playlistId}`);

    const firstPageUrl = buildPlaylistWorksPageUrl(playlistId, 1, pageSize);
    console.log(`[ASMR] ========== 获取第一页 ==========`);
    console.log(`[ASMR] 获取播放列表: ${firstPageUrl}`);
    console.log(`[ASMR] 使用Token: ${token.substring(0, 20)}...`);

    let firstRes;
    try {
      firstRes = await httpClient.get(firstPageUrl, {
        headers,
        timeout,
      });
    } catch (error) {
      console.error("[ASMR] 获取第一页失败:", error.message);
      safeLog(sendLog, `❌ 获取第一页失败: ${error.message}`);
      return { success: false, msg: error.message };
    }

    console.log(`[ASMR] 第一页响应状态: ${firstRes.status}`);

    const items = extractWorksArrayBasic(firstRes.data);
    if (items.length === 0) {
      // 第一页为空可直接判定整个播放列表无作品。
      safeLog(sendLog, `⚠️ 第一页没有数据`);
      return { success: true, data: [] };
    }

    if (firstRes.data.pagination) {
      // 以服务端分页元信息为准，避免根据当前页长度猜测总页数。
      const pagination = firstRes.data.pagination;
      totalPages = Math.ceil(pagination.totalCount / pagination.pageSize);
      console.log(
        `[ASMR] 总页数: ${totalPages}，总作品数: ${pagination.totalCount}`,
      );
      safeLog(
        sendLog,
        `📊 总页数: ${totalPages}，总作品数: ${pagination.totalCount}`,
      );
    } else {
      // 兼容无 pagination 的返回格式：仅返回第一页结果。
      return {
        success: true,
        data: formatPlaylistWorks(items),
      };
    }

    console.log(
      `[ASMR] ========== 开始并发获取第2-${totalPages}页（带重试）=========`,
    );
    safeLog(
      sendLog,
      `⚡ 正在并发获取第 2-${totalPages} 页（共 ${totalPages - 1} 页，每页自动重试3次）...`,
    );

    const pagePromises = [];

    for (let page = 2; page <= totalPages; page++) {
      const url = buildPlaylistWorksPageUrl(playlistId, page, pageSize);

      const fetchWithRetry = async (pageNum) => {
        let retryCount = 0;
        let res;

        // 单页失败不立即终止整体流程，按指数退避近似策略（1s,2s,3s...）重试。
        while (retryCount < maxRetries) {
          try {
            res = await httpClient.get(url, { headers, timeout });
            break;
          } catch (error) {
            retryCount++;

            if (retryCount >= maxRetries) {
              console.error(
                `[ASMR] 第 ${pageNum} 页第 ${maxRetries} 次重试后仍失败:`,
                error.message,
              );
              return { pageNum, error: true, errorMsg: error.message };
            }

            console.log(`[ASMR] 第 ${pageNum} 页第 ${retryCount} 次重试...`);
            safeLog(sendLog, `⚠️ 第 ${pageNum} 页第 ${retryCount} 次重试...`);
            await sleep(1000 * retryCount);
          }
        }

        return { pageNum, res };
      };

      pagePromises.push(fetchWithRetry(page));
    }

    const results = await Promise.all(pagePromises);

    console.log(
      `[ASMR] 所有请求完成，成功: ${results.filter((r) => !r.error).length}/${results.length}`,
    );

    let successCount = 0;
    let failCount = 0;

    results.forEach((result) => {
      const page = result.pageNum;

      // 某页最终失败时记录并继续处理其他页，尽量返回可用的部分数据。
      if (result.error) {
        failCount++;
        safeLog(
          sendLog,
          `❌ 第 ${page} 页获取失败（${result.errorMsg || "未知错误"}）`,
        );
        return;
      }

      successCount++;
      const pageItems = extractWorksArrayBasic(result.res?.data);
      console.log(`[ASMR] 第 ${page} 页获取到 ${pageItems.length} 个作品`);
      safeLog(
        sendLog,
        `📄 第 ${page}/${totalPages} 页：获取到 ${pageItems.length} 个作品`,
      );

      works.push(...formatPlaylistWorks(pageItems));
    });

    // 第一页数据最后补回头部，保持最终顺序仍按页递增。
    works.unshift(...formatPlaylistWorks(items));
    safeLog(
      sendLog,
      `✅ 并发获取完成！成功: ${successCount}，失败: ${failCount}，共 ${works.length} 个作品`,
    );

    return { success: true, data: works };
  } catch (e) {
    console.error("[ASMR] 获取播放列表失败:", e.message);

    if (e.response) {
      console.error("[ASMR] 响应状态:", e.response.status);
      console.error("[ASMR] 响应数据:", e.response.data);
      safeLog(sendLog, `❌ 获取播放列表失败: HTTP ${e.response.status}`);
      return {
        success: false,
        msg: `HTTP ${e.response.status}: ${JSON.stringify(e.response.data)}`,
      };
    }

    safeLog(sendLog, `❌ 获取播放列表失败: ${e.message}`);
    return { success: false, msg: e.message };
  }
}
