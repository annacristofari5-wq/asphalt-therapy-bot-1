import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const STORE_FILE = join(DATA_DIR, "guild-config.json");

function load() {
  if (!existsSync(STORE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STORE_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function save(data) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getGuildConfig(guildId) {
  return load()[guildId] ?? {};
}

export function setGuildConfig(guildId, config) {
  const store = load();
  store[guildId] = { ...store[guildId], ...config };
  save(store);
}
