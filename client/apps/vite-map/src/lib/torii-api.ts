export interface MinimapTile {
  col: number;
  row: number;
  biome?: number;
  occupier_id?: string;
  occupier_type?: number;
  occupier_is_structure?: boolean;
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
 * - bits 81-112: col (32 bits)
 * - bits 49-80:  row (32 bits)
 * - bits 41-48:  biome (8 bits)
 * - bits 9-40:   occupier_id (32 bits)
 * - bits 1-8:    occupier_type (8 bits)
 * - bit 0:       occupier_is_structure (1 bit)
 */
function decodeTile(packed: { data: string }): MinimapTile {
  const data = BigInt(packed.data);

  const col = Number((data >> 81n) & ((1n << 32n) - 1n));
  const row = Number((data >> 49n) & ((1n << 32n) - 1n));
  const biome = Number((data >> 41n) & 0xffn);
  const occupier_id = Number((data >> 9n) & ((1n << 32n) - 1n));
  const occupier_type = Number((data >> 1n) & 0xffn);
  const occupier_is_structure = (data & 1n) === 1n;

  return {
    col,
    row,
    biome: biome || undefined,
    occupier_id: occupier_id ? String(occupier_id) : undefined,
    occupier_type: occupier_type || undefined,
    occupier_is_structure,
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
