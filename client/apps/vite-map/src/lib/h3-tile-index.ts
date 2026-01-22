import { gridDisk, cellToLatLng, gridDistance, gridPathCells } from "h3-js";
import { eternumToH3, h3ToEternum, eternumToLatLng, type EternumCoord } from "./eternum-coords";
import type { MinimapTile } from "./torii-api";

/**
 * H3-based spatial index for Eternum tiles.
 * Provides efficient spatial queries using H3's hexagonal grid.
 */
export class H3TileIndex {
  private tilesByH3: Map<string, MinimapTile[]> = new Map();
  private resolution: number;
  private allTiles: MinimapTile[] = [];

  constructor(resolution: number = 8) {
    this.resolution = resolution;
  }

  /**
   * Index tiles by H3 cell.
   */
  indexTiles(tiles: MinimapTile[]): void {
    this.tilesByH3.clear();
    this.allTiles = tiles;

    for (const tile of tiles) {
      const h3Index = eternumToH3({ col: tile.col, row: tile.row }, this.resolution);
      const existing = this.tilesByH3.get(h3Index) ?? [];
      existing.push(tile);
      this.tilesByH3.set(h3Index, existing);
    }
  }

  /**
   * Get tiles by H3 cell index.
   */
  getTilesByH3(h3Index: string): MinimapTile[] {
    return this.tilesByH3.get(h3Index) ?? [];
  }

  /**
   * Get tiles within k-ring of a point.
   */
  getTilesNear(coord: EternumCoord, k: number = 1): MinimapTile[] {
    const centerH3 = eternumToH3(coord, this.resolution);
    const h3Cells = gridDisk(centerH3, k);

    const tiles: MinimapTile[] = [];
    for (const h3 of h3Cells) {
      const cellTiles = this.tilesByH3.get(h3);
      if (cellTiles) tiles.push(...cellTiles);
    }
    return tiles;
  }

  /**
   * Get tiles in viewport bounds (lat/lng).
   */
  getTilesInBounds(
    minLat: number,
    minLng: number,
    maxLat: number,
    maxLng: number
  ): MinimapTile[] {
    const tiles: MinimapTile[] = [];

    for (const [h3, cellTiles] of this.tilesByH3) {
      const [lat, lng] = cellToLatLng(h3);
      if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
        tiles.push(...cellTiles);
      }
    }

    return tiles;
  }

  /**
   * Get tiles in viewport bounds (using tile coordinates for more accurate filtering).
   */
  getTilesInViewport(
    minLat: number,
    minLng: number,
    maxLat: number,
    maxLng: number
  ): MinimapTile[] {
    return this.allTiles.filter((tile) => {
      const [lat, lng] = eternumToLatLng({ col: tile.col, row: tile.row });
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    });
  }

  /**
   * Get all indexed tiles.
   */
  getAllTiles(): MinimapTile[] {
    return this.allTiles;
  }

  /**
   * Get total number of tiles indexed.
   */
  get size(): number {
    return this.allTiles.length;
  }

  /**
   * Get number of H3 cells used.
   */
  get cellCount(): number {
    return this.tilesByH3.size;
  }

  /**
   * Find path between two tiles using H3.
   */
  findPath(start: EternumCoord, end: EternumCoord): EternumCoord[] {
    const startH3 = eternumToH3(start, this.resolution);
    const endH3 = eternumToH3(end, this.resolution);

    try {
      const pathH3 = gridPathCells(startH3, endH3);
      return pathH3.map((h3) => h3ToEternum(h3));
    } catch {
      // gridPathCells can fail for very long paths
      return [start, end];
    }
  }

  /**
   * Calculate H3 grid distance between two tiles.
   */
  getDistance(a: EternumCoord, b: EternumCoord): number {
    const aH3 = eternumToH3(a, this.resolution);
    const bH3 = eternumToH3(b, this.resolution);

    try {
      return gridDistance(aH3, bH3);
    } catch {
      // gridDistance can fail for cells in different pentagon bases
      return -1;
    }
  }
}

/**
 * Create a singleton tile index instance.
 */
export const tileIndex = new H3TileIndex(8);
