import { latLngToCell, cellToLatLng, cellToBoundary } from "h3-js";

// Default FELT_CENTER matches the game's MAP_CENTER
// Note: Individual worlds may have offsets, so we calculate the actual center from tiles
export const DEFAULT_FELT_CENTER = 2147483646;

// Scale factor: determines how large hexes appear in geo-degrees
// Smaller = more zoomed out world, larger = more zoomed in
const HEX_SCALE = 0.001;
const SQRT3 = Math.sqrt(3);

export interface EternumCoord {
  col: number;
  row: number;
}

/**
 * Configuration for coordinate conversion.
 * The center can be provided to match specific worlds.
 */
export interface CoordConfig {
  centerCol: number;
  centerRow: number;
}

/**
 * Calculate the center of a set of tiles.
 * This is more robust than assuming a fixed FELT_CENTER.
 */
export function calculateTileCenter(tiles: EternumCoord[]): CoordConfig {
  if (tiles.length === 0) {
    return { centerCol: DEFAULT_FELT_CENTER, centerRow: DEFAULT_FELT_CENTER };
  }

  let minCol = Infinity, maxCol = -Infinity;
  let minRow = Infinity, maxRow = -Infinity;

  for (const tile of tiles) {
    if (tile.col < minCol) minCol = tile.col;
    if (tile.col > maxCol) maxCol = tile.col;
    if (tile.row < minRow) minRow = tile.row;
    if (tile.row > maxRow) maxRow = tile.row;
  }

  return {
    centerCol: Math.floor((minCol + maxCol) / 2),
    centerRow: Math.floor((minRow + maxRow) / 2),
  };
}

/**
 * Convert Eternum col/row coordinates to geographic lat/lng.
 * Uses a synthetic projection centered at (0, 0).
 *
 * @param coord The Eternum coordinate
 * @param config Optional center config (defaults to DEFAULT_FELT_CENTER)
 */
export function eternumToLatLng(
  coord: EternumCoord,
  config?: CoordConfig
): [number, number] {
  const centerCol = config?.centerCol ?? DEFAULT_FELT_CENTER;
  const centerRow = config?.centerRow ?? DEFAULT_FELT_CENTER;

  const centeredCol = coord.col - centerCol;
  const centeredRow = coord.row - centerRow;

  // Offset coordinate system (matches game's minimap)
  // Odd rows are offset to the LEFT by half a hex width
  // IMPORTANT: Use original coord.row for parity, not centeredRow
  // This ensures the offset pattern matches the game regardless of center position
  const rowOffset = ((coord.row % 2) * Math.sign(coord.row)) / 2;
  const x = centeredCol - rowOffset;
  const y = centeredRow * 0.75;

  // Scale to geographic coordinates
  // The hex grid spacing:
  // - horizontal: SQRT3 * HEX_SCALE
  // - vertical: HEX_SCALE * 1.5 (but we use 2 for lat to maintain aspect ratio)
  const lng = x * SQRT3 * HEX_SCALE;
  const lat = y * HEX_SCALE * 2;

  return [lat, lng];
}

/**
 * Convert geographic lat/lng back to Eternum col/row coordinates.
 */
export function latLngToEternum(
  lat: number,
  lng: number,
  config?: CoordConfig
): EternumCoord {
  const centerCol = config?.centerCol ?? DEFAULT_FELT_CENTER;
  const centerRow = config?.centerRow ?? DEFAULT_FELT_CENTER;

  const y = lat / (HEX_SCALE * 2);
  const x = lng / (SQRT3 * HEX_SCALE);

  const centeredRow = Math.round(y / 0.75);
  // Use actual row (not centered) for offset parity calculation
  const actualRow = centeredRow + centerRow;
  const rowOffset = ((actualRow % 2) * Math.sign(actualRow)) / 2;
  const centeredCol = Math.round(x + rowOffset);

  return {
    col: centeredCol + centerCol,
    row: actualRow,
  };
}

/**
 * Convert Eternum coordinate to H3 cell index.
 */
export function eternumToH3(
  coord: EternumCoord,
  resolution: number = 8,
  config?: CoordConfig
): string {
  const [lat, lng] = eternumToLatLng(coord, config);
  return latLngToCell(lat, lng, resolution);
}

/**
 * Convert H3 cell index to Eternum coordinate.
 */
export function h3ToEternum(h3Index: string, config?: CoordConfig): EternumCoord {
  const [lat, lng] = cellToLatLng(h3Index);
  return latLngToEternum(lat, lng, config);
}

/**
 * Get H3 cell boundary for an Eternum coordinate.
 * Note: H3 hexagons have different geometry than Eternum's grid.
 */
export function getEternumH3Boundary(
  coord: EternumCoord,
  resolution: number = 8,
  config?: CoordConfig
): [number, number][] {
  const h3Index = eternumToH3(coord, resolution, config);
  return cellToBoundary(h3Index);
}

/**
 * Map zoom level to appropriate H3 resolution.
 */
export function zoomToH3Resolution(zoom: number): number {
  if (zoom < 5) return 4;
  if (zoom < 9) return 6;
  if (zoom < 13) return 8;
  return 10;
}

/**
 * Generate hex corners for GeoJSON Polygon rendering.
 * Returns [lng, lat] pairs in GeoJSON order.
 *
 * The hex size is calculated to match the spacing between hex centers.
 */
export function hexCorners(
  lat: number,
  lng: number,
  size: number = HEX_SCALE * 0.8
): [number, number][] {
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    // Pointy-top hexagon, starting from top vertex
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push([
      lng + size * Math.cos(angle),
      lat + size * Math.sin(angle),
    ]);
  }
  // Close the polygon by repeating the first point
  corners.push(corners[0]);
  return corners;
}

/**
 * Calculate bounds for a set of tiles.
 */
export function calculateTileBounds(
  tiles: EternumCoord[],
  config?: CoordConfig
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  if (tiles.length === 0) {
    return { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 };
  }

  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;

  for (const tile of tiles) {
    const [lat, lng] = eternumToLatLng(tile, config);
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  return { minLat, maxLat, minLng, maxLng };
}
