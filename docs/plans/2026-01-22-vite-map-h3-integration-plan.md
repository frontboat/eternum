# Vite-Map H3 Integration Plan for Eternum Hex Viewer

## Overview

Adapt the `client/apps/vite-map` client to display Eternum tile data using H3 for efficient spatial indexing and algorithms.

## Challenge

Eternum uses a custom offset coordinate system (`col`, `row` with `FELT_CENTER = 2^31 - 1`), while H3 is designed for geographic lat/lng coordinates. We need a mapping strategy.

## Approach: Synthetic Geographic Projection

Map Eternum's hex grid to a synthetic geographic coordinate space, allowing us to leverage H3's algorithms and MapLibre GL's rendering.

### Coordinate Mapping

```typescript
// Constants
const FELT_CENTER = 2147483647;
const HEX_SIZE_DEGREES = 0.001; // ~111 meters per hex at equator
const SQRT3 = Math.sqrt(3);

// Eternum col/row → Geographic lat/lng
function eternumToLatLng(col: number, row: number): [number, number] {
  const centeredCol = col - FELT_CENTER;
  const centeredRow = row - FELT_CENTER;

  // Offset coordinate to pixel (same as existing minimap)
  const rowOffset = ((centeredRow % 2) * Math.sign(centeredRow)) / 2;
  const x = centeredCol - rowOffset;
  const y = centeredRow * 0.75;

  // Scale to geographic coordinates
  // Center at 0,0 with hex size in degrees
  const lng = x * SQRT3 * HEX_SIZE_DEGREES;
  const lat = y * HEX_SIZE_DEGREES * 2;

  return [lat, lng];
}

// Geographic lat/lng → Eternum col/row
function latLngToEternum(lat: number, lng: number): { col: number; row: number } {
  const y = lat / (HEX_SIZE_DEGREES * 2);
  const x = lng / (SQRT3 * HEX_SIZE_DEGREES);

  const centeredRow = Math.round(y / 0.75);
  const rowOffset = ((centeredRow % 2) * Math.sign(centeredRow)) / 2;
  const centeredCol = Math.round(x + rowOffset);

  return {
    col: centeredCol + FELT_CENTER,
    row: centeredRow + FELT_CENTER,
  };
}
```

### H3 Resolution Mapping

Map zoom levels to H3 resolutions for the synthetic coordinate space:

| Map Zoom | H3 Resolution | Hex Coverage | Use Case |
|----------|---------------|--------------|----------|
| 0-4 | 4 | ~1000 tiles | World view |
| 5-8 | 6 | ~100 tiles | Regional |
| 9-12 | 8 | ~10 tiles | Local |
| 13+ | 10 | ~1 tile | Detail |

```typescript
function zoomToH3Resolution(zoom: number): number {
  if (zoom < 5) return 4;
  if (zoom < 9) return 6;
  if (zoom < 13) return 8;
  return 10;
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Vite-Map Client                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  MapLibre   │  │     H3      │  │   Eternum Data      │  │
│  │    GL       │  │  Indexing   │  │     Layer           │  │
│  │  Renderer   │  │  & Algos    │  │                     │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┴─────────────────────┘             │
│                          │                                   │
│  ┌───────────────────────┴───────────────────────────────┐  │
│  │              Coordinate Mapping Layer                  │  │
│  │         (Eternum col/row ↔ lat/lng ↔ H3)              │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Torii SQL API / Polling                 │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Core Infrastructure

#### 1.1 Add Dependencies

```bash
cd client/apps/vite-map
bun add h3-js
```

#### 1.2 Create Coordinate Mapping Module

**File**: `src/lib/eternum-coords.ts`

```typescript
import { latLngToCell, cellToLatLng, cellToBoundary } from 'h3-js';

export const FELT_CENTER = 2147483647;
const HEX_SIZE_DEGREES = 0.001;
const SQRT3 = Math.sqrt(3);

export interface EternumCoord {
  col: number;
  row: number;
}

