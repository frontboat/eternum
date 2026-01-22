# Building an External Hexmap Viewer for Eternum

This guide explains how the Eternum hex minimap works and how to build your own external viewer.

## Overview

Eternum uses a hex-based world map with an **offset coordinate system**. The map data is served via Torii (a Dojo indexer) and can be queried via SQL or GraphQL endpoints.

## Coordinate System

### Offset Coordinates

Eternum uses **offset coordinates** (`col`, `row`) with flat-top hexagons and staggered rows:

```
    ___     ___     ___
   /   \___/   \___/   \     row 0
   \___/   \___/   \___/
   /   \___/   \___/   \     row 1 (offset by half hex width)
   \___/   \___/   \___/
```

### World Center

The world uses a **felt center** constant to normalize coordinates:

```typescript
const FELT_CENTER = 2147483647; // 2^31 - 1

// Convert from absolute to centered coordinates
const centeredCol = tile.col - FELT_CENTER;
const centeredRow = tile.row - FELT_CENTER;
```

### Coordinate Conversions

Convert offset coordinates to pixel positions for rendering:

```typescript
const HEX_SIZE = 7; // Radius of hexagon
const SQRT3 = Math.sqrt(3);

function getGridMetrics() {
  const hexHeight = HEX_SIZE * 2;
  const hexWidth = SQRT3 * HEX_SIZE;
  const vertDist = hexHeight * 0.75;  // Vertical spacing between rows
  const horizDist = hexWidth;          // Horizontal spacing between columns
  return { vertDist, horizDist };
}

function offsetToPixel(col: number, row: number) {
  const { vertDist, horizDist } = getGridMetrics();
  // Odd rows are offset by half the horizontal distance
  const rowOffset = ((row % 2) * Math.sign(row) * horizDist) / 2;
  const x = col * horizDist - rowOffset;
  const y = row * vertDist;
  return { x, y };
}

function pixelToOffset(x: number, y: number) {
  const { vertDist, horizDist } = getGridMetrics();
  const row = Math.round(y / vertDist);
  const rowOffset = ((row % 2) * Math.sign(row) * horizDist) / 2;
  const col = Math.round((x + rowOffset) / horizDist);
  return { col, row };
}
```

## Data Structures

### Tile Data

Each explored tile contains:

```typescript
interface MinimapTile {
  col: number;           // X coordinate (absolute, needs centering)
  row: number;           // Y coordinate (absolute, needs centering)
  biome?: number;        // Biome type ID (0-26)
  occupier_id?: string;  // Entity ID of occupier (army, structure, etc.)
  occupier_type?: number; // Type of occupier (see TileOccupier enum)
  occupier_is_structure?: boolean; // Whether occupier is a structure
}
```

### Biome Types

```typescript
enum BiomeType {
  None = 0,
  DeepOcean = 1,
  Ocean = 2,
  Beach = 3,
  Scorched = 4,
  Bare = 5,
  Tundra = 6,
  Snow = 7,
  TemperateDesert = 8,
  Shrubland = 9,
  Taiga = 10,
  Grassland = 11,
  TemperateDeciduousForest = 12,
  TemperateRainForest = 13,
  SubtropicalDesert = 14,
  TropicalSeasonalForest = 15,
  TropicalRainForest = 16,
  // ... additional biomes
}
```

### Tile Occupiers

```typescript
enum TileOccupier {
  None = 0,
  Realm = 1,
  Village = 2,
  Hyperstructure = 3,
  FragmentMine = 4,
  Army = 5,
  Quest = 6,
  Chest = 7,
  // Structure types have specific ranges
}
```

## Fetching Map Data

### Torii SQL Endpoint

Query tiles via the Torii SQL endpoint:

