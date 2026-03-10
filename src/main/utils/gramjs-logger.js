import { Logger } from "telegram/extensions/Logger.js";

export function createSilentGramJsLogger() {
  return new Logger("none");
}
