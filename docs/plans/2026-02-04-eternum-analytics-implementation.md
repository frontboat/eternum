# Eternum Analytics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a TypeScript/Bun package that collects Eternum game metrics from Torii DBs and serves them via API + static dashboard.

**Architecture:** Collector queries Factory Torii for game list, then each World Torii for transactions/players. Data stored as JSON files. Bun HTTP server exposes REST API and serves static dashboard.

**Tech Stack:** TypeScript, Bun, Hono (lightweight HTTP framework)

---

### Task 1: Package Scaffolding

**Files:**
- Create: `packages/eternum-analytics/package.json`
- Create: `packages/eternum-analytics/tsconfig.json`
- Create: `packages/eternum-analytics/src/index.ts`

**Step 1: Create package.json**

```json
{
  "name": "@bibliothecadao/eternum-analytics",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "collect": "bun run src/index.ts collect",
    "serve": "bun run src/index.ts serve",
    "dev": "bun run src/index.ts serve --dev"
  },
  "dependencies": {
    "hono": "^4.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "types": ["bun-types"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Step 3: Create minimal entry point**

```typescript
// src/index.ts
const command = process.argv[2];

if (command === "collect") {
  console.log("Collecting data...");
} else if (command === "serve") {
  console.log("Starting server...");
} else {
  console.log("Usage: bun run collect | bun run serve");
}
```

**Step 4: Install dependencies**

Run: `cd packages/eternum-analytics && bun install`
Expected: Dependencies installed

**Step 5: Verify it runs**

Run: `cd packages/eternum-analytics && bun run collect`
Expected: "Collecting data..."

**Step 6: Commit**

```bash
git add packages/eternum-analytics/
git commit -m "feat(analytics): scaffold eternum-analytics package"
```

---

### Task 2: Types and Data Model

**Files:**
- Create: `packages/eternum-analytics/src/types.ts`

**Step 1: Create types file**

```typescript
// src/types.ts

export interface Game {
  worldSlug: string;
  worldAddress: string;
  name: string;
  startTime: string;
  endTime: string | null;
  status: "active" | "completed";
  seriesName?: string;
  factorySource: "mainnet" | "slot";
}

export interface GameMetrics {
  worldSlug: string;
  totalPlayers: number;
  newPlayers: number;
  recurringPlayers: number;
  totalTransactions: number;
  avgTxPerPlayer: number;
  durationHours: number;
  collectedAt: string;
}

export interface Player {
  address: string;
  name?: string;
  firstSeenGame: string;
  firstSeenTime: string;
  gamesPlayed: string[];
}

export interface Tournament {
  id: string;
  name: string;
  totalGames: number;
  completedGameSlugs: string[];
}

export interface AnalyticsStore {
  games: Game[];
  metrics: GameMetrics[];
  players: Player[];
  tournaments: Tournament[];
  lastUpdated: string;
}

export interface ToriiConfig {
  factoryMainnet: string;
  factorySlot: string;
}

export const DEFAULT_CONFIG: ToriiConfig = {
  factoryMainnet: "https://api.cartridge.gg/x/eternum-factory-mainnet/torii/sql",
  factorySlot: "https://api.cartridge.gg/x/eternum-factory-slot-a/torii/sql",
};
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/eternum-analytics && bun run src/types.ts`
Expected: No errors (empty output)

**Step 3: Commit**

```bash
git add packages/eternum-analytics/src/types.ts
git commit -m "feat(analytics): add data model types"
```

---

### Task 3: Torii SQL Client

**Files:**
- Create: `packages/eternum-analytics/src/torii-client.ts`

**Step 1: Create Torii client**

```typescript
// src/torii-client.ts

export class ToriiClient {
  constructor(private baseUrl: string) {}

