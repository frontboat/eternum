export interface MinimapTile {
  col: number;
  row: number;
  alt: boolean;
  biome?: number;
  occupier_id?: string;
  occupier_type?: number;
  occupier_is_structure?: boolean;
  reward_extracted: boolean;
}

// Biome color mapping (matches Eternum game)
export const BIOME_COLORS: Record<number, string> = {
  1: "#1e3a5f", // DeepOcean
  2: "#2563eb", // Ocean
  3: "#fcd34d", // Beach
  4: "#d97706", // Scorched
  5: "#78716c", // Bare
  6: "#a1a1aa", // Tundra
  7: "#ffffff", // Snow
  8: "#84cc16", // TemperateDesert
  9: "#65a30d", // Shrubland
  10: "#166534", // Taiga
  11: "#22c55e", // Grassland
  12: "#15803d", // TemperateDeciduousForest
  13: "#14532d", // TemperateRainForest
  14: "#fef08a", // SubtropicalDesert
  15: "#84cc16", // TropicalSeasonalForest
  16: "#166534", // TropicalRainForest
};

const DEFAULT_TORII_URL = "https://api.cartridge.gg/x/eternum-sepolia/torii";

/**
 * Decode packed tile data from Torii SQL response.
 *
 * Bit layout (from MSB):
 * - bit 127:     alt (1 bit)
 * - bit 113:     reward_extracted (1 bit)
 * - bits 81-112: col (32 bits)
 * - bits 49-80:  row (32 bits)
 * - bits 41-48:  biome (8 bits)
 * - bits 9-40:   occupier_id (32 bits)
 * - bits 1-8:    occupier_type (8 bits)
 * - bit 0:       occupier_is_structure (1 bit)
 */
function decodeTile(packed: { data: string }): MinimapTile {
  const data = BigInt(packed.data);

  const alt = ((data >> 127n) & 1n) === 1n;
  const reward_extracted = ((data >> 113n) & 1n) === 1n;
  const col = Number((data >> 81n) & ((1n << 32n) - 1n));
  const row = Number((data >> 49n) & ((1n << 32n) - 1n));
  const biome = Number((data >> 41n) & 0xffn);
  const occupier_id = Number((data >> 9n) & ((1n << 32n) - 1n));
  const occupier_type = Number((data >> 1n) & 0xffn);
  const occupier_is_structure = (data & 1n) === 1n;

  return {
    col,
    row,
    alt,
    biome: biome || undefined,
    occupier_id: occupier_id ? String(occupier_id) : undefined,
    occupier_type: occupier_type || undefined,
    occupier_is_structure,
    reward_extracted,
  };
}

/**
 * Fetch all tiles from Torii SQL API.
 */
