const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();

const readText = (relativePath) => {
  const filePath = path.join(projectRoot, relativePath);
  return fs.readFileSync(filePath, "utf-8");
};

const readJson = (relativePath) => JSON.parse(readText(relativePath));

const assertIncludes = (content, token, context, errors) => {
  if (!content.includes(token)) {
    errors.push(`[${context}] missing token: ${token}`);
  }
};

const assertRegexCountZero = (content, regex, context, errors) => {
  const matches = content.match(regex) || [];
  if (matches.length > 0) {
    errors.push(
      `[${context}] found ${matches.length} forbidden matches for ${regex}`,
    );
  }
};

const assertRegexCountAtLeast = (content, regex, minCount, context, errors) => {
  const matches = content.match(regex) || [];
  if (matches.length < minCount) {
    errors.push(
      `[${context}] expected >= ${minCount} matches for ${regex}, found ${matches.length}`,
    );
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const sortUnique = (list) => [...new Set(list)].sort();

const collectFilesBySuffix = (dir, suffix) => {
  const result = [];
  const walk = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(suffix)) {
        result.push(fullPath);
      }
    }
  };
  walk(dir);
  return result;
};

const collectVueFiles = (dir) => collectFilesBySuffix(dir, ".vue");
const collectJsFiles = (dir) => collectFilesBySuffix(dir, ".js");

const errors = [];

const urlSnapshot = readJson(
  "scripts/protocol-snapshots/asmr-url-snapshot.json",
);
const ipcFlowSnapshot = readJson(
  "scripts/protocol-snapshots/ipc-flow-snapshot.json",
);

// 1) External ASMR URL invariants
const asmrModule = readText("src/main/modules/asmr.js");
const asmrLocalizationModule = readText(
  "src/main/modules/asmr-localization.js",
);
const asmrLoginModule = readText("src/main/modules/asmr-login.js");
const mainIndexModule = readText("src/main/index.js");
const whisperModule = readText("src/main/modules/whisper.js");
const telegramLoginModule = readText("src/main/utils/telegram-login.js");
const tgLinkBuildersModule = readText(
  "src/main/modules/tg-search-bot-core/link-builders.js",
);

const expectedAsmrApiTokens = Array.isArray(urlSnapshot.asmrApiTokens)
  ? urlSnapshot.asmrApiTokens
  : [];