```typescript
const TORII_URL = "https://api.cartridge.gg/x/eternum-sepolia/torii";

async function fetchTiles(): Promise<MinimapTile[]> {
  const query = `
    SELECT
      col,
      row,
      biome,
      occupier_id,
      occupier_type,
      occupier_is_structure
    FROM "s1_eternum-Tile"
    WHERE biome IS NOT NULL
  `;

  const response = await fetch(`${TORII_URL}/sql?query=${encodeURIComponent(query)}`);
  const data = await response.json();
  return data.map(normalizeTile);
}

function normalizeTile(tile: any): MinimapTile {
  return {
    col: Number(tile.col),
    row: Number(tile.row),
    biome: tile.biome !== undefined ? Number(tile.biome) : undefined,
    occupier_id: normalizeEntityId(tile.occupier_id),
    occupier_type: tile.occupier_type !== undefined ? Number(tile.occupier_type) : undefined,
    occupier_is_structure: Boolean(tile.occupier_is_structure),
  };
}

function normalizeEntityId(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = typeof value === "string" ? value.trim() : String(value);
  if (!raw) return undefined;
  try {
    const parsed = BigInt(raw);
    if (parsed === 0n) return undefined;
    return parsed.toString();
  } catch {
    return raw === "0" ? undefined : raw;
  }
}
```

### Polling vs Streaming

The Eternum minimap uses **polling** (fetching every 60 seconds) rather than real-time streaming because:

1. **Scale** - Streaming all tiles would create massive network overhead
2. **Frequency** - Tiles change infrequently (only when explored)
3. **Efficiency** - SQL queries can be cached and optimized server-side

```typescript
// Polling approach (recommended for tile data)
useEffect(() => {
  const loadTiles = async () => {
    const tiles = await fetchTiles();
    setTiles(tiles);
  };

  loadTiles();
  const interval = setInterval(loadTiles, 60_000); // Refresh every 60s
  return () => clearInterval(interval);
}, []);
```

### Real-time Streaming (Advanced)

For real-time updates to specific entities (armies, structures), you can use Torii's gRPC/WebSocket streaming via the `@dojoengine/torii-wasm` package.

#### Installing Dependencies

```bash
npm install @dojoengine/torii-wasm @dojoengine/torii-client
```

#### Stream Subscription Architecture

```
Cairo Contract (on-chain)
    ↓
Torii Indexer (indexes events & state)
    ↓
Torii gRPC/WebSocket Server
    ↓
ToriiClient.onEntityUpdated() / onEventMessageUpdated()
    ↓
Your Application
```

#### Basic Streaming Setup

```typescript
import { ToriiClient } from "@dojoengine/torii-wasm";

// Initialize Torii client
const client = await ToriiClient.new({
  toriiUrl: "https://api.cartridge.gg/x/eternum-sepolia/torii",
  relayUrl: "", // Optional WebRTC relay
  worldAddress: "0x...", // Eternum world contract address
});

// Subscribe to entity updates
const subscription = await client.onEntityUpdated(
  clause,  // Filter clause (see below)
  (entity) => {
    console.log("Entity updated:", entity);
    // Process the updated entity
  }
);

// Subscribe to contract events
const eventSubscription = await client.onEventMessageUpdated(
  clause,
  (event) => {
    console.log("Event received:", event);
  }
);

// Cancel when done
subscription.cancel();
eventSubscription.cancel();
```

#### Building Filter Clauses

Filter subscriptions by component values or bounds:

```typescript
import {
  AndComposeClause,
  MemberClause,
  KeysClause
} from "@dojoengine/torii-client";

// Subscribe to tiles in a specific region
const boundsClause = AndComposeClause([
  MemberClause("s1_eternum-Tile", "col", "Gte", minCol),
  MemberClause("s1_eternum-Tile", "col", "Lte", maxCol),
  MemberClause("s1_eternum-Tile", "row", "Gte", minRow),
  MemberClause("s1_eternum-Tile", "row", "Lte", maxRow),
]).build();

// Subscribe to a specific entity by ID
const entityClause = KeysClause(
  ["s1_eternum-Tile"],
  [entityId]
).build();

// Subscribe to all updates (null clause)
const allUpdatesClause = null;
```

#### Batching Updates for Performance

When streaming many updates, batch them for better performance:

```typescript
class UpdateBatcher {
  private queue: Entity[] = [];
  private batchSize = 25;
  private batchIntervalMs = 50;
  private timer: number | null = null;

  enqueue(entity: Entity) {
    this.queue.push(entity);
    this.scheduleBatch();
  }

  private scheduleBatch() {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.processBatch();
      this.timer = null;
    }, this.batchIntervalMs);
  }

  private processBatch() {
    const batch = this.queue.splice(0, this.batchSize);
    // Merge updates for same entity
    const merged = this.mergeUpdates(batch);
    this.onBatch(merged);
  }

  private mergeUpdates(batch: Entity[]): Map<string, Entity> {
    const result = new Map();
    for (const entity of batch) {
      const existing = result.get(entity.id);
      if (existing) {
        result.set(entity.id, { ...existing, ...entity });
      } else {
        result.set(entity.id, entity);
      }
    }
    return result;
  }

  onBatch(entities: Map<string, Entity>) {
    // Override this to handle batched updates
  }
}
```

