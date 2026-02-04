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
