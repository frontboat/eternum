import type { MinimapTile, StructureInfo, ExplorerInfo } from "./torii-api";

// Structure occupier types
export const STRUCTURE_TYPES = {
  REALM_REGULAR: [1, 2, 3, 4], // Realm Regular L1-L4
  REALM_WONDER: [5, 6, 7, 8], // Realm Wonder L1-L4
  HYPERSTRUCTURE: [9, 10, 11], // Hyperstructure L1-L3
  FRAGMENT_MINE: [12],
  VILLAGE: [13],
  BANK: [14],
} as const;

export const ALL_STRUCTURE_TYPES: readonly number[] = [
  ...STRUCTURE_TYPES.REALM_REGULAR,
  ...STRUCTURE_TYPES.REALM_WONDER,
  ...STRUCTURE_TYPES.HYPERSTRUCTURE,
  ...STRUCTURE_TYPES.FRAGMENT_MINE,
  ...STRUCTURE_TYPES.VILLAGE,
  ...STRUCTURE_TYPES.BANK,
];

export const REALM_TYPES: readonly number[] = [
  ...STRUCTURE_TYPES.REALM_REGULAR,
  ...STRUCTURE_TYPES.REALM_WONDER,
];

export const VILLAGE_TYPES: readonly number[] = [...STRUCTURE_TYPES.VILLAGE];
export const HYPERSTRUCTURE_TYPES: readonly number[] = [...STRUCTURE_TYPES.HYPERSTRUCTURE];
export const BANK_TYPES: readonly number[] = [...STRUCTURE_TYPES.BANK];
export const MINE_TYPES: readonly number[] = [...STRUCTURE_TYPES.FRAGMENT_MINE];

// Explorer occupier types
export const EXPLORER_TYPES = {
  KNIGHT: [15, 16, 17], // Knight T1-T3
  PALADIN: [18, 19, 20], // Paladin T1-T3
  CROSSBOWMAN: [21, 22, 23], // Crossbowman T1-T3
  KNIGHT_DAYDREAM: [24, 25, 26],
  PALADIN_DAYDREAM: [27, 28, 29],
  CROSSBOWMAN_DAYDREAM: [30, 31, 32],
} as const;

export const ALL_EXPLORER_TYPES: readonly number[] = [
  ...EXPLORER_TYPES.KNIGHT,
  ...EXPLORER_TYPES.PALADIN,
  ...EXPLORER_TYPES.CROSSBOWMAN,
  ...EXPLORER_TYPES.KNIGHT_DAYDREAM,
  ...EXPLORER_TYPES.PALADIN_DAYDREAM,
  ...EXPLORER_TYPES.CROSSBOWMAN_DAYDREAM,
];

// Special occupier types
export const QUEST_TYPE = 33;
export const CHEST_TYPE = 34;
export const SPIRE_TYPE = 35;

export interface TileFilters {
  // Master toggles
  showStructures: boolean;
  showExplorers: boolean;
  showQuests: boolean;
  showChests: boolean;

  // Structure sub-filters (only apply when showStructures is true)
  showRealms: boolean;
  showVillages: boolean;
  showHyperstructures: boolean;
  showBanks: boolean;
  showMines: boolean;

  // Owner filter (empty string means show all)
  ownerAddress: string;
}

export const DEFAULT_FILTERS: TileFilters = {
  showStructures: false,
  showExplorers: false,
  showQuests: false,
  showChests: false,
  showRealms: false,
  showVillages: false,
  showHyperstructures: false,
  showBanks: false,
  showMines: false,
  ownerAddress: "",
};

export function filterTiles(
  tiles: MinimapTile[],
  filters: TileFilters,
  structures?: Map<string, StructureInfo>,
  explorers?: Map<string, ExplorerInfo>,
): MinimapTile[] {
  return tiles.filter((tile) => {
    const occupierType = tile.occupier_type ?? 0;

    // No occupier - always show base terrain
    if (occupierType === 0) return true;

    // Structure filtering
    if (ALL_STRUCTURE_TYPES.includes(occupierType)) {
      if (!filters.showStructures) return false;

      // Sub-filters
      if (!filters.showRealms && REALM_TYPES.includes(occupierType)) {
        return false;
      }
      if (!filters.showVillages && VILLAGE_TYPES.includes(occupierType)) return false;
      if (!filters.showHyperstructures && HYPERSTRUCTURE_TYPES.includes(occupierType)) return false;
      if (!filters.showBanks && BANK_TYPES.includes(occupierType)) return false;
      if (!filters.showMines && MINE_TYPES.includes(occupierType)) return false;
    }

    // Explorer filtering
    if (ALL_EXPLORER_TYPES.includes(occupierType)) {
      if (!filters.showExplorers) return false;
    }

    // Quest filtering
    if (occupierType === QUEST_TYPE && !filters.showQuests) return false;

    // Chest filtering
    if (occupierType === CHEST_TYPE && !filters.showChests) return false;

    // Owner filtering
    if (filters.ownerAddress) {
      const normalizedFilter = filters.ownerAddress.toLowerCase();

      if (tile.occupier_id) {
        // Check structure owner
        if (ALL_STRUCTURE_TYPES.includes(occupierType)) {
          const structure = structures?.get(tile.occupier_id);
          if (structure && !structure.owner.toLowerCase().includes(normalizedFilter)) {
            return false;
          }
        }
        // Check explorer owner
        if (ALL_EXPLORER_TYPES.includes(occupierType)) {
          const explorer = explorers?.get(tile.occupier_id);
          if (explorer && !explorer.owner.toLowerCase().includes(normalizedFilter)) {
            return false;
          }
        }
      }
    }

    return true;
  });
}