  async query<T>(sql: string): Promise<T[]> {
    const url = `${this.baseUrl}?query=${encodeURIComponent(sql)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Torii query failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T[]>;
  }

  static decodeHexString(hex: string): string {
    if (!hex || !hex.startsWith("0x")) return hex;
    const bytes = Buffer.from(hex.replace("0x", ""), "hex");
    return bytes.toString("utf8").replace(/\x00/g, "");
  }

  static worldSlugToToriiUrl(slug: string): string {
    return `https://api.cartridge.gg/x/${slug}/torii/sql`;
  }
}
```

**Step 2: Test with real data**

Run: `cd packages/eternum-analytics && bun -e "
import { ToriiClient } from './src/torii-client.ts';
const client = new ToriiClient('https://api.cartridge.gg/x/eternum-factory-mainnet/torii/sql');
const result = await client.query('SELECT COUNT(*) as count FROM [wf-WorldDeployed]');
console.log('Mainnet worlds:', result);
"`
Expected: `Mainnet worlds: [ { count: 16 } ]` (or similar count)

**Step 3: Commit**

```bash
git add packages/eternum-analytics/src/torii-client.ts
git commit -m "feat(analytics): add Torii SQL client"
```

---

### Task 4: Factory Collector

**Files:**
- Create: `packages/eternum-analytics/src/collectors/factory.ts`
- Create: `packages/eternum-analytics/src/collectors/index.ts`

**Step 1: Create factory collector**

```typescript
// src/collectors/factory.ts
import { ToriiClient } from "../torii-client.js";
import type { Game, ToriiConfig } from "../types.js";

interface WorldDeployedRow {
  address: string;
  name: string;
  internal_executed_at: string;
}

export async function collectGamesFromFactory(
  config: ToriiConfig
): Promise<Game[]> {
  const games: Game[] = [];

  // Collect from both factories
  for (const [source, url] of [
    ["mainnet", config.factoryMainnet],
    ["slot", config.factorySlot],
  ] as const) {
    const client = new ToriiClient(url);

    try {
      const rows = await client.query<WorldDeployedRow>(
        "SELECT address, name, internal_executed_at FROM [wf-WorldDeployed]"
      );

      for (const row of rows) {
        const worldSlug = ToriiClient.decodeHexString(row.name);

        games.push({
          worldSlug,
          worldAddress: row.address,
          name: worldSlug,
          startTime: row.internal_executed_at,
          endTime: null, // Will be determined by world data
          status: "active",
          factorySource: source,
        });
      }
    } catch (error) {
      console.error(`Failed to fetch from ${source} factory:`, error);
    }
  }

  return games;
}
```

**Step 2: Create collectors index**

```typescript
// src/collectors/index.ts
export { collectGamesFromFactory } from "./factory.js";
```

**Step 3: Test factory collector**

Run: `cd packages/eternum-analytics && bun -e "
import { collectGamesFromFactory } from './src/collectors/factory.ts';
import { DEFAULT_CONFIG } from './src/types.ts';
const games = await collectGamesFromFactory(DEFAULT_CONFIG);
console.log('Total games:', games.length);
console.log('Sample:', games.slice(0, 2).map(g => g.worldSlug));
"`
Expected: List of games with decoded slugs

**Step 4: Commit**

```bash
git add packages/eternum-analytics/src/collectors/
git commit -m "feat(analytics): add factory collector"
```

---

### Task 5: World Collector

**Files:**
- Create: `packages/eternum-analytics/src/collectors/world.ts`
- Modify: `packages/eternum-analytics/src/collectors/index.ts`

**Step 1: Create world collector**

