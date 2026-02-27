/**
 * DOM 快照工具
 *
 * 依赖方向: Types → Config → Utils
 *
 * 用于捕获页面 DOM 状态、截图和关键信息
 */
import fs from "fs";
import path from "path";

/**
 * 捕获 DOM 快照
 * @param {Object} client - CDP 客户端实例
 * @param {string} sessionId - 页面会话 ID
 * @param {Object} options - 快照选项
 * @returns {Object} DOM 快照数据
 */
export async function captureDOMSnapshot(client, sessionId, options = {}) {
  const {
    includeScreenshot = true,
    includeForms = true,
    includeElements = true,
    maxDepth = 10,
  } = options;

  const snapshot = {
    timestamp: new Date().toISOString(),
    url: null,
    title: null,
    dom: null,
    screenshot: null,
    forms: [],
    elements: [],
    metrics: null,
  };

  try {
    // 获取页面基本信息
    const pageInfo = await client.evaluate(
      sessionId,
      `
      JSON.stringify({
        url: window.location.href,
        title: document.title,
        readyState: document.readyState
      })
    `,
    );

    if (pageInfo && pageInfo.result) {
      const info = JSON.parse(pageInfo.result.value);
      snapshot.url = info.url;
      snapshot.title = info.title;
    }

    // 获取 DOM 树
    if (includeElements) {
      const doc = await client.getDocument(sessionId);
      snapshot.dom = await flattenDOM(
        client,
        sessionId,
        doc.nodeId,
        0,
        maxDepth,
      );
    }

    // 获取表单信息
    if (includeForms) {
      const formsResult = await client.evaluate(
        sessionId,
        `
        JSON.stringify(Array.from(document.forms).map(form => ({
          action: form.action,
          method: form.method,
          name: form.name,
          id: form.id,
          elements: Array.from(form.elements).map(el => ({
            type: el.type,
            name: el.name,
            id: el.id,
            value: el.value,
            tagName: el.tagName,
            checked: el.checked,
            disabled: el.disabled
          }))
        })))
      `,
      );

      if (formsResult && formsResult.result) {
        snapshot.forms = JSON.parse(formsResult.result.value);
      }
    }

    // 获取关键元素信息
    const elementsResult = await client.evaluate(
      sessionId,
      `
      JSON.stringify({
        buttons: Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.textContent?.trim(),
          id: b.id,
          className: b.className,
          disabled: b.disabled
        })),
        inputs: Array.from(document.querySelectorAll('input')).map(i => ({
          type: i.type,
          id: i.id,
          name: i.name,
          value: i.value,
          placeholder: i.placeholder
        })),
        links: Array.from(document.querySelectorAll('a')).slice(0, 20).map(a => ({
          href: a.href,
          text: a.textContent?.trim().slice(0, 50)
        }))
      })
    `,
    );

    if (elementsResult && elementsResult.result) {
      const elemInfo = JSON.parse(elementsResult.result.value);
      snapshot.elements = elemInfo;
    }

    // 截图
    if (includeScreenshot) {
      snapshot.screenshot = await client.takeScreenshot(sessionId);
    }

    // 性能指标
    const metricsResult = await client.getLoadEvent(sessionId);
    snapshot.metrics = metricsResult;
  } catch (err) {
    snapshot.error = err.message;
  }

  return snapshot;
}

/**
 * 扁平化 DOM 树
 */
async function flattenDOM(client, sessionId, nodeId, depth, maxDepth) {
  if (depth > maxDepth) return null;

  const nodes = [];

  try {
    // 获取节点属性
    const attrs = await client.send("DOM.getAttributes", { nodeId, sessionId });

    const nodeInfo = {
      nodeId,
      attributes: attrs.attributes || [],
      childNodes: [],
    };

    // 解析属性
    const attrObj = {};
    if (attrs.attributes) {
      for (let i = 0; i < attrs.attributes.length; i += 2) {
        attrObj[attrs.attributes[i]] = attrs.attributes[i + 1];
      }
    }
    nodeInfo.attrs = attrObj;
    nodeInfo.tagName = attrObj.id || attrObj.class || `node-${nodeId}`;
    nodeInfo.id = attrObj.id || null;
    nodeInfo.class = attrObj.class || null;

    // 获取子节点
    const children = await client.send("DOM.getChildNodes", {
      nodeId,
      sessionId,
    });

    if (children && children.nodes) {
      for (const child of children.nodes) {
        if (child.nodeId) {
          const childNode = await flattenDOM(
            client,
            sessionId,
            child.nodeId,
            depth + 1,
            maxDepth,
          );
          if (childNode) {
            nodeInfo.childNodes.push(childNode);
          }
        }
      }
    }

    nodes.push(nodeInfo);
  } catch (_e) {
    // 忽略错误
  }

  return nodes[0] || null;
}

/**
 * 保存快照到文件
 */
export function saveSnapshot(snapshot, outputDir, prefix = "snapshot") {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `${prefix}-${timestamp}`;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 保存 JSON
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(snapshot, null, 2));

  // 保存截图
  let screenshotPath = null;
  if (snapshot.screenshot) {
    screenshotPath = path.join(outputDir, `${baseName}.png`);
    fs.writeFileSync(screenshotPath, snapshot.screenshot);
  }

  return {
    jsonPath,
    screenshotPath,
    timestamp: snapshot.timestamp,
  };
}

/**
 * 加载快照文件
 */
export function loadSnapshot(jsonPath) {
  const content = fs.readFileSync(jsonPath, "utf8");
  return JSON.parse(content);
}

/**
 * 比较两个快照的差异
 */
export function diffSnapshots(snapshotA, snapshotB) {
  const diff = {
    timestampA: snapshotA.timestamp,
    timestampB: snapshotB.timestamp,
    urlChanged: snapshotA.url !== snapshotB.url,
    titleChanged: snapshotA.title !== snapshotB.title,
    formsChanged:
      JSON.stringify(snapshotA.forms) !== JSON.stringify(snapshotB.forms),
    elementsChanged:
      JSON.stringify(snapshotA.elements) !== JSON.stringify(snapshotB.elements),
  };

  // 简化差异比较
  if (diff.urlChanged) {
    diff.url = { a: snapshotA.url, b: snapshotB.url };
  }
  if (diff.titleChanged) {
    diff.title = { a: snapshotA.title, b: snapshotB.title };
  }

  return diff;
}

/**
 * 创建简单的页面元素选择器
 */
export async function findElementByText(client, sessionId, text, tag = "*") {
  const result = await client.evaluate(
    sessionId,
    `
    JSON.stringify(Array.from(document.querySelectorAll('${tag}')).filter(el => 
      el.textContent.includes('${text}')
    ).map(el => ({
      tag: el.tagName,
      id: el.id,
      class: el.className,
      text: el.textContent.trim().slice(0, 100)
    })))
  `,
  );

  if (result && result.result) {
    return JSON.parse(result.result.value);
  }
  return [];
}

/**
 * 检查元素是否存在
 */
export async function elementExists(client, sessionId, selector) {
  const result = await client.evaluate(
    sessionId,
    `
    document.querySelector('${selector}') !== null
  `,
  );

  return result && result.result && result.result.value === true;
}