const asmrApiUrlRegex = /https:\/\/api\.asmr-200\.com\/api\/[^\s"'`),]+/g;
const canonicalizeAsmrApiToken = (token) => {
  if (token.startsWith("https://api.asmr-200.com/api/works")) {
    return "https://api.asmr-200.com/api/works";
  }
  if (token.startsWith("https://api.asmr-200.com/api/search/")) {
    return "https://api.asmr-200.com/api/search/";
  }
  return token;
};

const actualAsmrApiTokens = sortUnique(
  [
    ...(asmrModule.match(asmrApiUrlRegex) || []),
    ...(asmrLocalizationModule.match(asmrApiUrlRegex) || []),
  ].map(canonicalizeAsmrApiToken),
);

const actualAsmrApiTokenSet = new Set(actualAsmrApiTokens);
const expectedAsmrApiTokenSet = new Set(expectedAsmrApiTokens);

const missingAsmrApiTokens = expectedAsmrApiTokens.filter(
  (token) => !actualAsmrApiTokenSet.has(token),
);
const unexpectedAsmrApiTokens = actualAsmrApiTokens.filter(
  (token) => !expectedAsmrApiTokenSet.has(token),
);

if (missingAsmrApiTokens.length > 0) {
  errors.push(
    `[url-snapshot] missing ASMR API tokens: ${missingAsmrApiTokens.join(", ")}`,
  );
}

if (unexpectedAsmrApiTokens.length > 0) {
  errors.push(
    `[url-snapshot] unexpected ASMR API tokens: ${unexpectedAsmrApiTokens.join(
      ", ",
    )}`,
  );
}

const expectedAsmrPlaylistTokens = Array.isArray(urlSnapshot.asmrPlaylistTokens)
  ? urlSnapshot.asmrPlaylistTokens
  : [];
const asmrPlaylistUrlRegex =
  /https:\/\/api\.asmr\.one\/api\/playlist\/[^\s"'`),]+/g;
const canonicalizeAsmrPlaylistToken = (token) => {
  if (
    token.startsWith("https://api.asmr.one/api/playlist/get-playlist-works")
  ) {
    return "https://api.asmr.one/api/playlist/get-playlist-works";
  }
  if (
    token.startsWith(
      "https://api.asmr.one/api/playlist/remove-works-from-playlist",
    )
  ) {
    return "https://api.asmr.one/api/playlist/remove-works-from-playlist";
  }
  return token;
};

const actualAsmrPlaylistTokens = sortUnique(
  [
    ...(asmrModule.match(asmrPlaylistUrlRegex) || []),
    ...(asmrLocalizationModule.match(asmrPlaylistUrlRegex) || []),
    ...(asmrLoginModule.match(asmrPlaylistUrlRegex) || []),
  ].map(canonicalizeAsmrPlaylistToken),
);

const actualAsmrPlaylistTokenSet = new Set(actualAsmrPlaylistTokens);
const expectedAsmrPlaylistTokenSet = new Set(expectedAsmrPlaylistTokens);

const missingAsmrPlaylistTokens = expectedAsmrPlaylistTokens.filter(
  (token) => !actualAsmrPlaylistTokenSet.has(token),
);
const unexpectedAsmrPlaylistTokens = actualAsmrPlaylistTokens.filter(
  (token) => !expectedAsmrPlaylistTokenSet.has(token),
);

if (missingAsmrPlaylistTokens.length > 0) {
  errors.push(
    `[url-snapshot] missing ASMR playlist tokens: ${missingAsmrPlaylistTokens.join(
      ", ",
    )}`,
  );
}

if (unexpectedAsmrPlaylistTokens.length > 0) {
  errors.push(
    `[url-snapshot] unexpected ASMR playlist tokens: ${unexpectedAsmrPlaylistTokens.join(
      ", ",
    )}`,
  );
}

const expectedTgLinkTokens = Array.isArray(urlSnapshot.tgLinkTokens)
  ? urlSnapshot.tgLinkTokens
  : [];
expectedTgLinkTokens.forEach((token) => {
  assertIncludes(
    tgLinkBuildersModule,
    token,
    "tg-search-bot-core/link-builders.js",
    errors,
  );
});

// 2) IPC channel invariants (preload <-> main)
const preload = readText("src/preload/index.js");

const preloadChannelTokens = Array.isArray(ipcFlowSnapshot.preloadChannelTokens)
  ? ipcFlowSnapshot.preloadChannelTokens
  : [];

preloadChannelTokens.forEach((channelToken) => {
  assertIncludes(preload, channelToken, "preload/index.js", errors);
});

// 2.2) preload bridge shape invariants
assertRegexCountAtLeast(
  preload,
  /contextBridge\.exposeInMainWorld\(\s*["']api["']\s*,\s*api\s*\)/g,
  1,
  "preload/index.js",
  errors,
);
assertRegexCountAtLeast(
  preload,
  /window\.api\s*=\s*api\b/g,
  1,
  "preload/index.js",
  errors,
);
assertRegexCountAtLeast(
  preload,
  /invoke:\s*\(channel,\s*data\)\s*=>\s*ipcRenderer\.invoke\(channel,\s*data\)/g,
  1,
  "preload/index.js",
  errors,
);
assertRegexCountAtLeast(
  preload,
  /send:\s*\(channel,\s*data\)\s*=>\s*ipcRenderer\.send\(channel,\s*data\)/g,
  1,
  "preload/index.js",
  errors,
);
assertRegexCountZero(
  preload,
  /contextBridge\.exposeInMainWorld\(\s*["']api["']\s*,\s*ipcRenderer\s*\)/g,
  "preload/index.js",
  errors,
);

// 2.3) ASMR invoke channel transport symmetry (invoke -> handle)
const asmrInvokeHandleChannels = Array.isArray(
  ipcFlowSnapshot.asmrInvokeHandleChannels,
)
  ? ipcFlowSnapshot.asmrInvokeHandleChannels
  : [];

asmrInvokeHandleChannels.forEach((channel) => {
  const handleRegex = new RegExp(
    `ipcMain\\.handle\\(\\s*["']${escapeRegex(channel)}["']`,
    "g",
  );
  const onRegex = new RegExp(
    `ipcMain\\.on\\(\\s*["']${escapeRegex(channel)}["']`,
    "g",
  );

  assertRegexCountAtLeast(
    asmrLocalizationModule,
    handleRegex,
    1,
    "asmr-localization.js",
    errors,
  );
  assertRegexCountZero(
    asmrLocalizationModule,
    onRegex,
    "asmr-localization.js",
    errors,
  );
});

// 2.4) ASMR send channel transport symmetry (send -> on)
const asmrSendOnChannels = Array.isArray(ipcFlowSnapshot.asmrSendOnChannels)
  ? ipcFlowSnapshot.asmrSendOnChannels
  : [];

asmrSendOnChannels.forEach((channel) => {
  const onRegex = new RegExp(
    `ipcMain\\.on\\(\\s*["']${escapeRegex(channel)}["']`,
    "g",
  );
  const handleRegex = new RegExp(
    `ipcMain\\.handle\\(\\s*["']${escapeRegex(channel)}["']`,
    "g",
  );

  assertRegexCountAtLeast(
    asmrLocalizationModule,
    onRegex,
    1,
    "asmr-localization.js",
    errors,
  );
  assertRegexCountZero(
    asmrLocalizationModule,
    handleRegex,
    "asmr-localization.js",
    errors,
  );
});

// 2.5) Main IPC alias invariants
const mainAliasHandleChannels = Array.isArray(
  ipcFlowSnapshot.mainAliasHandleChannels,
)
  ? ipcFlowSnapshot.mainAliasHandleChannels
  : [];

mainAliasHandleChannels.forEach((channel) => {
  const handleRegex = new RegExp(
    `ipcMain\\.handle\\(\\s*["']${escapeRegex(channel)}["']`,
    "g",
  );
  assertRegexCountAtLeast(
    asmrLocalizationModule,
    handleRegex,
    1,
    "asmr-localization.js",
    errors,
  );
});

// 2.6) Main index handle channel invariants
const mainIndexHandleChannels = Array.isArray(
  ipcFlowSnapshot.mainIndexHandleChannels,
)
  ? ipcFlowSnapshot.mainIndexHandleChannels
  : [];

mainIndexHandleChannels.forEach((channel) => {
  const handleRegex = new RegExp(
    `ipcMain\\.handle\\(\\s*["']${escapeRegex(channel)}["']`,
    "g",
  );
  const onRegex = new RegExp(
    `ipcMain\\.on\\(\\s*["']${escapeRegex(channel)}["']`,
    "g",
  );

  assertRegexCountAtLeast(
    mainIndexModule,
    handleRegex,
    1,
    "main/index.js",
    errors,
  );
  assertRegexCountZero(mainIndexModule, onRegex, "main/index.js", errors);
});

// 2.7) Whisper / Telegram event continuity invariants
const whisperRequiredTokens = Array.isArray(
  ipcFlowSnapshot.whisperRequiredTokens,
)
  ? ipcFlowSnapshot.whisperRequiredTokens
  : [];
whisperRequiredTokens.forEach((token) => {
  assertIncludes(whisperModule, token, "whisper.js", errors);
});

const telegramLoginEventChannels = Array.isArray(
  ipcFlowSnapshot.telegramLoginEventChannels,
)
  ? ipcFlowSnapshot.telegramLoginEventChannels
  : [];
telegramLoginEventChannels.forEach((channel) => {
  const senderSendRegex = new RegExp(
    `sender\\.send\\(\\s*["']${escapeRegex(channel)}["']\\s*,`,
    "g",
  );
  assertRegexCountAtLeast(
    telegramLoginModule,
    senderSendRegex,
    1,
    "telegram-login.js",
    errors,
  );
});

const asmrLocalizationEventChannels = Array.isArray(
  ipcFlowSnapshot.asmrLocalizationEventChannels,
)
  ? ipcFlowSnapshot.asmrLocalizationEventChannels
  : [];
asmrLocalizationEventChannels.forEach((channel) => {
  const contentsSendRegex = new RegExp(
    `contents\\.send\\(\\s*["']${escapeRegex(channel)}["']\\s*[,)]`,
    "g",
  );
  assertRegexCountAtLeast(
    asmrLocalizationModule,
    contentsSendRegex,
    1,
    "asmr-localization.js",
    errors,
  );
});

// 2.8) Active wiring invariant: runtime uses asmr-localization setup
const mainIndexRequiredTokens = Array.isArray(
  ipcFlowSnapshot.mainIndexRequiredTokens,
)
  ? ipcFlowSnapshot.mainIndexRequiredTokens
  : [];
mainIndexRequiredTokens.forEach((token) => {
  assertIncludes(mainIndexModule, token, "main/index.js", errors);
});

// 3) Renderer invariant: no direct window.api in .vue
const rendererVueDir = path.join(projectRoot, "src/renderer/src");
for (const vueFilePath of collectVueFiles(rendererVueDir)) {
  const content = fs.readFileSync(vueFilePath, "utf-8");
  assertRegexCountZero(
    content,
    /window\.api\b/g,
    path.relative(projectRoot, vueFilePath),
    errors,
  );
}

// 4) Renderer adapter invariant: avoid generic invoke fallback in adapters
const rendererApiDir = path.join(projectRoot, "src/renderer/src/api");
for (const adapterFilePath of collectJsFiles(rendererApiDir)) {
  const content = fs.readFileSync(adapterFilePath, "utf-8");
  assertRegexCountZero(
    content,
    /window\.api\.invoke\(/g,
    path.relative(projectRoot, adapterFilePath),
    errors,
  );
}

if (errors.length > 0) {
  console.error("❌ Protocol invariants check failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log("✅ Protocol invariants check passed.");