export function eternumToLatLng(coord: EternumCoord): [number, number] {
  const centeredCol = coord.col - FELT_CENTER;
  const centeredRow = coord.row - FELT_CENTER;

  const rowOffset = ((centeredRow % 2) * Math.sign(centeredRow)) / 2;
  const x = centeredCol - rowOffset;
  const y = centeredRow * 0.75;

  const lng = x * SQRT3 * HEX_SIZE_DEGREES;
  const lat = y * HEX_SIZE_DEGREES * 2;

  return [lat, lng];
}

export function latLngToEternum(lat: number, lng: number): EternumCoord {
  const y = lat / (HEX_SIZE_DEGREES * 2);
  const x = lng / (SQRT3 * HEX_SIZE_DEGREES);

  const centeredRow = Math.round(y / 0.75);
  const rowOffset = ((centeredRow % 2) * Math.sign(centeredRow)) / 2;
  const centeredCol = Math.round(x + rowOffset);

  return {
    col: centeredCol + FELT_CENTER,
    row: centeredRow + FELT_CENTER,
  };
}

export function eternumToH3(coord: EternumCoord, resolution: number = 8): string {
  const [lat, lng] = eternumToLatLng(coord);
  return latLngToCell(lat, lng, resolution);
}

export function h3ToEternum(h3Index: string): EternumCoord {
  const [lat, lng] = cellToLatLng(h3Index);
  return latLngToEternum(lat, lng);
}
```

#### 1.3 Create Torii Data Fetcher

**File**: `src/lib/torii-api.ts`

```typescript
export interface MinimapTile {
  col: number;
  row: number;
  biome?: number;
  occupier_id?: string;
  occupier_type?: number;
  occupier_is_structure?: boolean;
}

const TORII_URL = "https://api.cartridge.gg/x/eternum-sepolia/torii";

export async function fetchAllTiles(): Promise<MinimapTile[]> {
  const query = `
    SELECT DISTINCT data
    FROM "s1_eternum-TileOpt"
    ORDER BY alt, col, row
  `;

  const response = await fetch(`${TORII_URL}/sql?query=${encodeURIComponent(query)}`);
  const data = await response.json();
  return data.map(decodeTile);
}

