import fs from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";

const STORE_NAME = "asmr-credentials.json";

const getStorePath = () => path.join(app.getPath("userData"), STORE_NAME);

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getStorePath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveAsmrCredentials({ password, token } = {}) {
  const normalizedPassword = String(password || "");
  const normalizedToken = String(token || "");
  if (!normalizedPassword && !normalizedToken) return true;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统凭据加密不可用，未保存 ASMR 密码");
  }
  const filePath = getStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const store = readStore();
  if (normalizedPassword) store.password = safeStorage.encryptString(normalizedPassword).toString("base64");
  if (normalizedToken) store.token = safeStorage.encryptString(normalizedToken).toString("base64");
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, { flag: "w", encoding: "utf8" });
  fs.renameSync(temporaryPath, filePath);
  return true;
}

export const saveAsmrPassword = (password) => saveAsmrCredentials({ password });

function readCredential(field) {
  const encrypted = readStore()[field];
  if (!encrypted || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    return "";
  }
}

export function getAsmrPassword() {
  return readCredential("password");
}

export function getAsmrToken() {
  return readCredential("token");
}

export function clearAsmrPassword() {
  const filePath = getStorePath();
  const store = readStore();
  delete store.password;
  delete store.token;
  if (Object.keys(store).length === 0) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

export function saveTelegramCredentials({ apiHash, session, botToken } = {}) {
  return saveSecretFields({ telegramApiHash: apiHash, telegramSession: session, telegramBotToken: botToken });
}

export function clearTelegramSession() {
  return clearSecretFields(["telegramSession"]);
}

export function getTelegramCredentials() {
  return {
    apiHash: readCredential("telegramApiHash"),
    session: readCredential("telegramSession"),
    botToken: readCredential("telegramBotToken"),
  };
}

export function saveAria2Secret(secret) {
  return saveSecretFields({ aria2Secret: secret });
}

export function getAria2Secret() {
  return readCredential("aria2Secret");
}

export function saveAutomationHeartbeatSecret(secret) {
  return saveSecretFields({ automationHeartbeatSecret: secret });
}

export function getAutomationHeartbeatSecret() {
  return readCredential("automationHeartbeatSecret");
}

export function clearAutomationHeartbeatSecret() {
  return clearSecretFields(["automationHeartbeatSecret"]);
}

function saveSecretFields(fields) {
  const entries = Object.entries(fields).filter(([, value]) => {
    const normalized = String(value || "");
    return normalized && normalized !== "[REDACTED]" && normalized !== "[redacted]";
  });
  if (!entries.length) return true;
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统凭据加密不可用，未保存敏感配置");
  }
  const filePath = getStorePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const store = readStore();
  for (const [field, value] of entries) {
    store[field] = safeStorage.encryptString(String(value)).toString("base64");
  }
  if (Object.keys(store).length === 0) {
    fs.rmSync(filePath, { force: true });
    return true;
  }
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
  return true;
}

function clearSecretFields(fields) {
  const filePath = getStorePath();
  const store = readStore();
  fields.forEach((field) => delete store[field]);
  if (Object.keys(store).length === 0) {
    fs.rmSync(filePath, { force: true });
    return true;
  }
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
  return true;
}
