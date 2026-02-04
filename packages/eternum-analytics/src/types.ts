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