function decodeTile(packed: { data: string }): MinimapTile {
  // Decode packed bigint - see bit layout in docs
  const data = BigInt(packed.data);

  const col = Number((data >> 81n) & ((1n << 32n) - 1n));
  const row = Number((data >> 49n) & ((1n << 32n) - 1n));
  const biome = Number((data >> 41n) & 0xFFn);
  const occupier_id = Number((data >> 9n) & ((1n << 32n) - 1n));
  const occupier_type = Number((data >> 1n) & 0xFFn);
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
```

### Phase 2: H3 Spatial Index

#### 2.1 Create H3 Tile Index

**File**: `src/lib/h3-tile-index.ts`

```typescript
import { gridDisk, cellToLatLng, latLngToCell } from 'h3-js';
import { eternumToH3, h3ToEternum, eternumToLatLng, type EternumCoord } from './eternum-coords';
import type { MinimapTile } from './torii-api';

export class H3TileIndex {
  private tilesByH3: Map<string, MinimapTile[]> = new Map();
  private resolution: number;

  constructor(resolution: number = 8) {
    this.resolution = resolution;
  }

  // Index tiles by H3 cell
  indexTiles(tiles: MinimapTile[]): void {
    this.tilesByH3.clear();

    for (const tile of tiles) {
      const h3Index = eternumToH3({ col: tile.col, row: tile.row }, this.resolution);
      const existing = this.tilesByH3.get(h3Index) ?? [];
      existing.push(tile);
      this.tilesByH3.set(h3Index, existing);
    }
  }

  // Get tiles within k-ring of a point
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

  // Get tiles in viewport bounds
  getTilesInBounds(
    minLat: number, minLng: number,
    maxLat: number, maxLng: number
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

  // Get all indexed tiles
  getAllTiles(): MinimapTile[] {
    return Array.from(this.tilesByH3.values()).flat();
  }
}
```

### Phase 3: MapLibre Integration

#### 3.1 Create Eternum Hex Layer

**File**: `src/components/eternum-hex-layer.tsx`

```typescript
import { useEffect, useMemo } from 'react';
import { useMap } from './ui/map';
import { eternumToLatLng, FELT_CENTER } from '@/lib/eternum-coords';
import type { MinimapTile } from '@/lib/torii-api';

const BIOME_COLORS: Record<number, string> = {
  1: '#1e3a5f',  // DeepOcean
  2: '#2563eb',  // Ocean
  3: '#fcd34d',  // Beach
  7: '#ffffff',  // Snow
  10: '#166534', // Taiga
  11: '#22c55e', // Grassland
  // ... add all biome colors
};

interface EternumHexLayerProps {
  tiles: MinimapTile[];
}

export function EternumHexLayer({ tiles }: EternumHexLayerProps) {
  const { map } = useMap();

  // Convert tiles to GeoJSON
  const geojson = useMemo(() => {
    const features = tiles.map(tile => {
      const [lat, lng] = eternumToLatLng({ col: tile.col, row: tile.row });
      const color = BIOME_COLORS[tile.biome ?? 0] ?? '#4b5563';

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [lng, lat],
        },
        properties: {
          col: tile.col,
          row: tile.row,
          biome: tile.biome,
          color,
          occupier_id: tile.occupier_id,
          occupier_type: tile.occupier_type,
          occupier_is_structure: tile.occupier_is_structure,
        },
      };
    });

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [tiles]);

  useEffect(() => {
    if (!map) return;

    // Add source
    if (!map.getSource('eternum-tiles')) {
      map.addSource('eternum-tiles', {
        type: 'geojson',
        data: geojson,
      });
    } else {
      (map.getSource('eternum-tiles') as maplibregl.GeoJSONSource).setData(geojson);
    }

    // Add hex fill layer
    if (!map.getLayer('eternum-tiles-fill')) {
      map.addLayer({
        id: 'eternum-tiles-fill',
        type: 'circle',
        source: 'eternum-tiles',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['zoom'],
            0, 2,
            10, 8,
            15, 20,
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.8,
        },
      });
    }

    return () => {
      if (map.getLayer('eternum-tiles-fill')) {
        map.removeLayer('eternum-tiles-fill');
      }
      if (map.getSource('eternum-tiles')) {
        map.removeSource('eternum-tiles');
      }
    };
  }, [map, geojson]);

  return null;
}
```

#### 3.2 Create SVG Hex Overlay (Better Visual)

For proper hexagonal rendering, use an SVG overlay:

**File**: `src/components/eternum-svg-overlay.tsx`

```typescript
import { useEffect, useRef } from 'react';
import { useMap } from './ui/map';
import { eternumToLatLng } from '@/lib/eternum-coords';
import type { MinimapTile } from '@/lib/torii-api';

const HEX_SIZE = 0.0005; // Degrees
const SQRT3 = Math.sqrt(3);

function hexCorners(lat: number, lng: number): [number, number][] {
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push([
      lng + HEX_SIZE * Math.cos(angle) * SQRT3,
      lat + HEX_SIZE * Math.sin(angle),
    ]);
  }
  return corners;
}

export function EternumSvgOverlay({ tiles }: { tiles: MinimapTile[] }) {
  const { map } = useMap();
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!map || !svgRef.current) return;

    const updateOverlay = () => {
      const svg = svgRef.current!;
      const bounds = map.getBounds();
      const canvas = map.getCanvas();

      // Clear existing
      svg.innerHTML = '';
      svg.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);

      // Render visible tiles
      for (const tile of tiles) {
        const [lat, lng] = eternumToLatLng({ col: tile.col, row: tile.row });

        // Skip if outside viewport
        if (!bounds.contains([lng, lat])) continue;

        const corners = hexCorners(lat, lng);
        const points = corners.map(([lng, lat]) => {
          const point = map.project([lng, lat]);
          return `${point.x},${point.y}`;
        }).join(' ');

        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', points);
        polygon.setAttribute('fill', getBiomeColor(tile.biome));
        polygon.setAttribute('stroke', '#1f130a');
        polygon.setAttribute('stroke-width', '0.5');
        polygon.setAttribute('fill-opacity', '0.85');
        svg.appendChild(polygon);
      }
    };

    map.on('move', updateOverlay);
    map.on('zoom', updateOverlay);
    updateOverlay();

    return () => {
      map.off('move', updateOverlay);
      map.off('zoom', updateOverlay);
    };
  }, [map, tiles]);

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
      }}
    />
  );
}
```

### Phase 4: Main App Integration

#### 4.1 Update App.tsx

**File**: `src/App.tsx`

```typescript
import { useEffect, useState } from 'react';
import { Map, MapControls } from './components/ui/map';
import { EternumHexLayer } from './components/eternum-hex-layer';
import { H3TileIndex } from './lib/h3-tile-index';
import { fetchAllTiles, type MinimapTile } from './lib/torii-api';