```typescript
// src/collectors/world.ts
import { ToriiClient } from "../torii-client.js";
import type { GameMetrics, Player } from "../types.js";

interface TransactionSummary {
  total_txs: number;
  start_time: string;
  end_time: string;
}

interface RegisteredPlayer {
  player: string;
  count: number;
}

interface AddressNameRow {
  address: string;
  name: string;
}

export async function collectWorldMetrics(
  worldSlug: string,
  existingPlayers: Map<string, Player>
): Promise<{ metrics: GameMetrics; players: Player[]; newPlayerCount: number }> {
  const url = ToriiClient.worldSlugToToriiUrl(worldSlug);
  const client = new ToriiClient(url);

  // Get transaction summary
  const [txSummary] = await client.query<TransactionSummary>(`
    SELECT
      COUNT(*) as total_txs,
      MIN(executed_at) as start_time,
      MAX(executed_at) as end_time
    FROM transactions
  `);

  // Get registered players
  const registeredPlayers = await client.query<RegisteredPlayer>(
    "SELECT player, count FROM [s1_eternum-BlitzPlayerRegisterList]"
  );

  // Get player names
  const playerNames = await client.query<AddressNameRow>(
    "SELECT address, name FROM [s1_eternum-AddressName] WHERE address != '0x0000000000000000000000000000000000000000000000000000000000000000'"
  );

  const nameMap = new Map(
    playerNames.map((p) => [p.address, ToriiClient.decodeHexString(p.name)])
  );

  // Process players
  const players: Player[] = [];
  let newPlayerCount = 0;

  for (const rp of registeredPlayers) {
    const existing = existingPlayers.get(rp.player);

    if (existing) {
      // Recurring player - update their games list
      if (!existing.gamesPlayed.includes(worldSlug)) {
        existing.gamesPlayed.push(worldSlug);
      }
      players.push(existing);
    } else {
      // New player
      newPlayerCount++;
      const newPlayer: Player = {
        address: rp.player,
        name: nameMap.get(rp.player),
        firstSeenGame: worldSlug,
        firstSeenTime: txSummary.start_time,
        gamesPlayed: [worldSlug],
      };
      players.push(newPlayer);
    }
  }

  // Calculate duration
  const start = new Date(txSummary.start_time);
  const end = new Date(txSummary.end_time);
  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

  const totalPlayers = registeredPlayers.length;
  const metrics: GameMetrics = {
    worldSlug,
    totalPlayers,
    newPlayers: newPlayerCount,
    recurringPlayers: totalPlayers - newPlayerCount,
    totalTransactions: txSummary.total_txs,
    avgTxPerPlayer: totalPlayers > 0 ? Math.round(txSummary.total_txs / totalPlayers) : 0,
    durationHours: Math.round(durationHours * 100) / 100,
    collectedAt: new Date().toISOString(),
  };

  return { metrics, players, newPlayerCount };
}
```

**Step 2: Update collectors index**

```typescript
// src/collectors/index.ts
export { collectGamesFromFactory } from "./factory.js";
export { collectWorldMetrics } from "./world.js";
```

**Step 3: Test world collector**

Run: `cd packages/eternum-analytics && bun -e "
import { collectWorldMetrics } from './src/collectors/world.ts';
const result = await collectWorldMetrics('test-opal-dark-97', new Map());
console.log('Metrics:', result.metrics);
console.log('Players:', result.players.length);
"`
Expected: Metrics with 4 players, ~849 transactions

**Step 4: Commit**

```bash
git add packages/eternum-analytics/src/collectors/
git commit -m "feat(analytics): add world metrics collector"
```

---

### Task 6: JSON Store

**Files:**
- Create: `packages/eternum-analytics/src/store.ts`
- Create: `packages/eternum-analytics/data/.gitkeep`

**Step 1: Create store**

```typescript
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

export function loadStore(): AnalyticsStore {
  ensureDataDir();

  if (existsSync(STORE_FILE)) {
    const content = Bun.file(STORE_FILE).text();
    return JSON.parse(content as unknown as string) as AnalyticsStore;
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
```

**Step 2: Create data directory with gitkeep**

Run: `mkdir -p packages/eternum-analytics/data && touch packages/eternum-analytics/data/.gitkeep`

**Step 3: Add data to gitignore**

Run: `echo "packages/eternum-analytics/data/*.json" >> .gitignore`

**Step 4: Commit**

```bash
git add packages/eternum-analytics/src/store.ts packages/eternum-analytics/data/.gitkeep .gitignore
git commit -m "feat(analytics): add JSON store"
```

---

### Task 7: Collect Command

**Files:**
- Create: `packages/eternum-analytics/src/commands/collect.ts`
- Modify: `packages/eternum-analytics/src/index.ts`

**Step 1: Create collect command**