#### When to Use Streaming vs Polling

| Data Type | Recommended | Reason |
|-----------|-------------|--------|
| Tiles | Polling (60s) | Large dataset, infrequent changes |
| Armies | Streaming | Frequent movement, small dataset |
| Structures | Streaming (bounded) | Real-time ownership changes |
| Events (battles) | Streaming | Need immediate notification |
| Leaderboards | Polling (30s) | Aggregated data, moderate changes |

## Rendering with SVG

### Hexagon Geometry

Generate hexagon corner points for SVG polygons:

```typescript
function hexCorners(center: { x: number; y: number }) {
  const corners: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    // Flat-top hexagon: start at -30 degrees
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({
      x: center.x + HEX_SIZE * Math.cos(angle),
      y: center.y + HEX_SIZE * Math.sin(angle),
    });
  }
  return corners;
}

function cornersToPoints(corners: Array<{ x: number; y: number }>) {
  return corners.map(c => `${c.x},${c.y}`).join(" ");
}
```

### Biome Colors

Map biome IDs to colors:

```typescript
const BIOME_COLORS: Record<number, string> = {
  0: "#4b5563",  // None - gray
  1: "#1e3a5f",  // DeepOcean - dark blue
  2: "#2563eb",  // Ocean - blue
  3: "#fcd34d",  // Beach - sand
  4: "#78350f",  // Scorched - dark brown
  5: "#a8a29e",  // Bare - stone
  6: "#d6d3d1",  // Tundra - light gray
  7: "#ffffff",  // Snow - white
  8: "#d97706",  // TemperateDesert - orange
  9: "#84cc16",  // Shrubland - lime
  10: "#166534", // Taiga - dark green
  11: "#22c55e", // Grassland - green
  12: "#15803d", // TemperateDeciduousForest - forest green
  13: "#064e3b", // TemperateRainForest - dark teal
  14: "#ea580c", // SubtropicalDesert - orange-red
  15: "#65a30d", // TropicalSeasonalForest - yellow-green
  16: "#14532d", // TropicalRainForest - deep green
};

function getBiomeColor(biomeId?: number): string {
  if (biomeId === undefined) return "#4b5563";
  return BIOME_COLORS[biomeId] ?? "#4b5563";
}
```

### Basic SVG Renderer

```typescript
function renderHexmap(tiles: MinimapTile[], container: HTMLElement) {
  const FELT_CENTER = 2147483647;

  // Pre-compute tile positions
  const tileData = tiles.map(tile => {
    const centeredCol = tile.col - FELT_CENTER;
    const centeredRow = tile.row - FELT_CENTER;
    const pixel = offsetToPixel(centeredCol, centeredRow);
    const corners = hexCorners(pixel);
    const points = cornersToPoints(corners);
    return { tile, pixel, points };
  });

  // Calculate bounds
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const { pixel } of tileData) {
    minX = Math.min(minX, pixel.x - HEX_SIZE);
    maxX = Math.max(maxX, pixel.x + HEX_SIZE);
    minY = Math.min(minY, pixel.y - HEX_SIZE);
    maxY = Math.max(maxY, pixel.y + HEX_SIZE);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const padding = HEX_SIZE * 2;

  // Create SVG
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox",
    `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`
  );
  svg.style.width = "100%";
  svg.style.height = "100%";

  // Render tiles
  for (const { tile, pixel, points } of tileData) {
    const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    polygon.setAttribute("points", points);
    polygon.setAttribute("fill", getBiomeColor(tile.biome));
    polygon.setAttribute("stroke", "#1f130a");
    polygon.setAttribute("stroke-width", "0.6");
    polygon.setAttribute("fill-opacity", "0.92");
    svg.appendChild(polygon);

    // Add occupier indicator
    if (tile.occupier_id) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(pixel.x));
      circle.setAttribute("cy", String(pixel.y));
      circle.setAttribute("r", String(HEX_SIZE * 0.45));
      circle.setAttribute("fill", tile.occupier_is_structure ? "#22d3ee" : "#f97316");
      circle.setAttribute("stroke", "#0f0a07");
      circle.setAttribute("stroke-width", "0.8");
      svg.appendChild(circle);
    }
  }

  container.appendChild(svg);
}
```