// Base neutral color for tiles without highlighted entities
export const BASE_TILE_COLOR = "#2a2a2a";

// Highlight colors for different entity types
export const HIGHLIGHT_COLORS = {
  realm: "#f59e0b",        // Amber for realms
  village: "#84cc16",      // Lime for villages
  hyperstructure: "#8b5cf6", // Purple for hyperstructures
  bank: "#06b6d4",         // Cyan for banks
  mine: "#f97316",         // Orange for mines
  explorer: "#ef4444",     // Red for explorers
  quest: "#22c55e",        // Green for quests
  chest: "#eab308",        // Yellow for chests
} as const;

/**
 * Get the display color for a tile based on its occupier and active filters.
 * When a filter is enabled, matching entities get a highlight color.
 * Otherwise, returns the base neutral color.
 */
export function getTileHighlightColor(
  tile: MinimapTile,
  filters: TileFilters,
  structures?: Map<string, StructureInfo>,
  explorers?: Map<string, ExplorerInfo>,
): string {
  const occupierType = tile.occupier_type ?? 0;

  // No occupier - base color
  if (occupierType === 0) return BASE_TILE_COLOR;

  // Check owner filter first - if set, non-matching entities get base color
  if (filters.ownerAddress && tile.occupier_id) {
    const normalizedFilter = filters.ownerAddress.toLowerCase();
    let ownerMatches = false;

    if (ALL_STRUCTURE_TYPES.includes(occupierType)) {
      const structure = structures?.get(tile.occupier_id);
      ownerMatches = structure ? structure.owner.toLowerCase().includes(normalizedFilter) : false;
    } else if (ALL_EXPLORER_TYPES.includes(occupierType)) {
      const explorer = explorers?.get(tile.occupier_id);
      ownerMatches = explorer ? explorer.owner.toLowerCase().includes(normalizedFilter) : false;
    }

    if (!ownerMatches) return BASE_TILE_COLOR;
  }

  // Structure highlighting
  if (ALL_STRUCTURE_TYPES.includes(occupierType)) {
    if (!filters.showStructures) return BASE_TILE_COLOR;

    if (REALM_TYPES.includes(occupierType)) {
      return filters.showRealms ? HIGHLIGHT_COLORS.realm : BASE_TILE_COLOR;
    }
    if (VILLAGE_TYPES.includes(occupierType)) {
      return filters.showVillages ? HIGHLIGHT_COLORS.village : BASE_TILE_COLOR;
    }
    if (HYPERSTRUCTURE_TYPES.includes(occupierType)) {
      return filters.showHyperstructures ? HIGHLIGHT_COLORS.hyperstructure : BASE_TILE_COLOR;
    }
    if (BANK_TYPES.includes(occupierType)) {
      return filters.showBanks ? HIGHLIGHT_COLORS.bank : BASE_TILE_COLOR;
    }
    if (MINE_TYPES.includes(occupierType)) {
      return filters.showMines ? HIGHLIGHT_COLORS.mine : BASE_TILE_COLOR;
    }
  }

  // Explorer highlighting
  if (ALL_EXPLORER_TYPES.includes(occupierType)) {
    return filters.showExplorers ? HIGHLIGHT_COLORS.explorer : BASE_TILE_COLOR;
  }

  // Quest highlighting
  if (occupierType === QUEST_TYPE) {
    return filters.showQuests ? HIGHLIGHT_COLORS.quest : BASE_TILE_COLOR;
  }

  // Chest highlighting
  if (occupierType === CHEST_TYPE) {
    return filters.showChests ? HIGHLIGHT_COLORS.chest : BASE_TILE_COLOR;
  }

  // Unknown occupier type - base color
  return BASE_TILE_COLOR;
}