```typescript
// src/commands/collect.ts
import { collectGamesFromFactory, collectWorldMetrics } from "../collectors/index.js";
import { loadStore, saveStore, getPlayerMap } from "../store.js";
import { DEFAULT_CONFIG } from "../types.js";

export async function runCollect(options: { full?: boolean } = {}) {
  console.log("Loading existing store...");
  const store = await loadStore();
  const playerMap = getPlayerMap(store);

  console.log(`Existing data: ${store.games.length} games, ${store.players.length} players`);

  console.log("\nFetching games from factories...");
  const games = await collectGamesFromFactory(DEFAULT_CONFIG);
  console.log(`Found ${games.length} games`);

  // Determine which games to process
  const existingSlugs = new Set(store.games.map((g) => g.worldSlug));
  const gamesToProcess = options.full
    ? games
    : games.filter((g) => !existingSlugs.has(g.worldSlug));

  console.log(`\nProcessing ${gamesToProcess.length} games...`);

  let processed = 0;
  let failed = 0;

  for (const game of gamesToProcess) {
    try {
      process.stdout.write(`  ${game.worldSlug}... `);
      const { metrics, players, newPlayerCount } = await collectWorldMetrics(
        game.worldSlug,
        playerMap
      );

      // Update store
      const existingGameIdx = store.games.findIndex((g) => g.worldSlug === game.worldSlug);
      if (existingGameIdx >= 0) {
        store.games[existingGameIdx] = game;
      } else {
        store.games.push(game);
      }

      const existingMetricsIdx = store.metrics.findIndex((m) => m.worldSlug === game.worldSlug);
      if (existingMetricsIdx >= 0) {
        store.metrics[existingMetricsIdx] = metrics;
      } else {
        store.metrics.push(metrics);
      }

      // Update players
      for (const player of players) {
        const existing = playerMap.get(player.address);
        if (existing) {
          existing.gamesPlayed = player.gamesPlayed;
        } else {
          playerMap.set(player.address, player);
          store.players.push(player);
        }
      }

      console.log(`${metrics.totalPlayers} players, ${metrics.totalTransactions} txs (${newPlayerCount} new)`);
      processed++;
    } catch (error) {
      console.log(`FAILED: ${error instanceof Error ? error.message : error}`);
      failed++;
    }
  }

  console.log(`\nSaving store...`);
  await saveStore(store);

  console.log(`\nDone! Processed: ${processed}, Failed: ${failed}`);
  console.log(`Total: ${store.games.length} games, ${store.players.length} players`);
}
```

**Step 2: Update index.ts**

```typescript
// src/index.ts
import { runCollect } from "./commands/collect.js";

const command = process.argv[2];
const flags = process.argv.slice(3);

async function main() {
  if (command === "collect") {
    const full = flags.includes("--full");
    await runCollect({ full });
  } else if (command === "serve") {
    console.log("Server not implemented yet");
  } else {
    console.log("Usage:");
    console.log("  bun run collect [--full]  Collect data from Torii");
    console.log("  bun run serve             Start API server");
  }
}

main().catch(console.error);
```

**Step 3: Test collect command (limit to 3 games)**

Run: `cd packages/eternum-analytics && bun run collect`
Expected: Collects data from games, shows progress, saves to data/store.json

**Step 4: Commit**

```bash
git add packages/eternum-analytics/src/commands/ packages/eternum-analytics/src/index.ts
git commit -m "feat(analytics): add collect command"
```

---

### Task 8: API Server

**Files:**
- Create: `packages/eternum-analytics/src/api/server.ts`
- Create: `packages/eternum-analytics/src/api/routes.ts`
- Modify: `packages/eternum-analytics/src/index.ts`

**Step 1: Create routes**