## Pan and Zoom

### ViewBox-based Navigation

```typescript
class HexmapViewer {
  private view = { x: 0, y: 0, scale: 1.4 };
  private svg: SVGSVGElement;
  private viewport: { width: number; height: number };

  updateViewBox() {
    const width = this.viewport.width / this.view.scale;
    const height = this.viewport.height / this.view.scale;
    const viewBox = `${this.view.x - width/2} ${this.view.y - height/2} ${width} ${height}`;
    this.svg.setAttribute("viewBox", viewBox);
  }

  pan(dx: number, dy: number) {
    this.view.x += dx / this.view.scale;
    this.view.y += dy / this.view.scale;
    this.updateViewBox();
  }

  zoom(factor: number, centerX: number, centerY: number) {
    const newScale = Math.max(0.4, Math.min(4, this.view.scale * factor));
    this.view.scale = newScale;
    this.updateViewBox();
  }
}
```

### Mouse/Touch Handlers

```typescript
// Drag to pan
let dragging = false;
let lastX = 0, lastY = 0;

svg.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  svg.setPointerCapture(e.pointerId);
});

svg.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = lastX - e.clientX;
  const dy = lastY - e.clientY;
  viewer.pan(dx, dy);
  lastX = e.clientX;
  lastY = e.clientY;
});

svg.addEventListener("pointerup", () => {
  dragging = false;
});

// Scroll to zoom
svg.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  viewer.zoom(factor, e.clientX, e.clientY);
});
```

## Performance Optimizations

### Viewport Culling

Only render tiles visible in the current viewport:

```typescript
function getVisibleTiles(allTiles: TileData[], viewBox: ViewBox): TileData[] {
  const padding = HEX_SIZE * 3;
  const minX = viewBox.minX - padding;
  const maxX = viewBox.minX + viewBox.width + padding;
  const minY = viewBox.minY - padding;
  const maxY = viewBox.minY + viewBox.height + padding;

  return allTiles.filter(({ bounds }) =>
    bounds.maxX >= minX &&
    bounds.minX <= maxX &&
    bounds.maxY >= minY &&
    bounds.minY <= maxY
  );
}
```

### Spatial Indexing

Index tiles by column for fast lookup:

```typescript
function buildSpatialIndex(tiles: MinimapTile[]) {
  const byCol = new Map<number, TileData[]>();

  for (const tile of tiles) {
    const col = tile.col - FELT_CENTER;
    const existing = byCol.get(col) ?? [];
    existing.push(processTile(tile));
    byCol.set(col, existing);
  }

  // Sort each column by row for binary search
  byCol.forEach(entries => entries.sort((a, b) => a.row - b.row));

  return byCol;
}
```

## Integration with Game Camera

The minimap can sync with the main game camera via custom events:

```typescript
// Dispatch camera move from minimap
function onMinimapPan(centerX: number, centerY: number) {
  const { col, row } = pixelToOffset(centerX, centerY);
  window.dispatchEvent(new CustomEvent("minimapCameraMove", {
    detail: { col: col + FELT_CENTER, row: row + FELT_CENTER }
  }));
}

// Listen for camera position from game
window.addEventListener("gameCameraUpdate", (e: CustomEvent) => {
  const { col, row } = e.detail;
  centerOnTile(col, row);
});

// Dispatch zoom from minimap
function onMinimapZoom(zoomOut: boolean) {
  window.dispatchEvent(new CustomEvent("minimapZoom", {
    detail: { zoomOut }
  }));
}
```

## Complete Example

See the full implementation at:
- `client/apps/game/src/ui/features/world/components/bottom-right-panel/hex-minimap.tsx`

## API Endpoints

| Environment | Torii URL |
|-------------|-----------|
| Sepolia | `https://api.cartridge.gg/x/eternum-sepolia/torii` |
| Mainnet | `https://api.cartridge.gg/x/eternum/torii` |
| Local | `http://localhost:8080` |

