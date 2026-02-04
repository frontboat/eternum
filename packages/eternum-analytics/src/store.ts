// src/store.ts
import { existsSync, mkdirSync } from "fs";
import type { AnalyticsStore } from "./types.js";

const DATA_DIR = new URL("../data", import.meta.url).pathname;
const STORE_FILE = `${DATA_DIR}/store.json`;

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

export async function loadStore(): Promise<AnalyticsStore> {
  ensureDataDir();

  if (existsSync(STORE_FILE)) {
    const content = await Bun.file(STORE_FILE).text();
    return JSON.parse(content) as AnalyticsStore;
  }

  return {
    games: [],
    metrics: [],
    players: [],
    tournaments: [],
    lastUpdated: new Date().toISOString(),
  };
}

export async function saveStore(store: AnalyticsStore): Promise<void> {
  ensureDataDir();
  store.lastUpdated = new Date().toISOString();
  await Bun.write(STORE_FILE, JSON.stringify(store, null, 2));
}

export function getPlayerMap(store: AnalyticsStore): Map<string, (typeof store.players)[0]> {
  return new Map(store.players.map((p) => [p.address, p]));
}
