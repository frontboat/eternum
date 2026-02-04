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
