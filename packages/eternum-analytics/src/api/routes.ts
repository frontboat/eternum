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
