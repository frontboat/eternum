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