```typescript
// src/api/routes.ts
import { Hono } from "hono";
import { loadStore } from "../store.js";

export function createRoutes() {
  const app = new Hono();

  app.get("/api/games", async (c) => {
    const store = await loadStore();
    return c.json(store.games);
  });

  app.get("/api/games/:slug", async (c) => {
    const store = await loadStore();
    const slug = c.req.param("slug");
    const game = store.games.find((g) => g.worldSlug === slug);
    const metrics = store.metrics.find((m) => m.worldSlug === slug);

    if (!game) {
      return c.json({ error: "Game not found" }, 404);
    }

    return c.json({ game, metrics });
  });

  app.get("/api/metrics", async (c) => {
    const store = await loadStore();
    return c.json(store.metrics);
  });

  app.get("/api/metrics/summary", async (c) => {
    const store = await loadStore();

    const totalGames = store.games.length;
    const totalPlayers = store.players.length;
    const totalTransactions = store.metrics.reduce((sum, m) => sum + m.totalTransactions, 0);
    const avgTxPerPlayer = totalPlayers > 0 ? Math.round(totalTransactions / totalPlayers) : 0;

    return c.json({
      totalGames,
      totalPlayers,
      totalTransactions,
      avgTxPerPlayer,
      lastUpdated: store.lastUpdated,
    });
  });

  app.get("/api/players/stats", async (c) => {
    const store = await loadStore();

    const totalPlayers = store.players.length;
    const playersWithMultipleGames = store.players.filter((p) => p.gamesPlayed.length > 1).length;

    return c.json({
      totalPlayers,
      playersWithMultipleGames,
      retentionRate: totalPlayers > 0
        ? Math.round((playersWithMultipleGames / totalPlayers) * 100)
        : 0,
    });
  });

  app.get("/api/tournaments", async (c) => {
    const store = await loadStore();
    return c.json(store.tournaments);
  });

  return app;
}
```

**Step 2: Create server**

```typescript
// src/api/server.ts
import { createRoutes } from "./routes.js";
import { serveStatic } from "hono/bun";

export function startServer(port: number = 3000) {
  const app = createRoutes();

  // Serve static dashboard
  app.use("/*", serveStatic({ root: "./dashboard" }));

  console.log(`Server running at http://localhost:${port}`);
  console.log(`  API: http://localhost:${port}/api/metrics/summary`);
  console.log(`  Dashboard: http://localhost:${port}/`);

  return Bun.serve({
    port,
    fetch: app.fetch,
  });
}
```

**Step 3: Update index.ts**

```typescript
// src/index.ts
import { runCollect } from "./commands/collect.js";
import { startServer } from "./api/server.js";

const command = process.argv[2];
const flags = process.argv.slice(3);

async function main() {
  if (command === "collect") {
    const full = flags.includes("--full");
    await runCollect({ full });
  } else if (command === "serve") {
    const port = parseInt(process.env.PORT || "3000");
    startServer(port);
  } else {
    console.log("Usage:");
    console.log("  bun run collect [--full]  Collect data from Torii");
    console.log("  bun run serve             Start API server");
  }
}

main().catch(console.error);
```

**Step 4: Test API server**

Run: `cd packages/eternum-analytics && bun run serve &`
Then: `curl http://localhost:3000/api/metrics/summary`
Expected: JSON with summary stats

**Step 5: Commit**

```bash
git add packages/eternum-analytics/src/api/
git commit -m "feat(analytics): add REST API server"
```

---

### Task 9: Static Dashboard

**Files:**
- Create: `packages/eternum-analytics/dashboard/index.html`