export async function fetchAllTiles(
  toriiUrl: string = DEFAULT_TORII_URL
): Promise<MinimapTile[]> {
  const query = `
    SELECT DISTINCT data
    FROM "s1_eternum-TileOpt"
    ORDER BY data
  `;

  const response = await fetch(
    `${toriiUrl}/sql?query=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error(`Torii request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.map(decodeTile);
}

/**
 * Fetch tiles within a bounding box (col/row range).
 * More efficient for viewport-based loading.
 */
export async function fetchTilesInRange(
  minCol: number,
  maxCol: number,
  minRow: number,
  maxRow: number,
  toriiUrl: string = DEFAULT_TORII_URL
): Promise<MinimapTile[]> {
  // Since data is packed, we need to filter in JS after fetch
  // A more optimized approach would require Torii SQL support for bit operations
  const allTiles = await fetchAllTiles(toriiUrl);

  return allTiles.filter(
    (tile) =>
      tile.col >= minCol &&
      tile.col <= maxCol &&
      tile.row >= minRow &&
      tile.row <= maxRow
  );
}

/**
 * Get biome color for a tile.
 */
export function getBiomeColor(biome: number | undefined): string {
  return BIOME_COLORS[biome ?? 0] ?? "#4b5563";
}

// Resource names for display (matches ResourcesIds enum)
export const RESOURCE_NAMES: Record<string, string> = {
  STONE: "Stone",
  COAL: "Coal",
  WOOD: "Wood",
  COPPER: "Copper",
  IRONWOOD: "Ironwood",
  OBSIDIAN: "Obsidian",
  GOLD: "Gold",
  SILVER: "Silver",
  MITHRAL: "Mithral",
  ALCHEMICAL_SILVER: "Alchemical Silver",
  COLD_IRON: "Cold Iron",
  DEEP_CRYSTAL: "Deep Crystal",
  RUBY: "Ruby",
  DIAMONDS: "Diamonds",
  HARTWOOD: "Hartwood",
  IGNIUM: "Ignium",
  TWILIGHT_QUARTZ: "Twilight Quartz",
  TRUE_ICE: "True Ice",
  ADAMANTINE: "Adamantine",
  SAPPHIRE: "Sapphire",
  ETHEREAL_SILICA: "Ethereal Silica",
  DRAGONHIDE: "Dragonhide",
  LABOR: "Labor",
  EARTHEN_SHARD: "Earthen Shard",
  DONKEY: "Donkey",
  KNIGHT_T1: "Knight T1",
  KNIGHT_T2: "Knight T2",
  KNIGHT_T3: "Knight T3",
  CROSSBOWMAN_T1: "Crossbowman T1",
  CROSSBOWMAN_T2: "Crossbowman T2",
  CROSSBOWMAN_T3: "Crossbowman T3",
  PALADIN_T1: "Paladin T1",
  PALADIN_T2: "Paladin T2",
  PALADIN_T3: "Paladin T3",
  WHEAT: "Wheat",
  FISH: "Fish",
  LORDS: "Lords",
  ESSENCE: "Essence",
};

// Resource ID to name mapping (from ResourcesIds enum)
export const RESOURCE_ID_TO_NAME: Record<number, string> = {
  1: "Stone",
  2: "Coal",
  3: "Wood",
  4: "Copper",
  5: "Ironwood",
  6: "Obsidian",
  7: "Gold",
  8: "Silver",
  9: "Mithral",
  10: "Alchemical Silver",
  11: "Cold Iron",
  12: "Deep Crystal",
  13: "Ruby",
  14: "Diamonds",
  15: "Hartwood",
  16: "Ignium",
  17: "Twilight Quartz",
  18: "True Ice",
  19: "Adamantine",
  20: "Sapphire",
  21: "Ethereal Silica",
  22: "Dragonhide",
  23: "Labor",
  24: "Ancient Fragment",
  25: "Donkey",
  26: "Knight",
  27: "Knight T2",
  28: "Knight T3",
  29: "Crossbowman",
  30: "Crossbowman T2",
  31: "Crossbowman T3",
  32: "Paladin",
  33: "Paladin T2",
  34: "Paladin T3",
  35: "Wheat",
  36: "Fish",
  37: "Lords",
  38: "Essence",
};

/**
 * Unpack resource type IDs from a packed u128 value.
 * Each resource type takes 8 bits, packed from right to left.
 */
export function unpackResourceTypes(packed: bigint): number[] {
  const resourceTypes: number[] = [];
  let value = packed;

  while (value > 0n) {
    // Extract lowest 8 bits
    const resourceType = Number(value & 0xFFn);
    if (resourceType > 0) {
      resourceTypes.push(resourceType);
    }
    // Shift right by 8 bits
    value = value >> 8n;
  }

  return resourceTypes;
}

// Resource balance column names in Torii SQL
const RESOURCE_BALANCE_COLUMNS = [
  "STONE_BALANCE",
  "COAL_BALANCE",
  "WOOD_BALANCE",
  "COPPER_BALANCE",
  "IRONWOOD_BALANCE",
  "OBSIDIAN_BALANCE",
  "GOLD_BALANCE",
  "SILVER_BALANCE",
  "MITHRAL_BALANCE",
  "ALCHEMICAL_SILVER_BALANCE",
  "COLD_IRON_BALANCE",
  "DEEP_CRYSTAL_BALANCE",
  "RUBY_BALANCE",
  "DIAMONDS_BALANCE",
  "HARTWOOD_BALANCE",
  "IGNIUM_BALANCE",
  "TWILIGHT_QUARTZ_BALANCE",
  "TRUE_ICE_BALANCE",
  "ADAMANTINE_BALANCE",
  "SAPPHIRE_BALANCE",
  "ETHEREAL_SILICA_BALANCE",
  "DRAGONHIDE_BALANCE",
  "LABOR_BALANCE",
  "EARTHEN_SHARD_BALANCE",
  "DONKEY_BALANCE",
  "KNIGHT_T1_BALANCE",
  "KNIGHT_T2_BALANCE",
  "KNIGHT_T3_BALANCE",
  "CROSSBOWMAN_T1_BALANCE",
  "CROSSBOWMAN_T2_BALANCE",
  "CROSSBOWMAN_T3_BALANCE",
  "PALADIN_T1_BALANCE",
  "PALADIN_T2_BALANCE",
  "PALADIN_T3_BALANCE",
  "WHEAT_BALANCE",
  "FISH_BALANCE",
  "LORDS_BALANCE",
  "ESSENCE_BALANCE",
];

// Production building_count columns with their resource IDs
// Resources and troops that can be produced via buildings
const RESOURCE_PRODUCTION_COLUMNS: Array<{ column: string; resourceId: number }> = [
  // Basic resources (1-22)
  { column: "STONE_PRODUCTION", resourceId: 1 },
  { column: "COAL_PRODUCTION", resourceId: 2 },
  { column: "WOOD_PRODUCTION", resourceId: 3 },
  { column: "COPPER_PRODUCTION", resourceId: 4 },
  { column: "IRONWOOD_PRODUCTION", resourceId: 5 },
  { column: "OBSIDIAN_PRODUCTION", resourceId: 6 },
  { column: "GOLD_PRODUCTION", resourceId: 7 },
  { column: "SILVER_PRODUCTION", resourceId: 8 },
  { column: "MITHRAL_PRODUCTION", resourceId: 9 },
  { column: "ALCHEMICAL_SILVER_PRODUCTION", resourceId: 10 },
  { column: "COLD_IRON_PRODUCTION", resourceId: 11 },
  { column: "DEEP_CRYSTAL_PRODUCTION", resourceId: 12 },
  { column: "RUBY_PRODUCTION", resourceId: 13 },
  { column: "DIAMONDS_PRODUCTION", resourceId: 14 },
  { column: "HARTWOOD_PRODUCTION", resourceId: 15 },
  { column: "IGNIUM_PRODUCTION", resourceId: 16 },
  { column: "TWILIGHT_QUARTZ_PRODUCTION", resourceId: 17 },
  { column: "TRUE_ICE_PRODUCTION", resourceId: 18 },
  { column: "ADAMANTINE_PRODUCTION", resourceId: 19 },
  { column: "SAPPHIRE_PRODUCTION", resourceId: 20 },
  { column: "ETHEREAL_SILICA_PRODUCTION", resourceId: 21 },
  { column: "DRAGONHIDE_PRODUCTION", resourceId: 22 },
  // Troops (26-34) - produced via military buildings
  { column: "KNIGHT_T1_PRODUCTION", resourceId: 26 },
  { column: "KNIGHT_T2_PRODUCTION", resourceId: 27 },
  { column: "KNIGHT_T3_PRODUCTION", resourceId: 28 },
  { column: "CROSSBOWMAN_T1_PRODUCTION", resourceId: 29 },
  { column: "CROSSBOWMAN_T2_PRODUCTION", resourceId: 30 },
  { column: "CROSSBOWMAN_T3_PRODUCTION", resourceId: 31 },
  { column: "PALADIN_T1_PRODUCTION", resourceId: 32 },
  { column: "PALADIN_T2_PRODUCTION", resourceId: 33 },
  { column: "PALADIN_T3_PRODUCTION", resourceId: 34 },
  // Food (35-36)
  { column: "WHEAT_PRODUCTION", resourceId: 35 },
  { column: "FISH_PRODUCTION", resourceId: 36 },
];

export interface ResourceBalances {
  entity_id: string;
  balances: Record<string, number>; // e.g., { STONE: 1000, COAL: 500 }
  producing_resource_types: number[]; // Resource IDs with active production (building_count > 0)
}

// Troop types
export const TROOP_CATEGORIES: Record<number, string> = {
  0: "Knight",
  1: "Paladin",
  2: "Crossbowman",
};

export const TROOP_TIERS: Record<number, string> = {
  0: "T1",
  1: "T2",
  2: "T3",
};

export interface ExplorerInfo {
  explorer_id: string;
  owner: string;
  // Troop composition
  troop_category: number; // 0=Knight, 1=Paladin, 2=Crossbowman
  troop_tier: number; // 0=T1, 1=T2, 2=T3
  troop_count: number;
  // Stamina
  stamina_amount: number;
  stamina_updated_tick: number;
  // Combat
  battle_cooldown_end: number;
  // Boosts
  boosts: {
    damage_dealt_percent: number;
    damage_dealt_end_tick: number;
    damage_reduction_percent: number;
    damage_reduction_end_tick: number;
    stamina_regen_percent: number;
    stamina_regen_tick_count: number;
    explore_reward_percent: number;
    explore_reward_end_tick: number;
  };
  // Position
  coord_x: number;
  coord_y: number;
  coord_alt: boolean;
}

/**
 * Fetch all entity resources from Torii SQL API.
 * Returns a map of entity_id -> ResourceBalances for O(1) lookups.
 * Includes both balances and active production info.
 */
export async function fetchAllResources(
  toriiUrl: string = DEFAULT_TORII_URL
): Promise<Map<string, ResourceBalances>> {
  // Build production columns to fetch building_count from each Production struct
  const productionColumns = RESOURCE_PRODUCTION_COLUMNS
    .map(({ column }) => `\`${column}.building_count\` as ${column.toLowerCase()}_building_count`)
    .join(", ");

  const columns = ["entity_id", ...RESOURCE_BALANCE_COLUMNS, productionColumns].join(", ");
  const query = `
    SELECT ${columns}
    FROM "s1_eternum-Resource"
  `;

  const response = await fetch(
    `${toriiUrl}/sql?query=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error(`Torii resource request failed: ${response.status} ${response.statusText}`);
  }

  const data: Record<string, string | number>[] = await response.json();
  const resourceMap = new Map<string, ResourceBalances>();

  for (const row of data) {
    const entity_id = String(row.entity_id);
    const balances: Record<string, number> = {};

    for (const col of RESOURCE_BALANCE_COLUMNS) {
      const value = row[col];
      if (value && Number(value) > 0) {
        // Extract resource name from column (e.g., "STONE_BALANCE" -> "STONE")
        const resourceName = col.replace("_BALANCE", "");
        balances[resourceName] = Number(value);
      }
    }

    // Determine which resources are actively being produced (building_count > 0)
    const producing_resource_types: number[] = [];
    for (const { column, resourceId } of RESOURCE_PRODUCTION_COLUMNS) {
      const buildingCount = Number(row[`${column.toLowerCase()}_building_count`]) || 0;
      if (buildingCount > 0) {
        producing_resource_types.push(resourceId);
      }
    }

    resourceMap.set(entity_id, { entity_id, balances, producing_resource_types });
  }

  return resourceMap;
}

/**
 * Fetch all explorers from Torii SQL API.
 * Returns a map of explorer_id -> ExplorerInfo for O(1) lookups.
 */
export async function fetchAllExplorers(
  toriiUrl: string = DEFAULT_TORII_URL
): Promise<Map<string, ExplorerInfo>> {
  const query = `
    SELECT
      explorer_id,
      owner,
      \`troops.category\` as troop_category,
      \`troops.tier\` as troop_tier,
      \`troops.count\` as troop_count,
      \`troops.stamina.amount\` as stamina_amount,
      \`troops.stamina.updated_tick\` as stamina_updated_tick,
      \`troops.battle_cooldown_end\` as battle_cooldown_end,
      \`troops.boosts.incr_damage_dealt_percent_num\` as boost_damage_dealt,
      \`troops.boosts.incr_damage_dealt_end_tick\` as boost_damage_dealt_end,
      \`troops.boosts.decr_damage_gotten_percent_num\` as boost_damage_reduction,
      \`troops.boosts.decr_damage_gotten_end_tick\` as boost_damage_reduction_end,
      \`troops.boosts.incr_stamina_regen_percent_num\` as boost_stamina_regen,
      \`troops.boosts.incr_stamina_regen_tick_count\` as boost_stamina_regen_ticks,
      \`troops.boosts.incr_explore_reward_percent_num\` as boost_explore_reward,
      \`troops.boosts.incr_explore_reward_end_tick\` as boost_explore_reward_end,
      \`coord.x\` as coord_x,
      \`coord.y\` as coord_y,
      \`coord.alt\` as coord_alt
    FROM "s1_eternum-ExplorerTroops"
  `;

  const response = await fetch(
    `${toriiUrl}/sql?query=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error(`Torii explorer request failed: ${response.status} ${response.statusText}`);
  }

  const data: Record<string, string | number | boolean>[] = await response.json();
  const explorerMap = new Map<string, ExplorerInfo>();

  for (const row of data) {
    const explorer_id = String(row.explorer_id);

    const explorer: ExplorerInfo = {
      explorer_id,
      owner: String(row.owner),
      troop_category: Number(row.troop_category) || 0,
      troop_tier: Number(row.troop_tier) || 0,
      troop_count: Number(row.troop_count) || 0,
      stamina_amount: Number(row.stamina_amount) || 0,
      stamina_updated_tick: Number(row.stamina_updated_tick) || 0,
      battle_cooldown_end: Number(row.battle_cooldown_end) || 0,
      boosts: {
        damage_dealt_percent: Number(row.boost_damage_dealt) || 0,
        damage_dealt_end_tick: Number(row.boost_damage_dealt_end) || 0,
        damage_reduction_percent: Number(row.boost_damage_reduction) || 0,
        damage_reduction_end_tick: Number(row.boost_damage_reduction_end) || 0,
        stamina_regen_percent: Number(row.boost_stamina_regen) || 0,
        stamina_regen_tick_count: Number(row.boost_stamina_regen_ticks) || 0,
        explore_reward_percent: Number(row.boost_explore_reward) || 0,
        explore_reward_end_tick: Number(row.boost_explore_reward_end) || 0,
      },
      coord_x: Number(row.coord_x) || 0,
      coord_y: Number(row.coord_y) || 0,
      coord_alt: row.coord_alt === true || row.coord_alt === 1,
    };

    explorerMap.set(explorer_id, explorer);
  }

  return explorerMap;
}

// Structure categories (from Structure model)
export const STRUCTURE_CATEGORIES: Record<number, string> = {
  1: "Realm",
  2: "Hyperstructure",
  3: "Bank",
  4: "Fragment Mine",
  5: "Village",
};

// Realm orders/factions (1-16)
export const REALM_ORDERS: Record<number, string> = {
  1: "Power",
  2: "Giants",
  3: "Titans",
  4: "Skill",
  5: "Perfection",
  6: "Brilliance",
  7: "Enlightenment",
  8: "Protection",
  9: "Twins",
  10: "Reflection",
  11: "Detection",
  12: "Fox",
  13: "Vitriol",
  14: "Fury",
  15: "Rage",
  16: "Anger",
};

// Guard slot names (NATO phonetic alphabet)
export const GUARD_SLOTS = ["Alpha", "Bravo", "Charlie", "Delta"] as const;

// Guard boosts structure (same as explorer boosts)
export interface GuardBoosts {
  damage_dealt_percent: number;
  damage_dealt_end_tick: number;
  damage_reduction_percent: number;
  damage_reduction_end_tick: number;
  stamina_regen_percent: number;
  stamina_regen_tick_count: number;
  explore_reward_percent: number;
  explore_reward_end_tick: number;
}

export interface GuardTroop {
  slot: string; // Alpha, Bravo, Charlie, Delta
  category: number; // 0=Knight, 1=Paladin, 2=Crossbowman
  tier: number; // 0=T1, 1=T2, 2=T3
  count: bigint;
  stamina_amount: bigint;
  stamina_updated_tick: bigint;
  destroyed_tick: bigint;
  battle_cooldown_end: number;
  boosts: GuardBoosts;
}

export interface StructureInfo {
  entity_id: string;
  owner: string;
  category: number; // 1=Realm, 2=Hyperstructure, 3=Bank, 4=Mine, 5=Village
  level: number;
  created_at: number;
  // Troop counts
  troop_guard_count: number;
  troop_explorer_count: number;
  troop_max_guard_count: number;
  troop_max_explorer_count: number;
  // Guard armies (up to 4 slots)
  guards: GuardTroop[];
  // Metadata (for realms/villages)
  realm_id: number;
  order: number; // Realm order/faction (1-16)
  has_wonder: boolean;
  villages_count: number;
  village_realm: number; // Parent realm for villages
  // Production capability
  produces_resource_types: number[]; // Resource type IDs this structure can produce
}

// Helper to parse hex string to bigint
function hexToBigInt(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "number") return BigInt(value);
  const str = String(value);
  if (str.startsWith("0x")) return BigInt(str);
  return BigInt(str || "0");
}

/**
 * Fetch all structures from Torii SQL API.
 * Returns a map of entity_id -> StructureInfo for O(1) lookups.
 * Note: Resources are fetched separately via fetchAllResources().
 */
export async function fetchAllStructures(
  toriiUrl: string = DEFAULT_TORII_URL
): Promise<Map<string, StructureInfo>> {
  // Build guard columns for all 4 slots
  const guardColumns = ["alpha", "bravo", "charlie", "delta"]
    .map((slot) => `
      \`troop_guards.${slot}.category\` as ${slot}_category,
      \`troop_guards.${slot}.tier\` as ${slot}_tier,
      \`troop_guards.${slot}.count\` as ${slot}_count,
      \`troop_guards.${slot}.stamina.amount\` as ${slot}_stamina_amount,
      \`troop_guards.${slot}.stamina.updated_tick\` as ${slot}_stamina_updated_tick,
      \`troop_guards.${slot}.battle_cooldown_end\` as ${slot}_battle_cooldown_end,
      \`troop_guards.${slot}.boosts.incr_damage_dealt_percent_num\` as ${slot}_boost_damage_dealt,
      \`troop_guards.${slot}.boosts.incr_damage_dealt_end_tick\` as ${slot}_boost_damage_dealt_end,
      \`troop_guards.${slot}.boosts.decr_damage_gotten_percent_num\` as ${slot}_boost_damage_reduction,
      \`troop_guards.${slot}.boosts.decr_damage_gotten_end_tick\` as ${slot}_boost_damage_reduction_end,
      \`troop_guards.${slot}.boosts.incr_stamina_regen_percent_num\` as ${slot}_boost_stamina_regen,
      \`troop_guards.${slot}.boosts.incr_stamina_regen_tick_count\` as ${slot}_boost_stamina_regen_ticks,
      \`troop_guards.${slot}.boosts.incr_explore_reward_percent_num\` as ${slot}_boost_explore_reward,
      \`troop_guards.${slot}.boosts.incr_explore_reward_end_tick\` as ${slot}_boost_explore_reward_end,
      \`troop_guards.${slot}_destroyed_tick\` as ${slot}_destroyed_tick`)
    .join(",");

  const query = `
    SELECT
      entity_id,
      owner,
      category,
      \`base.level\` as level,
      \`base.created_at\` as created_at,
      \`base.troop_guard_count\` as troop_guard_count,
      \`base.troop_explorer_count\` as troop_explorer_count,
      \`base.troop_max_guard_count\` as troop_max_guard_count,
      \`base.troop_max_explorer_count\` as troop_max_explorer_count,
      \`metadata.realm_id\` as realm_id,
      \`metadata.order\` as realm_order,
      \`metadata.has_wonder\` as has_wonder,
      \`metadata.villages_count\` as villages_count,
      \`metadata.village_realm\` as village_realm,
      resources_packed,
      ${guardColumns}
    FROM "s1_eternum-Structure"
  `;

  const response = await fetch(
    `${toriiUrl}/sql?query=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error(`Torii structure request failed: ${response.status} ${response.statusText}`);
  }

  const data: Record<string, string | number | boolean | null>[] = await response.json();
  const structureMap = new Map<string, StructureInfo>();

  for (const row of data) {
    const entity_id = String(row.entity_id);

    // Parse guard troops from each slot
    const guards: GuardTroop[] = [];
    const slots = ["alpha", "bravo", "charlie", "delta"] as const;

    for (const slot of slots) {
      const count = hexToBigInt(row[`${slot}_count`] as string | null);
      // Only add guard if count > 0
      if (count > 0n) {
        guards.push({
          slot: slot.charAt(0).toUpperCase() + slot.slice(1), // Capitalize
          category: Number(row[`${slot}_category`]) || 0,
          tier: Number(row[`${slot}_tier`]) || 0,
          count,
          stamina_amount: hexToBigInt(row[`${slot}_stamina_amount`] as string | null),
          stamina_updated_tick: hexToBigInt(row[`${slot}_stamina_updated_tick`] as string | null),
          destroyed_tick: hexToBigInt(row[`${slot}_destroyed_tick`] as string | null),
          battle_cooldown_end: Number(row[`${slot}_battle_cooldown_end`]) || 0,
          boosts: {
            damage_dealt_percent: Number(row[`${slot}_boost_damage_dealt`]) || 0,
            damage_dealt_end_tick: Number(row[`${slot}_boost_damage_dealt_end`]) || 0,
            damage_reduction_percent: Number(row[`${slot}_boost_damage_reduction`]) || 0,
            damage_reduction_end_tick: Number(row[`${slot}_boost_damage_reduction_end`]) || 0,
            stamina_regen_percent: Number(row[`${slot}_boost_stamina_regen`]) || 0,
            stamina_regen_tick_count: Number(row[`${slot}_boost_stamina_regen_ticks`]) || 0,
            explore_reward_percent: Number(row[`${slot}_boost_explore_reward`]) || 0,
            explore_reward_end_tick: Number(row[`${slot}_boost_explore_reward_end`]) || 0,
          },
        });
      }
    }

    // Parse resources_packed to get producible resource types
    const resourcesPacked = hexToBigInt(row.resources_packed as string | null);
    const produces_resource_types = unpackResourceTypes(resourcesPacked);

    const structure: StructureInfo = {
      entity_id,
      owner: String(row.owner || ""),
      category: Number(row.category) || 0,
      level: Number(row.level) || 0,
      created_at: Number(row.created_at) || 0,
      troop_guard_count: Number(row.troop_guard_count) || 0,
      troop_explorer_count: Number(row.troop_explorer_count) || 0,
      troop_max_guard_count: Number(row.troop_max_guard_count) || 0,
      troop_max_explorer_count: Number(row.troop_max_explorer_count) || 0,
      guards,
      realm_id: Number(row.realm_id) || 0,
      order: Number(row.realm_order) || 0,
      has_wonder: row.has_wonder === true || row.has_wonder === 1,
      villages_count: Number(row.villages_count) || 0,
      village_realm: Number(row.village_realm) || 0,
      produces_resource_types,
    };

    structureMap.set(entity_id, structure);
  }

  return structureMap;
}

export interface QuestInfo {
  id: string;
  level: number;
  resource_type: number;
  amount: number;
  capacity: number;
  participant_count: number;
}

/**
 * Fetch all quest tiles from Torii SQL API.
 * Returns a map of quest_id -> QuestInfo for O(1) lookups.
 */
export async function fetchAllQuests(
  toriiUrl: string = DEFAULT_TORII_URL
): Promise<Map<string, QuestInfo>> {
  const query = `
    SELECT
      id,
      level,
      resource_type,
      amount,
      capacity,
      participant_count
    FROM "s1_eternum-QuestTile"
  `;

  const response = await fetch(
    `${toriiUrl}/sql?query=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    // Quest table might not exist in all game versions
    console.warn(`Torii quest request failed: ${response.status} - quests may not be available`);
    return new Map();
  }

  const data: Record<string, string | number>[] = await response.json();
  const questMap = new Map<string, QuestInfo>();

  for (const row of data) {
    const id = String(row.id);

    const quest: QuestInfo = {
      id,
      level: Number(row.level) || 0,
      resource_type: Number(row.resource_type) || 0,
      amount: Number(row.amount) || 0,
      capacity: Number(row.capacity) || 0,
      participant_count: Number(row.participant_count) || 0,
    };

    questMap.set(id, quest);
  }

  return questMap;
}
