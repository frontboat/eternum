# Snapshot & Replay Feature Design

## Overview

Add snapshot recording and replay capabilities to vite-map, enabling time-series capture of game state for analytics and visualization of game evolution (structure changes, troop movement, etc.).

## Goals

1. Record complete game state every 60 seconds to local JSON files
2. Replay recorded snapshots through the existing map visualization
3. Support seamless switching between live and replay modes

## Data Format

Snapshots store data in the exact shape `useTileData` returns, enabling direct replay without transformation:

```json
{
  "meta": {
    "timestamp": "2026-01-23T12:34:56.789Z",
    "worldName": "eternum-mainnet",
    "toriiUrl": "https://api.cartridge.gg/x/eternum-mainnet/torii"
  },
  "tiles": [...],
  "resources": { "entity_id": { "entity_id": "...", "balances": {...}, "producing_resource_types": [...] }, ... },
  "explorers": { "explorer_id": { ... }, ... },
  "structures": { "entity_id": { ... }, ... },
  "quests": { "quest_id": { ... }, ... }
}
```

**Notes:**
- Maps serialized as plain objects (keyed by entity ID)
- `bigint` fields converted to strings for JSON compatibility
- Filename format: `{ISO-timestamp}.json` (e.g., `2026-01-23T12-34-56-789Z.json`)

## UI Design

### Mode Toggle

Two modes:
1. **Live Mode** (default) - Fetches from Torii, auto-refreshes every 60s
2. **Replay Mode** - Loads snapshots from folder, provides playback controls

### Recording Controls (Live Mode)

- "Select Folder" button - Opens folder picker via File System Access API
- "Record" toggle - Starts/stops snapshot capture
- Recording indicator (red dot) when active
- Snapshot count display

### Playback Controls (Replay Mode)

- "Load Snapshots" button - Select folder containing snapshot files
- Timeline scrubber showing all snapshots chronologically
- Play/Pause button for auto-advance
- Playback speed control (1x, 2x, 5x)
- Step forward/backward buttons
- "Go Live" button to return to live mode

## Architecture

### New Files

```
src/lib/snapshot.ts           - Save/load utilities, serialization
src/components/playback-controls.tsx  - Timeline, play/pause, speed
```

### Modified Files

```
src/App.tsx                   - Mode toggle, playback integration
src/components/eternum-hex-layer.tsx  - External data source support
```

### Data Flow

```
Live Mode:
  Torii API → useTileData() → EternumHexLayer/TileInfoPanel
                    ↓
              snapshot.ts → File System

Replay Mode:
  JSON Files → snapshot.ts → useTileData() → EternumHexLayer/TileInfoPanel
```

## File System Access API

Using the File System Access API (Chrome/Edge) for:
- Auto-saving snapshots without download prompts
- Loading all snapshots from a folder for replay

**Fallback:** Firefox/Safari users would need manual download/upload.

## Implementation Steps

1. Create `snapshot.ts` with serialization utilities
   - `serializeSnapshot()` - Convert Maps to objects, bigints to strings
   - `deserializeSnapshot()` - Restore Maps and bigints
   - `saveSnapshot()` - Write to file system
   - `loadSnapshots()` - Read all snapshots from folder

2. Create `playback-controls.tsx`
   - Timeline component showing snapshot timestamps
   - Play/Pause with configurable speed
   - Step forward/backward controls

3. Modify `App.tsx`
   - Add mode state (live/replay)
   - Integrate folder selection for recording
   - Integrate folder selection for replay
   - Add recording logic on refresh interval

4. Modify `useTileData` hook
   - Accept optional external data source
   - Support both live fetch and snapshot injection

5. Style and polish
   - Recording indicator
   - Playback UI styling
   - Mode transition animations