const tileIndex = new H3TileIndex(8);

export default function App() {
  const [tiles, setTiles] = useState<MinimapTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTiles = async () => {
      try {
        setLoading(true);
        const fetchedTiles = await fetchAllTiles();
        tileIndex.indexTiles(fetchedTiles);
        setTiles(fetchedTiles);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load tiles');
      } finally {
        setLoading(false);
      }
    };

    loadTiles();
    const interval = setInterval(loadTiles, 60_000); // Refresh every 60s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading Eternum tiles...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-500">{error}</div>;
  }

  return (
    <Map
      center={[0, 0]}  // Center of Eternum world
      zoom={8}
      style={{ width: '100vw', height: '100vh' }}
    >
      <MapControls showZoom showFullscreen />
      <EternumHexLayer tiles={tiles} />
    </Map>
  );
}
```

## H3 Algorithm Usage

### Neighbor Finding

```typescript
import { gridDisk } from 'h3-js';

// Find all tiles within 3 steps of a location
const centerH3 = eternumToH3({ col, row }, 8);
const nearbyH3 = gridDisk(centerH3, 3);
const nearbyTiles = nearbyH3.flatMap(h3 => tileIndex.getTilesByH3(h3));
```

### Path Finding

```typescript
import { gridPathCells } from 'h3-js';

// Find path between two tiles
const startH3 = eternumToH3(startCoord, 8);
const endH3 = eternumToH3(endCoord, 8);
const pathH3 = gridPathCells(startH3, endH3);
const pathCoords = pathH3.map(h3ToEternum);
```

### Distance Calculation

```typescript
import { gridDistance } from 'h3-js';

// Calculate distance between tiles
const distance = gridDistance(
  eternumToH3(tile1, 8),
  eternumToH3(tile2, 8)
);
```

### Viewport Culling

```typescript
import { polygonToCells } from 'h3-js';

// Get tiles in viewport polygon
const viewportPolygon = [
  [minLat, minLng],
  [maxLat, minLng],
  [maxLat, maxLng],
  [minLat, maxLng],
];
const viewportH3 = polygonToCells(viewportPolygon, 8);
const visibleTiles = viewportH3.flatMap(h3 => tileIndex.getTilesByH3(h3));
```

## File Structure

```
client/apps/vite-map/
├── src/
│   ├── lib/
│   │   ├── eternum-coords.ts      # Coordinate mapping
│   │   ├── torii-api.ts           # Data fetching
│   │   ├── h3-tile-index.ts       # H3 spatial index
│   │   └── utils.ts               # Utilities
│   ├── components/
│   │   ├── ui/
│   │   │   └── map.tsx            # Existing map component
│   │   ├── eternum-hex-layer.tsx  # MapLibre hex layer
│   │   └── eternum-svg-overlay.tsx # SVG hex overlay
│   ├── App.tsx                    # Main app
│   └── main.tsx                   # Entry point
└── package.json
```

## Success Criteria

- [ ] Tiles load from Torii API
- [ ] Hex grid renders correctly on map
- [ ] Pan and zoom work smoothly
- [ ] H3 spatial indexing provides fast queries
- [ ] Viewport culling prevents rendering off-screen tiles
- [ ] Biome colors match Eternum game
- [ ] Occupier markers (armies, structures) display
- [ ] Click on tile shows details
