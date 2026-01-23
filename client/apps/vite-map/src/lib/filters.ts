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
  showStructures: true,
  showExplorers: true,
  showQuests: true,
  showChests: true,
  showRealms: true,
  showVillages: true,
  showHyperstructures: true,
  showBanks: true,
  showMines: true,
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