### Example SQL Queries

**All explored tiles:**
```sql
SELECT col, row, biome, occupier_id, occupier_type, occupier_is_structure
FROM "s1_eternum-Tile"
WHERE biome IS NOT NULL
```

**Tiles in a region:**
```sql
SELECT col, row, biome, occupier_id, occupier_type, occupier_is_structure
FROM "s1_eternum-Tile"
WHERE col BETWEEN {minCol} AND {maxCol}
  AND row BETWEEN {minRow} AND {maxRow}
  AND biome IS NOT NULL
```

**Player structures:**
```sql
SELECT s.entity_id, p.x AS col, p.y AS row, s.category
FROM "s1_eternum-Structure" s
JOIN "s1_eternum-Position" p ON s.entity_id = p.entity_id
WHERE s.owner = '{playerAddress}'
```

## Package Functions Reference

The Eternum hex minimap uses functions from several `@bibliothecadao` packages:

### @bibliothecadao/eternum (Core Logic)

```typescript
import {
  getExplorerInfoFromTileOccupier,
  getStructureInfoFromTileOccupier,
  isTileOccupierStructure,
} from "@bibliothecadao/eternum";

// Get troop info from tile occupier type
const explorerInfo = getExplorerInfoFromTileOccupier(tile.occupier_type);
// Returns: { troopType: TroopType, tier: number, isDaydreamsAgent: boolean } | null

// Get structure info from tile occupier type
const structureInfo = getStructureInfoFromTileOccupier(tile.occupier_type);
// Returns: { type: StructureType, stage: number, level: number, isWonder: boolean } | null

// Check if occupier is a structure
const isStructure = isTileOccupierStructure(tile.occupier_type);
// Returns: boolean
```

### @bibliothecadao/types (Type Definitions)

```typescript
import {
  BiomeIdToType,
  BiomeType,
  HexPosition,
  StructureType,
  TileOccupier,
} from "@bibliothecadao/types";

// Convert biome ID to biome type enum
const biomeType = BiomeIdToType[tile.biome]; // BiomeType.Grassland, etc.

// Type for hex coordinates
interface HexPosition {
  col: number;
  row: number;
}

// Tile occupier enum values
enum TileOccupier {
  None = 0,
  // Structures (1-99)
  Realm = 1,
  Village = 2,
  Hyperstructure = 3,
  FragmentMine = 4,
  // Explorers (100+) encoded as: 100 + troopType * 10 + tier
  // Events
  Quest = 200,
  Chest = 201,
}
```

### @bibliothecadao/torii (Data Fetching)

```typescript
import { SqlApi } from "@bibliothecadao/torii";

// Initialize SQL API
const sqlApi = new SqlApi(
  "https://api.cartridge.gg/x/eternum-sepolia/torii/sql",
  "https://cache-server-url" // Optional cache
);

// Fetch all tiles
const tiles = await sqlApi.fetchAllTiles();
// Returns: Tile[]

// Fetch tiles by coordinates
const specificTiles = await sqlApi.fetchTilesByCoords([
  { col: 100, row: 200 },
  { col: 101, row: 200 },
]);
```

### Tile Data Decoding

Tiles are stored as packed bigints. Use the decoder:

```typescript
import { tileDataToTile } from "@bibliothecadao/types";

// Decode packed tile data
const tile = tileDataToTile(packedBigInt);
// Returns: {
//   col: number,
//   row: number,
//   biome: number,
//   occupier_id: number,
//   occupier_type: number,
//   occupier_is_structure: boolean,
//   reward_extracted: boolean,
//   alt: boolean,
// }
```

**Bit packing layout:**
| Bits | Field |
|------|-------|
| 0 | `occupier_is_structure` |
| 1-8 | `occupier_type` |
| 9-40 | `occupier_id` |
| 41-48 | `biome` |
| 49-80 | `row` |
| 81-112 | `col` |
| 113 | `reward_extracted` |
| 127 | `alt` |

## Resources

- [Torii Documentation](https://book.dojoengine.org/toolchain/torii)
- [Dojo Framework](https://dojoengine.org)
- [Eternum Game Client](https://github.com/BibliothecaDAO/eternum)