**Step 1: Create minimal dashboard**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Eternum Analytics</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 2rem; }
    h1 { margin-bottom: 2rem; color: #fff; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .card { background: #1a1a1a; padding: 1.5rem; border-radius: 8px; border: 1px solid #333; }
    .card-value { font-size: 2rem; font-weight: bold; color: #fff; }
    .card-label { color: #888; margin-top: 0.5rem; }
    table { width: 100%; border-collapse: collapse; background: #1a1a1a; border-radius: 8px; overflow: hidden; }
    th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #333; }
    th { background: #252525; color: #888; font-weight: 500; }
    tr:hover { background: #222; }
    .loading { color: #666; }
    .updated { color: #666; font-size: 0.875rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <h1>Eternum Analytics</h1>

  <div class="cards" id="summary">
    <div class="card">
      <div class="card-value" id="totalGames">-</div>
      <div class="card-label">Total Games</div>
    </div>
    <div class="card">
      <div class="card-value" id="totalPlayers">-</div>
      <div class="card-label">Total Players</div>
    </div>
    <div class="card">
      <div class="card-value" id="totalTransactions">-</div>
      <div class="card-label">Total Transactions</div>
    </div>
    <div class="card">
      <div class="card-value" id="avgTxPerPlayer">-</div>
      <div class="card-label">Avg Tx / Player</div>
    </div>
  </div>

  <h2 style="margin-bottom: 1rem;">Games</h2>
  <table>
    <thead>
      <tr>
        <th>World</th>
        <th>Players</th>
        <th>Transactions</th>
        <th>Avg Tx/Player</th>
        <th>Duration</th>
        <th>New Players</th>
      </tr>
    </thead>
    <tbody id="gamesTable">
      <tr><td colspan="6" class="loading">Loading...</td></tr>
    </tbody>
  </table>

  <div class="updated" id="lastUpdated"></div>

  <script>
    async function loadData() {
      try {
        const [summary, metrics] = await Promise.all([
          fetch('/api/metrics/summary').then(r => r.json()),
          fetch('/api/metrics').then(r => r.json())
        ]);

        document.getElementById('totalGames').textContent = summary.totalGames.toLocaleString();
        document.getElementById('totalPlayers').textContent = summary.totalPlayers.toLocaleString();
        document.getElementById('totalTransactions').textContent = summary.totalTransactions.toLocaleString();
        document.getElementById('avgTxPerPlayer').textContent = summary.avgTxPerPlayer.toLocaleString();
        document.getElementById('lastUpdated').textContent = `Last updated: ${new Date(summary.lastUpdated).toLocaleString()}`;

        const tbody = document.getElementById('gamesTable');
        tbody.innerHTML = metrics
          .sort((a, b) => new Date(b.collectedAt) - new Date(a.collectedAt))
          .map(m => `
            <tr>
              <td>${m.worldSlug}</td>
              <td>${m.totalPlayers}</td>
              <td>${m.totalTransactions.toLocaleString()}</td>
              <td>${m.avgTxPerPlayer}</td>
              <td>${m.durationHours}h</td>
              <td>${m.newPlayers}</td>
            </tr>
          `).join('');
      } catch (error) {
        console.error('Failed to load data:', error);
        document.getElementById('gamesTable').innerHTML = '<tr><td colspan="6">Failed to load data</td></tr>';
      }
    }

    loadData();
  </script>
</body>
</html>
```

**Step 2: Create dashboard directory**

Run: `mkdir -p packages/eternum-analytics/dashboard`

**Step 3: Test dashboard**

Run: `cd packages/eternum-analytics && bun run serve`
Open: http://localhost:3000/
Expected: Dashboard shows summary cards and games table

**Step 4: Commit**

```bash
git add packages/eternum-analytics/dashboard/
git commit -m "feat(analytics): add static dashboard"
```

---

### Task 10: Final Integration Test

**Step 1: Run full collection**

Run: `cd packages/eternum-analytics && bun run collect --full`
Expected: Collects from all games (may take a few minutes)

**Step 2: Start server and verify**

Run: `cd packages/eternum-analytics && bun run serve`

Verify endpoints:
- `curl http://localhost:3000/api/metrics/summary`
- `curl http://localhost:3000/api/games`
- `curl http://localhost:3000/api/players/stats`
- Open http://localhost:3000/ in browser

Expected: All endpoints return data, dashboard displays correctly

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(analytics): complete eternum-analytics MVP"
```

---

## Summary

After completing all tasks, you'll have:

1. **Package:** `packages/eternum-analytics/`
2. **CLI Commands:**
   - `bun run collect` - Fetch data from Torii DBs
   - `bun run collect --full` - Full refresh
   - `bun run serve` - Start API + dashboard
3. **API Endpoints:**
   - `/api/games` - All games
   - `/api/games/:slug` - Single game
   - `/api/metrics` - All metrics
   - `/api/metrics/summary` - High-level summary
   - `/api/players/stats` - Player statistics
4. **Dashboard:** Static HTML at http://localhost:3000/
5. **Data:** Stored in `data/store.json`
