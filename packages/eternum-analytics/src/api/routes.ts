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

    const mainnetGames = store.games.filter(g => g.factorySource === "mainnet");
    const slotGames = store.games.filter(g => g.factorySource === "slot");

    const mainnetSlugs = new Set(mainnetGames.map(g => g.worldSlug));
    const slotSlugs = new Set(slotGames.map(g => g.worldSlug));

    const mainnetMetrics = store.metrics.filter(m => mainnetSlugs.has(m.worldSlug));
    const slotMetrics = store.metrics.filter(m => slotSlugs.has(m.worldSlug));

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
      byNetwork: {
        mainnet: {
          games: mainnetGames.length,
          transactions: mainnetMetrics.reduce((sum, m) => sum + m.totalTransactions, 0),
          players: mainnetMetrics.reduce((sum, m) => sum + m.totalPlayers, 0),
        },
        slot: {
          games: slotGames.length,
          transactions: slotMetrics.reduce((sum, m) => sum + m.totalTransactions, 0),
          players: slotMetrics.reduce((sum, m) => sum + m.totalPlayers, 0),
        },
      },
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

  app.get("/api/scope", async (c) => {
    const store = await loadStore();

    // Calculate time range from game start times
    const startTimes = store.games
      .map(g => new Date(g.startTime).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    const earliestGame = startTimes.length > 0 ? new Date(startTimes[0]).toISOString() : null;
    const latestGame = startTimes.length > 0 ? new Date(startTimes[startTimes.length - 1]).toISOString() : null;

    // Count by network
    const mainnetGames = store.games.filter(g => g.factorySource === "mainnet").length;
    const slotGames = store.games.filter(g => g.factorySource === "slot").length;

    return c.json({
      factories: {
        mainnet: "eternum-factory-mainnet",
        slot: "eternum-factory-slot-a",
      },
      timeRange: {
        earliest: earliestGame,
        latest: latestGame,
      },
      gamesCollected: {
        total: store.games.length,
        mainnet: mainnetGames,
        slot: slotGames,
      },
      // Note: We don't track failed games, but we know mainnet is mostly offline
      warnings: mainnetGames === 0
        ? ["Mainnet worlds (mainnet-t1, mainnet-t2, etc.) have offline Torii endpoints - data unavailable"]
        : [],
      lastUpdated: store.lastUpdated,
    });
  });

  return app;
}
