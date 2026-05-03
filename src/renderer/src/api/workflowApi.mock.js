export const cloneJsonValue = (value, fallbackValue = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const createEdge = (id, source, sourcePort, target, targetPort) => ({
  id,
  source,
  sourcePort,
  target,
  targetPort,
  type: 'default',
});

const createDocument = ({ id, name, description, tags = [], nodes = [], edges = [] }) => ({
  id,
  name,
  version: '1.0.0',
  description,
  tags,
  graph: {
    nodes,
    edges,
    links: cloneJsonValue(edges, []),
    groups: [],
    reroutes: [],
    floatingLinks: [],
    state: {},
    extra: {},
    definitions: {},
  },
  runtime: {
    queueMode: 'append',
    retryPolicy: {
      maxAttempts: 1,
    },
  },
});

const catalogEntries = [
  {
    type: 'input.manual',
    displayName: '手动输入',
    category: '输入',
    description: '在画布内提供基础输入值，适合作为工作流起点。',
    searchAliases: ['input', 'manual', '入口'],
    deprecated: false,
    isExperimental: false,
    inputs: {
      required: [],
      optional: [
        {
          key: 'value',
          label: '输入值',
          datatype: 'TEXT',
          description: '可直接在节点或 Inspector 中编辑。',
        },
      ],
    },
    outputs: [
      {
        key: 'value',
        label: '输出值',
        datatype: 'TEXT',
        description: '发送到下游节点。',
      },
    ],
    widgets: [
      {
        key: 'value',
        label: '输入值',
        widget: 'text',
      },
    ],
    runtimeFlags: {
      supportsBypass: false,
      supportsPartialExecution: false,
    },
    uiHints: {
      family: 'input',
      accent: 'cyan',
    },
  },
  {
    type: 'whisper.translateSubtitles',
    displayName: '翻译字幕',
    category: '字幕',
    description: '调用 Whisper 翻译字幕文件，并把结果整理成可继续处理的作品列表。',
    searchAliases: ['whisper', 'translate', 'subtitle'],
    deprecated: false,
    isExperimental: false,
    inputs: {
      required: [
        {
          key: 'targetPath/path',
          label: '目标目录',
          datatype: 'PATH',
          description: '待翻译字幕所在目录。',
        },
      ],
      optional: [
        {
          key: 'exePath',
          label: 'Whisper 路径',
          datatype: 'PATH',
          description: '未配置全局路径时可在节点内单独指定。',
        },
      ],
    },
    outputs: [
      {
        key: 'items[]',
        label: '翻译结果',
        datatype: 'LIST',
        description: '逐作品的翻译结果列表。',
      },
      {
        key: 'totalWorks',
        label: '作品总数',
        datatype: 'NUMBER',
        description: '本次翻译覆盖的作品数量。',
      },
    ],
    widgets: [
      { key: 'exePath', label: 'Whisper 路径', widget: 'path' },
      { key: 'subFormats', label: '字幕格式', widget: 'multi-select' },
    ],
    runtimeFlags: {
      supportsBypass: true,
      supportsPartialExecution: true,
    },
    uiHints: {
      family: 'process',
      accent: 'violet',
    },
  },
  {
    type: 'whisper.packSubtitles',
    displayName: '打包字幕',
    category: '字幕',
    description: '把整理好的字幕产物打包为便于分发的压缩包。',
    searchAliases: ['pack', 'zip', 'subtitle'],
    deprecated: false,
    isExperimental: false,
    inputs: {
      required: [
        {
          key: 'targetPath/path',
          label: '字幕目录',
          datatype: 'PATH',
          description: '待打包的字幕目录。',
        },
      ],
      optional: [
        {
          key: 'outputDir',
          label: '输出目录',
          datatype: 'PATH',
          description: '自定义压缩包输出位置。',
        },
      ],
    },
    outputs: [
      {
        key: 'outputPaths[]',
        label: '压缩包列表',
        datatype: 'LIST',
        description: '输出的压缩包路径集合。',
      },
    ],
    widgets: [
      { key: 'outputDir', label: '输出目录', widget: 'path' },
    ],
    runtimeFlags: {
      supportsBypass: true,
      supportsPartialExecution: true,
    },
    uiHints: {
      family: 'process',
      accent: 'amber',
    },
  },
  {
    type: 'tg.uploadSubtitles',
    displayName: '上传 Telegram',
    category: '发布',
    description: '把压缩后的字幕包上传到 Telegram 频道。',
    searchAliases: ['telegram', 'upload', 'publish'],
    deprecated: false,
    isExperimental: false,
    inputs: {
      required: [
        {
          key: 'archives/files',
          label: '压缩包列表',
          datatype: 'FILES',
          description: '准备上传的压缩包。',
        },
      ],
      optional: [
        {
          key: 'channelId',
          label: '频道 ID',
          datatype: 'TEXT',
          description: '覆盖默认频道时使用。',
        },
      ],
    },
    outputs: [
      {
        key: 'uploadedFiles[]',
        label: '上传成功',
        datatype: 'LIST',
        description: '成功上传的文件列表。',
      },
      {
        key: 'failedFiles[]',
        label: '上传失败',
        datatype: 'LIST',
        description: '失败文件与原因。',
      },
    ],
    widgets: [
      { key: 'channelId', label: '频道 ID', widget: 'text' },
    ],
    runtimeFlags: {
      supportsBypass: true,
      supportsPartialExecution: true,
    },
    uiHints: {
      family: 'output',
      accent: 'green',
    },
  },
  {
    type: 'asmr.cloudDeleteRecentUploads',
    displayName: '扫描最近上传',
    category: '维护',
    description: '按编号扫描最近上传记录，整理可清理的目标。',
    searchAliases: ['cleanup', 'recent', 'cloud'],
    deprecated: false,
    isExperimental: false,
    inputs: {
      required: [
        {
          key: 'rjCodes',
          label: 'RJ 编号',
          datatype: 'LIST',
          description: '需要匹配的目标编号。',
        },
      ],
      optional: [],
    },
    outputs: [
      {
        key: 'matchedWorkIds[]',
        label: '命中作品',
        datatype: 'LIST',
        description: '匹配到的云端作品。',
      },
      {
        key: 'deletedCount',
        label: '已删除数量',
        datatype: 'NUMBER',
        description: '可用于恢复报告与后续核对。',
      },
    ],
    widgets: [],
    runtimeFlags: {
      supportsBypass: true,
      supportsPartialExecution: true,
    },
    uiHints: {
      family: 'maintenance',
      accent: 'red',
    },
  },
  {
    type: 'output.inspect',
    displayName: '结果检查',
    category: '输出',
    description: '聚合上游结果，在运行台和 Inspector 中查看输入输出预览。',
    searchAliases: ['inspect', 'preview', 'result'],
    deprecated: false,
    isExperimental: false,
    inputs: {
      required: [
        {
          key: 'inputValues/inputMap',
          label: '输入数据',
          datatype: 'MAP',
          description: '传给检查节点的聚合输入。',
        },
      ],
      optional: [],
    },
    outputs: [
      {
        key: 'preview',
        label: '检查结果',
        datatype: 'MAP',
        description: '用于运行台与历史记录展示。',
      },
    ],
    widgets: [],
    runtimeFlags: {
      supportsBypass: false,
      supportsPartialExecution: true,
      isOutputNode: true,
    },
    uiHints: {
      family: 'output',
      accent: 'blue',
    },
  },
];

const buildDocs = (entry) => {
  const lines = [
    `# ${entry.displayName}`,
    '',
    entry.description,
    '',
    `- 类型：\`${entry.type}\``,
    `- 分类：${entry.category}`,
    `- 实验性：${entry.isExperimental ? '是' : '否'}`,
    '',
    '## 必填输入',
    ...(entry.inputs.required.length
      ? entry.inputs.required.map(
          (item) => `- \`${item.key}\` · ${item.label} · ${item.datatype}${item.description ? ` · ${item.description}` : ''}`,
        )
      : ['- 无']),
    '',
    '## 可选输入',
    ...(entry.inputs.optional.length
      ? entry.inputs.optional.map(
          (item) => `- \`${item.key}\` · ${item.label} · ${item.datatype}${item.description ? ` · ${item.description}` : ''}`,
        )
      : ['- 无']),
    '',
    '## 输出',
    ...(entry.outputs.length
      ? entry.outputs.map(
          (item) => `- \`${item.key}\` · ${item.label} · ${item.datatype}${item.description ? ` · ${item.description}` : ''}`,
        )
      : ['- 无']),
    '',
    '## Widgets',
    ...(entry.widgets.length
      ? entry.widgets.map(
          (item) => `- \`${item.key || item.label}\` · ${item.label || item.key} · ${item.widget || item.type || 'text'}`,
        )
      : ['- 无']),
  ];

  return {
    markdown: lines.join('\n'),
    generated: true,
  };
};

catalogEntries.forEach((entry) => {
  entry.docs = buildDocs(entry);
});

const objectInfoMap = Object.fromEntries(
  catalogEntries.map((entry) => [
    entry.type,
    {
      type: entry.type,
      displayName: entry.displayName,
      category: entry.category,
      description: entry.description,
      inputs: cloneJsonValue(entry.inputs, { required: [], optional: [] }),
      outputs: cloneJsonValue(entry.outputs, []),
      widgets: cloneJsonValue(entry.widgets, []),
      runtimeFlags: cloneJsonValue(entry.runtimeFlags, {}),
      uiHints: cloneJsonValue(entry.uiHints, {}),
      defaultConfig: {},
    },
  ]),
);

const nodeDefinitions = catalogEntries.map((entry) => ({
  type: entry.type,
  label: entry.displayName,
  displayName: entry.displayName,
  category: entry.category,
  description: entry.description,
  widgets: cloneJsonValue(entry.widgets, []),
  runtimeFlags: cloneJsonValue(entry.runtimeFlags, {}),
  uiHints: cloneJsonValue(entry.uiHints, {}),
  io: {
    input: [
      ...cloneJsonValue(entry.inputs.required, []),
      ...cloneJsonValue(entry.inputs.optional, []),
    ],
    output: cloneJsonValue(entry.outputs, []),
  },
}));

const workflowDocuments = {
  'blank-workflow': createDocument({
    id: 'blank-workflow',
    name: '空白工作流',
    description: '从空白画布开始，自定义节点与运行路径。',
  }),
  'subtitle-translate-review': createDocument({
    id: 'subtitle-translate-review',
    name: '字幕翻译审查',
    description: '将字幕目录交给 Whisper 翻译，并在 Inspect 节点检查结果。',
    tags: ['字幕', 'Whisper'],
    nodes: [
      {
        id: 'node-input-path',
        type: 'input.manual',
        label: '媒体目录',
        position: { x: 120, y: 160 },
        config: { value: 'D:/ASMR/Subtitles' },
      },
      {
        id: 'node-translate',
        type: 'whisper.translateSubtitles',
        label: '翻译字幕',
        position: { x: 420, y: 120 },
        config: {
          exePath: 'C:/Tools/whisper.exe',
          targetPath: '',
          subFormats: ['lrc', 'srt', 'vtt'],
        },
      },
      {
        id: 'node-inspect',
        type: 'output.inspect',
        label: '结果检查',
        position: { x: 760, y: 150 },
        config: {},
      },
    ],
    edges: [
      createEdge('edge-input-path', 'node-input-path', 'value', 'node-translate', 'targetPath/path'),
      createEdge('edge-translate-inspect', 'node-translate', 'items[]', 'node-inspect', 'inputValues/inputMap'),
    ],
  }),
  'subtitle-pack-upload': createDocument({
    id: 'subtitle-pack-upload',
    name: '字幕打包上传',
    description: '将字幕目录打包后上传到 Telegram，并保留结果检查。',
    tags: ['字幕', '上传'],
    nodes: [
      {
        id: 'node-pack-input',
        type: 'input.manual',
        label: '字幕目录',
        position: { x: 120, y: 170 },
        config: { value: 'D:/ASMR/Subtitles' },
      },
      {
        id: 'node-pack',
        type: 'whisper.packSubtitles',
        label: '打包字幕',
        position: { x: 420, y: 130 },
        config: { outputDir: 'D:/ASMR/Packages' },
      },
      {
        id: 'node-upload',
        type: 'tg.uploadSubtitles',
        label: '上传 Telegram',
        position: { x: 730, y: 130 },
        config: { channelId: '@kuruharu_archive' },
      },
      {
        id: 'node-inspect-pack',
        type: 'output.inspect',
        label: '结果检查',
        position: { x: 1020, y: 170 },
        config: {},
      },
    ],
    edges: [
      createEdge('edge-pack-input', 'node-pack-input', 'value', 'node-pack', 'targetPath/path'),
      createEdge('edge-pack-upload', 'node-pack', 'outputPaths[]', 'node-upload', 'archives/files'),
      createEdge('edge-upload-inspect', 'node-upload', 'uploadedFiles[]', 'node-inspect-pack', 'inputValues/inputMap'),
    ],
  }),
  'recent-cleanup-review': createDocument({
    id: 'recent-cleanup-review',
    name: '最近上传清理审查',
    description: '按 RJ 编号扫描最近上传记录，并在 Inspect 中检查结果。',
    tags: ['维护', '清理'],
    nodes: [
      {
        id: 'node-rj-input',
        type: 'input.manual',
        label: 'RJ 编号',
        position: { x: 120, y: 170 },
        config: { value: 'RJ123456' },
      },
      {
        id: 'node-recent-clean',
        type: 'asmr.cloudDeleteRecentUploads',
        label: '扫描最近上传',
        position: { x: 430, y: 130 },
        config: {},
      },
      {
        id: 'node-clean-inspect',
        type: 'output.inspect',
        label: '结果检查',
        position: { x: 770, y: 170 },
        config: {},
      },
    ],
    edges: [
      createEdge('edge-rj-clean', 'node-rj-input', 'value', 'node-recent-clean', 'rjCodes'),
      createEdge('edge-clean-inspect', 'node-recent-clean', 'matchedWorkIds[]', 'node-clean-inspect', 'inputValues/inputMap'),
    ],
  }),
};

const templates = [
  {
    id: 'blank-workflow',
    displayName: '空白工作流',
    category: '基础',
    description: '从空白画布开始，自定义节点、连线和运行路径。',
    summary: '适合从零开始搭建工作流',
    tags: ['blank', 'designer'],
    inputRequirements: [],
    dependencies: [],
  },
  {
    id: 'subtitle-translate-review',
    displayName: '字幕翻译审查',
    category: '字幕',
    description: '使用 Whisper 翻译字幕并在输出端检查结果。',
    summary: '媒体目录 → 翻译字幕 → 结果检查',
    tags: ['whisper', 'inspect'],
    inputRequirements: [
      { key: 'targetPath', label: '媒体目录', required: true, datatype: 'PATH' },
    ],
    dependencies: [
      {
        key: 'whisper-exe',
        label: 'Whisper 可执行文件',
        required: true,
        detail: '请先在设置中配置 Whisper 路径。',
      },
    ],
  },
  {
    id: 'subtitle-pack-upload',
    displayName: '字幕打包上传',
    category: '发布',
    description: '将字幕目录打包后上传到 Telegram，并保留结果检查。',
    summary: '字幕目录 → 打包字幕 → 上传 Telegram → 结果检查',
    tags: ['pack', 'telegram'],
    inputRequirements: [
      { key: 'targetPath', label: '字幕目录', required: true, datatype: 'PATH' },
      { key: 'channelId', label: 'Telegram 频道', required: true, datatype: 'TEXT' },
    ],
    dependencies: [
      {
        key: 'telegram-login',
        label: 'Telegram 登录状态',
        required: true,
        detail: '请先完成 Telegram 登录，再执行上传。',
      },
    ],
  },
  {
    id: 'recent-cleanup-review',
    displayName: '最近上传清理审查',
    category: '维护',
    description: '按 RJ 编号扫描最近上传记录，生成待清理结果并交给 Inspect。',
    summary: 'RJ 编号 → 扫描最近上传 → 结果检查',
    tags: ['cleanup', 'recent'],
    inputRequirements: [
      { key: 'rjCode', label: 'RJ 编号', required: true, datatype: 'TEXT' },
    ],
    dependencies: [
      {
        key: 'asmr-cloud',
        label: 'ASMR Cloud 账号',
        required: true,
        detail: '需要具备读取最近上传记录的权限。',
      },
    ],
  },
];

const createRun = ({
  runSessionId,
  workflowId,
  workflowName,
  status,
  mode = 'enqueue',
  requestedAt,
  startedAt = null,
  endedAt = null,
  durationMs = null,
  nodeStates = {},
  error = null,
  validation = { ok: true, errors: [], warnings: [] },
}) => ({
  runSessionId,
  runId: runSessionId,
  workflowId,
  workflowName,
  status,
  mode,
  requestedAt,
  startedAt,
  endedAt,
  durationMs,
  nodeStates: cloneJsonValue(nodeStates, {}),
  workflowLogs: [],
  pipelineLogs: [],
  nodeLogs: {},
  validation,
  error,
});

const runtimeState = {
  pending: [
    createRun({
      runSessionId: 'run-pending-001',
      workflowId: 'subtitle-pack-upload',
      workflowName: '字幕打包上传',
      status: 'pending',
      requestedAt: '2026-03-15T14:18:00.000Z',
      mode: 'enqueue',
    }),
  ],
  running: [
    createRun({
      runSessionId: 'run-running-001',
      workflowId: 'subtitle-translate-review',
      workflowName: '字幕翻译审查',
      status: 'running',
      requestedAt: '2026-03-15T14:20:00.000Z',
      startedAt: '2026-03-15T14:20:08.000Z',
      mode: 'enqueue',
      nodeStates: {
        'node-input-path': {
          nodeId: 'node-input-path',
          status: 'success',
          startedAt: '2026-03-15T14:20:08.000Z',
          endedAt: '2026-03-15T14:20:09.000Z',
          durationMs: 1000,
          inputPreview: null,
          outputPreview: { value: 'D:/ASMR/Subtitles' },
          error: null,
          progressPercent: 100,
        },
        'node-translate': {
          nodeId: 'node-translate',
          status: 'running',
          startedAt: '2026-03-15T14:20:10.000Z',
          endedAt: null,
          durationMs: null,
          inputPreview: { path: 'D:/ASMR/Subtitles' },
          outputPreview: null,
          error: null,
          progressPercent: 62,
        },
      },
    }),
  ],
  history: [
    createRun({
      runSessionId: 'run-failed-001',
      workflowId: 'recent-cleanup-review',
      workflowName: '最近上传清理审查',
      status: 'failed',
      requestedAt: '2026-03-15T13:50:00.000Z',
      startedAt: '2026-03-15T13:50:05.000Z',
      endedAt: '2026-03-15T13:50:30.000Z',
      durationMs: 25000,
      nodeStates: {
        'node-rj-input': {
          nodeId: 'node-rj-input',
          status: 'success',
          startedAt: '2026-03-15T13:50:05.000Z',
          endedAt: '2026-03-15T13:50:06.000Z',
          durationMs: 1000,
          inputPreview: null,
          outputPreview: { value: 'RJ123456' },
          error: null,
          progressPercent: 100,
        },
        'node-recent-clean': {
          nodeId: 'node-recent-clean',
          status: 'failed',
          startedAt: '2026-03-15T13:50:07.000Z',
          endedAt: '2026-03-15T13:50:30.000Z',
          durationMs: 23000,
          inputPreview: { rjCodes: ['RJ123456'] },
          outputPreview: null,
          error: {
            code: 'MISSING_RESOURCE',
            message: '缺少云端凭据，无法读取最近上传记录。',
          },
          progressPercent: 78,
        },
      },
      error: {
        code: 'RUN_FAILED',
        message: '执行过程中出现缺失资源。',
      },
      validation: {
        ok: false,
        errors: ['缺少 ASMR Cloud 登录信息'],
        warnings: [],
      },
    }),
  ],
  updatedAt: '2026-03-15T14:20:20.000Z',
};

const buildRecoveryReport = (runSessionId) => {
  if (runSessionId !== 'run-failed-001') {
    return {
      runSessionId,
      status: 'clear',
      generatedAt: '2026-03-15T14:20:20.000Z',
      summary: {
        missingNodes: 0,
        missingResources: 0,
        executionFailures: 0,
        total: 0,
      },
      items: [],
    };
  }

  return {
    runSessionId,
    status: 'needs-follow-up',
    generatedAt: '2026-03-15T14:20:20.000Z',
    summary: {
      missingNodes: 0,
      missingResources: 1,
      executionFailures: 1,
      total: 2,
    },
    items: [
      {
        id: 'validation-1',
        type: 'missing-resource',
        severity: 'error',
        title: '缺少依赖资源',
        message: '缺少 ASMR Cloud 登录信息',
        actions: ['show-report', 'recover'],
      },
      {
        id: 'node-node-recent-clean',
        type: 'execution-failure',
        severity: 'error',
        nodeId: 'node-recent-clean',
        title: '节点执行失败',
        message: '缺少云端凭据，无法读取最近上传记录。',
        actions: ['show-report', 'replace-node', 'remove-node'],
      },
    ],
  };
};

const recentDocuments = Object.values(workflowDocuments).map((document) => ({
  id: document.id,
  name: document.name,
  nodeCount: document.graph.nodes.length,
  edgeCount: document.graph.edges.length,
  updatedAt: '2026-03-15 14:20',
}));

const listCategories = () => {
  const counts = new Map();
  catalogEntries.forEach((entry) => {
    counts.set(entry.category, (counts.get(entry.category) || 0) + 1);
  });
  return [...counts.entries()].map(([key, count]) => ({
    key,
    label: key,
    count,
  }));
};

const findRun = (runId) => {
  const all = [...runtimeState.pending, ...runtimeState.running, ...runtimeState.history];
  return all.find((item) => item.runSessionId === runId || item.runId === runId) || null;
};

const createBridgeResult = (data) => Promise.resolve({ success: true, data: cloneJsonValue(data, null) });
const createBridgeError = (error) => Promise.resolve({ success: false, error });

export const workflowMockApi = {
  workflowBootstrap() {
    return createBridgeResult({
      templates,
      recentDocuments,
      runtimeSummary: {
        queue: runtimeState,
      },
      featureFlags: {
        partialExecution: true,
        runtimeDock: true,
        nodeDocs: true,
      },
      catalogSummary: {
        total: catalogEntries.length,
        categories: listCategories(),
      },
    });
  },
  workflowTemplateList() {
    return createBridgeResult(templates);
  },
  workflowTemplateLoad(templateId) {
    const document = workflowDocuments[String(templateId || '').trim()];
    if (!document) {
      return createBridgeError('模板不存在');
    }
    return createBridgeResult(document);
  },
  workflowDocumentGet(documentId) {
    const document = workflowDocuments[String(documentId || '').trim()];
    if (!document) {
      return createBridgeError('工作流不存在');
    }
    return createBridgeResult(document);
  },
  workflowDocumentSave(payload = {}) {
    const workflow = payload?.workflow || payload;
    const document = cloneJsonValue(workflow, null);
    if (!document?.id) {
      return createBridgeError('缺少工作流 ID');
    }
    workflowDocuments[document.id] = document;
    return createBridgeResult(document);
  },
  workflowCatalogGet() {
    return createBridgeResult({
      entries: catalogEntries,
      categories: listCategories(),
    });
  },
  workflowNodeDocsGet(nodeType) {
    const entry = catalogEntries.find((item) => item.type === String(nodeType || '').trim()) || null;
    if (!entry) {
      return createBridgeError('节点文档不存在');
    }
    return createBridgeResult(entry);
  },
  workflowList() {
    return createBridgeResult(recentDocuments);
  },
  workflowGet(workflowId) {
    const document = workflowDocuments[String(workflowId || '').trim()];
    if (!document) {
      return createBridgeError('工作流不存在');
    }
    return createBridgeResult(document);
  },
  workflowSave(payload = {}) {
    return this.workflowDocumentSave(payload?.workflow || payload);
  },
  workflowDelete(workflowId) {
    const normalizedId = String(workflowId || '').trim();
    delete workflowDocuments[normalizedId];
    return createBridgeResult({ deleted: normalizedId });
  },
  workflowValidate(payload = {}) {
    const workflow = payload?.workflow || payload;
    const nodes = Array.isArray(workflow?.graph?.nodes) ? workflow.graph.nodes : [];
    if (!nodes.length) {
      return createBridgeResult({ ok: false, errors: ['当前工作流还没有节点。'], warnings: [] });
    }
    return createBridgeResult({ ok: true, errors: [], warnings: ['浏览器模式使用的是本地 mock 运行时。'] });
  },
  workflowRun(payload = {}) {
    return this.workflowEnqueue(payload);
  },
  workflowEnqueue(payload = {}) {
    const workflow = payload?.workflow || payload;
    const workflowName = workflow?.name || '未命名工作流';
    const workflowId = workflow?.id || `local-${Date.now()}`;
    const runSessionId = `run-local-${Date.now()}`;
    const record = createRun({
      runSessionId,
      workflowId,
      workflowName,
      status: 'pending',
      requestedAt: new Date().toISOString(),
      mode: 'enqueue',
    });
    runtimeState.pending.unshift(record);
    runtimeState.updatedAt = new Date().toISOString();
    return createBridgeResult({ runId: runSessionId, runSessionId, queuePosition: 1, status: 'pending' });
  },
  workflowPartialEnqueue(payload = {}) {
    return this.workflowEnqueue(payload);
  },
  workflowCancel(payload = {}) {
    const runId = typeof payload === 'string' ? payload : payload?.runId;
    const normalizedId = String(runId || '').trim();
    const pendingIndex = runtimeState.pending.findIndex((item) => item.runSessionId === normalizedId);
    if (pendingIndex >= 0) {
      const [record] = runtimeState.pending.splice(pendingIndex, 1);
      record.status = 'cancelled';
      record.endedAt = new Date().toISOString();
      runtimeState.history.unshift(record);
      return createBridgeResult({ runId: normalizedId, cancelled: true, scope: 'pending' });
    }
    return createBridgeResult({ runId: normalizedId, cancelled: false, scope: 'none' });
  },
  workflowRunGet(runId) {
    const run = findRun(runId);
    if (!run) {
      return createBridgeError('运行记录不存在');
    }
    return createBridgeResult(run);
  },
  workflowGetRun(runId) {
    return this.workflowRunGet(runId);
  },
  workflowRunList() {
    return createBridgeResult([
      ...runtimeState.running,
      ...runtimeState.pending,
      ...runtimeState.history,
    ]);
  },
  workflowListRuns() {
    return this.workflowRunList();
  },
  workflowQueueGet() {
    return createBridgeResult(runtimeState);
  },
  workflowQueueRunFront(payload = {}) {
    return this.workflowEnqueue(payload);
  },
  workflowQueueClearPending() {
    const cleared = runtimeState.pending.length;
    runtimeState.pending = [];
    runtimeState.updatedAt = new Date().toISOString();
    return createBridgeResult({ cleared });
  },
  workflowGetObjectInfo() {
    return createBridgeResult(objectInfoMap);
  },
  workflowListNodeDefinitions() {
    return createBridgeResult(nodeDefinitions);
  },
  workflowRecoveryReportGet(runSessionId) {
    return createBridgeResult(buildRecoveryReport(String(runSessionId || '').trim()));
  },
};
