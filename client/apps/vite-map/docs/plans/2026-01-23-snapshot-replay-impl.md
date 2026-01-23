# Snapshot & Replay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add snapshot recording and replay capabilities to vite-map for time-series game state capture and visualization.

**Architecture:** Two modes (Live/Replay) controlled by App state. Snapshots stored as JSON via File System Access API. Data flows through `useTileData` regardless of source. Playback controls manage timeline navigation.

**Tech Stack:** React 19, TypeScript, File System Access API, MapLibre GL

---

## Task 1: Create Snapshot Serialization Utilities

**Files:**
- Create: `src/lib/snapshot.ts`

**Step 1: Create the snapshot types and serialization functions**

```typescript
// src/lib/snapshot.ts
import type {
  MinimapTile,
  ResourceBalances,
  ExplorerInfo,
  StructureInfo,
  QuestInfo,
} from "./torii-api";

export interface SnapshotMeta {
  timestamp: string;
  worldName: string;
  toriiUrl: string;
}

export interface Snapshot {
  meta: SnapshotMeta;
  tiles: MinimapTile[];
  resources: Record<string, ResourceBalances>;
  explorers: Record<string, ExplorerInfo>;
  structures: Record<string, StructureInfo>;
  quests: Record<string, QuestInfo>;
}

export interface GameData {
  tiles: MinimapTile[];
  resources: Map<string, ResourceBalances>;
  explorers: Map<string, ExplorerInfo>;
  structures: Map<string, StructureInfo>;
  quests: Map<string, QuestInfo>;
}

/**
 * Convert bigint values to strings for JSON serialization.
 * Recursively handles nested objects and arrays.
 */
function serializeBigInts(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "bigint") return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInts(value);
    }
    return result;
  }
  return obj;
}

/**
 * Convert string bigints back to bigint type.
 * Handles known bigint fields in StructureInfo.guards
 */
function deserializeBigInts(obj: unknown, path: string[] = []): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map((item, i) => deserializeBigInts(item, [...path, String(i)]));
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const newPath = [...path, key];
      // Known bigint fields in GuardTroop
      const bigintFields = ["count", "stamina_amount", "stamina_updated_tick", "destroyed_tick"];
      if (bigintFields.includes(key) && typeof value === "string") {
        result[key] = BigInt(value);
      } else {
        result[key] = deserializeBigInts(value, newPath);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Create a snapshot from current game data.
 */
export function createSnapshot(
  data: GameData,
  meta: SnapshotMeta
): Snapshot {
  return {
    meta,
    tiles: data.tiles,
    resources: Object.fromEntries(data.resources),
    explorers: Object.fromEntries(data.explorers),
    structures: serializeBigInts(Object.fromEntries(data.structures)) as Record<string, StructureInfo>,
    quests: Object.fromEntries(data.quests),
  };
}

/**
 * Restore game data from a snapshot.
 */
export function restoreFromSnapshot(snapshot: Snapshot): GameData {
  const structures = deserializeBigInts(snapshot.structures) as Record<string, StructureInfo>;
  return {
    tiles: snapshot.tiles,
    resources: new Map(Object.entries(snapshot.resources)),
    explorers: new Map(Object.entries(snapshot.explorers)),
    structures: new Map(Object.entries(structures)),
    quests: new Map(Object.entries(snapshot.quests)),
  };
}

/**
 * Generate a filename for a snapshot.
 */
export function generateSnapshotFilename(timestamp: Date): string {
  return timestamp.toISOString().replace(/[:.]/g, "-") + ".json";
}

/**
 * Parse timestamp from snapshot filename.
 */
export function parseSnapshotFilename(filename: string): Date | null {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/);
  if (!match) return null;
  const isoString = match[1].replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ":$1:$2.$3Z");
  return new Date(isoString);
}
```

**Step 2: Verify the file compiles**

Run: `cd client/apps/vite-map && npx tsc --noEmit src/lib/snapshot.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/snapshot.ts
git commit -m "feat(vite-map): add snapshot serialization utilities"
```

---

## Task 2: Create File System Access Utilities

**Files:**
- Modify: `src/lib/snapshot.ts`

**Step 1: Add File System Access API functions**

Append to `src/lib/snapshot.ts`:

```typescript
/**
 * File System Access API types
 */
type FileSystemDirectoryHandle = globalThis.FileSystemDirectoryHandle;

/**
 * Check if File System Access API is supported.
 */
export function isFileSystemAccessSupported(): boolean {
  return "showDirectoryPicker" in window;
}

/**
 * Request a directory handle from the user.
 */
export async function selectDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    console.warn("File System Access API not supported");
    return null;
  }
  try {
    return await window.showDirectoryPicker({ mode: "readwrite" });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return null; // User cancelled
    }
    throw err;
  }
}

/**
 * Save a snapshot to a directory.
 */
export async function saveSnapshotToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  snapshot: Snapshot
): Promise<string> {
  const filename = generateSnapshotFilename(new Date(snapshot.meta.timestamp));
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(snapshot, null, 2));
  await writable.close();
  return filename;
}

/**
 * Load all snapshots from a directory.
 */
export async function loadSnapshotsFromDirectory(
  dirHandle: FileSystemDirectoryHandle
): Promise<Snapshot[]> {
  const snapshots: Snapshot[] = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file" && entry.name.endsWith(".json")) {
      try {
        const file = await entry.getFile();
        const text = await file.text();
        const snapshot = JSON.parse(text) as Snapshot;
        snapshots.push(snapshot);
      } catch (err) {
        console.warn(`Failed to load snapshot ${entry.name}:`, err);
      }
    }
  }

  // Sort by timestamp
  snapshots.sort((a, b) =>
    new Date(a.meta.timestamp).getTime() - new Date(b.meta.timestamp).getTime()
  );

  return snapshots;
}
```

**Step 2: Verify the file compiles**

Run: `cd client/apps/vite-map && npx tsc --noEmit src/lib/snapshot.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/snapshot.ts
git commit -m "feat(vite-map): add file system access utilities for snapshots"
```

---

## Task 3: Create useSnapshotRecorder Hook

**Files:**
- Create: `src/hooks/use-snapshot-recorder.ts`

**Step 1: Create the recording hook**

```typescript
// src/hooks/use-snapshot-recorder.ts
import { useState, useCallback, useRef } from "react";
import {
  createSnapshot,
  saveSnapshotToDirectory,
  selectDirectory,
  isFileSystemAccessSupported,
  type GameData,
  type SnapshotMeta,
} from "@/lib/snapshot";

type FileSystemDirectoryHandle = globalThis.FileSystemDirectoryHandle;

export interface UseSnapshotRecorderReturn {
  isRecording: boolean;
  snapshotCount: number;
  directoryName: string | null;
  isSupported: boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  recordSnapshot: (data: GameData, meta: Omit<SnapshotMeta, "timestamp">) => Promise<void>;
}

export function useSnapshotRecorder(): UseSnapshotRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const startRecording = useCallback(async (): Promise<boolean> => {
    const handle = await selectDirectory();
    if (!handle) return false;

    dirHandleRef.current = handle;
    setDirectoryName(handle.name);
    setSnapshotCount(0);
    setIsRecording(true);
    return true;
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    dirHandleRef.current = null;
  }, []);

  const recordSnapshot = useCallback(async (
    data: GameData,
    meta: Omit<SnapshotMeta, "timestamp">
  ): Promise<void> => {
    if (!isRecording || !dirHandleRef.current) return;

    const snapshot = createSnapshot(data, {
      ...meta,
      timestamp: new Date().toISOString(),
    });

    await saveSnapshotToDirectory(dirHandleRef.current, snapshot);
    setSnapshotCount((c) => c + 1);
  }, [isRecording]);

  return {
    isRecording,
    snapshotCount,
    directoryName,
    isSupported: isFileSystemAccessSupported(),
    startRecording,
    stopRecording,
    recordSnapshot,
  };
}
```

**Step 2: Verify the file compiles**

Run: `cd client/apps/vite-map && npx tsc --noEmit src/hooks/use-snapshot-recorder.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/use-snapshot-recorder.ts
git commit -m "feat(vite-map): add useSnapshotRecorder hook"
```

---

## Task 4: Create useSnapshotPlayer Hook

**Files:**
- Create: `src/hooks/use-snapshot-player.ts`

**Step 1: Create the playback hook**

```typescript
// src/hooks/use-snapshot-player.ts
import { useState, useCallback, useRef, useEffect } from "react";
import {
  loadSnapshotsFromDirectory,
  selectDirectory,
  restoreFromSnapshot,
  type Snapshot,
  type GameData,
} from "@/lib/snapshot";

export type PlaybackSpeed = 1 | 2 | 5 | 10;

export interface UseSnapshotPlayerReturn {
  isPlaying: boolean;
  isLoaded: boolean;
  snapshots: Snapshot[];
  currentIndex: number;
  currentData: GameData | null;
  playbackSpeed: PlaybackSpeed;
  loadSnapshots: () => Promise<boolean>;
  unloadSnapshots: () => void;
  play: () => void;
  pause: () => void;
  setIndex: (index: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
}

const BASE_INTERVAL = 1000; // 1 second between snapshots at 1x speed

export function useSnapshotPlayer(): UseSnapshotPlayerReturn {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const intervalRef = useRef<number | null>(null);

  const isLoaded = snapshots.length > 0;

  const currentData = isLoaded
    ? restoreFromSnapshot(snapshots[currentIndex])
    : null;

  const loadSnapshots = useCallback(async (): Promise<boolean> => {
    const handle = await selectDirectory();
    if (!handle) return false;

    const loaded = await loadSnapshotsFromDirectory(handle);
    if (loaded.length === 0) {
      console.warn("No snapshots found in directory");
      return false;
    }

    setSnapshots(loaded);
    setCurrentIndex(0);
    setIsPlaying(false);
    return true;
  }, []);

  const unloadSnapshots = useCallback(() => {
    setSnapshots([]);
    setCurrentIndex(0);
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (!isLoaded) return;
    setIsPlaying(true);
  }, [isLoaded]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const setIndex = useCallback((index: number) => {
    if (index >= 0 && index < snapshots.length) {
      setCurrentIndex(index);
    }
  }, [snapshots.length]);

  const stepForward = useCallback(() => {
    setCurrentIndex((i) => Math.min(i + 1, snapshots.length - 1));
  }, [snapshots.length]);

  const stepBackward = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Auto-advance when playing
  useEffect(() => {
    if (isPlaying && isLoaded) {
      intervalRef.current = window.setInterval(() => {
        setCurrentIndex((i) => {
          if (i >= snapshots.length - 1) {
            setIsPlaying(false);
            return i;
          }
          return i + 1;
        });
      }, BASE_INTERVAL / playbackSpeed);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, isLoaded, playbackSpeed, snapshots.length]);

  return {
    isPlaying,
    isLoaded,
    snapshots,
    currentIndex,
    currentData,
    playbackSpeed,
    loadSnapshots,
    unloadSnapshots,
    play,
    pause,
    setIndex,
    stepForward,
    stepBackward,
    setPlaybackSpeed,
  };
}
```

**Step 2: Verify the file compiles**

Run: `cd client/apps/vite-map && npx tsc --noEmit src/hooks/use-snapshot-player.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/hooks/use-snapshot-player.ts
git commit -m "feat(vite-map): add useSnapshotPlayer hook"
```

---

## Task 5: Create PlaybackControls Component

**Files:**
- Create: `src/components/playback-controls.tsx`

**Step 1: Create the playback controls UI**

```typescript
// src/components/playback-controls.tsx
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
} from "lucide-react";
import type { PlaybackSpeed } from "@/hooks/use-snapshot-player";
import type { Snapshot } from "@/lib/snapshot";

interface PlaybackControlsProps {
  snapshots: Snapshot[];
  currentIndex: number;
  isPlaying: boolean;
  playbackSpeed: PlaybackSpeed;
  onPlay: () => void;
  onPause: () => void;
  onSetIndex: (index: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onSetSpeed: (speed: PlaybackSpeed) => void;
  onExit: () => void;
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 5, 10];

export function PlaybackControls({
  snapshots,
  currentIndex,
  isPlaying,
  playbackSpeed,
  onPlay,
  onPause,
  onSetIndex,
  onStepForward,
  onStepBackward,
  onSetSpeed,
  onExit,
}: PlaybackControlsProps) {
  const currentSnapshot = snapshots[currentIndex];
  const timestamp = currentSnapshot
    ? new Date(currentSnapshot.meta.timestamp).toLocaleString()
    : "";

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 rounded-md border border-border bg-background/95 p-3 shadow-md backdrop-blur-sm">
      {/* Timeline */}
      <div className="mb-3">
        <input
          type="range"
          min={0}
          max={snapshots.length - 1}
          value={currentIndex}
          onChange={(e) => onSetIndex(Number(e.target.value))}
          className="w-64 h-2 bg-accent rounded-lg appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>
            {currentIndex + 1} / {snapshots.length}
          </span>
          <span>{timestamp}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={onStepBackward}
          disabled={currentIndex === 0}
          className="p-1.5 rounded hover:bg-accent transition-colors disabled:opacity-30"
          title="Step backward"
        >
          <SkipBack className="size-4" />
        </button>

        <button
          onClick={isPlaying ? onPause : onPlay}
          className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>

        <button
          onClick={onStepForward}
          disabled={currentIndex === snapshots.length - 1}
          className="p-1.5 rounded hover:bg-accent transition-colors disabled:opacity-30"
          title="Step forward"
        >
          <SkipForward className="size-4" />
        </button>

        {/* Speed selector */}
        <div className="ml-3 flex items-center gap-1">
          {SPEEDS.map((speed) => (
            <button
              key={speed}
              onClick={() => onSetSpeed(speed)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                playbackSpeed === speed
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              }`}
            >
              {speed}x
            </button>
          ))}
        </div>

        {/* Exit button */}
        <button
          onClick={onExit}
          className="ml-3 p-1.5 rounded hover:bg-destructive/20 text-destructive transition-colors"
          title="Exit replay mode"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Verify the file compiles**

Run: `cd client/apps/vite-map && npx tsc --noEmit src/components/playback-controls.tsx`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/playback-controls.tsx
git commit -m "feat(vite-map): add PlaybackControls component"
```

---

## Task 6: Create RecordingControls Component

**Files:**
- Create: `src/components/recording-controls.tsx`

**Step 1: Create the recording controls UI**

```typescript
// src/components/recording-controls.tsx
import { Circle, Square, FolderOpen, Play } from "lucide-react";

interface RecordingControlsProps {
  isRecording: boolean;
  isSupported: boolean;
  snapshotCount: number;
  directoryName: string | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onLoadSnapshots: () => void;
}

export function RecordingControls({
  isRecording,
  isSupported,
  snapshotCount,
  directoryName,
  onStartRecording,
  onStopRecording,
  onLoadSnapshots,
}: RecordingControlsProps) {
  if (!isSupported) {
    return (
      <div className="text-[10px] text-muted-foreground mt-2 pt-2 border-t">
        Recording requires Chrome or Edge
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t space-y-2">
      {isRecording ? (
        <>
          <div className="flex items-center gap-2 text-xs">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span>Recording to {directoryName}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {snapshotCount} snapshot{snapshotCount !== 1 ? "s" : ""} saved
          </div>
          <button
            onClick={onStopRecording}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors w-full justify-center"
          >
            <Square className="size-3" />
            Stop Recording
          </button>
        </>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onStartRecording}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors flex-1 justify-center"
          >
            <Circle className="size-3 fill-current" />
            Record
          </button>
          <button
            onClick={onLoadSnapshots}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-accent hover:bg-accent/80 transition-colors flex-1 justify-center"
          >
            <Play className="size-3" />
            Replay
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify the file compiles**

Run: `cd client/apps/vite-map && npx tsc --noEmit src/components/recording-controls.tsx`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/recording-controls.tsx
git commit -m "feat(vite-map): add RecordingControls component"
```

---

## Task 7: Integrate Recording into App.tsx

**Files:**
- Modify: `src/App.tsx`

**Step 1: Add recording hook and controls to MapView**

Update imports at the top of `src/App.tsx`:

```typescript
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  Map,
  MapControls,
  useMap,
  MapDrawControl,
  MapDrawModes,
  MapDrawToolbar,
  MapDrawPoint,
  MapDrawLine,
  MapDrawPolygon,
  MapDrawRectangle,
  MapDrawCircle,
  MapDrawFreehand,
  MapDrawSelect,
  MapDrawDelete,
  MapDrawDownload,
  MapDrawImport,
  MapDrawMapManager,
} from "@/components/ui/map";
import {
  EternumHexLayer,
  TileInfoPanel,
  useTileData,
} from "@/components/eternum-hex-layer";
import { GameSelector } from "@/components/game-selector";
import { PlaybackControls } from "@/components/playback-controls";
import { RecordingControls } from "@/components/recording-controls";
import { useSnapshotRecorder } from "@/hooks/use-snapshot-recorder";
import { useSnapshotPlayer } from "@/hooks/use-snapshot-player";
import { calculateTileCenter, calculateTileBounds } from "@/lib/eternum-coords";
import type { MinimapTile } from "@/lib/torii-api";
import type { FactoryWorld } from "@/lib/factory-api";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import type { StyleSpecification } from "maplibre-gl";
```

**Step 2: Update MapView function with recording and replay logic**

Replace the entire `MapView` function with:

```typescript
function MapView({ game, onBack }: MapViewProps) {
  // Live data
  const liveData = useTileData(game.toriiUrl);
  const { tiles: liveTiles, resources: liveResources, explorers: liveExplorers, structures: liveStructures, quests: liveQuests, loading, error, loadTiles } = liveData;

  // Recording
  const recorder = useSnapshotRecorder();

  // Playback
  const player = useSnapshotPlayer();

  // Determine which data to display
  const isReplayMode = player.isLoaded;
  const displayData = isReplayMode && player.currentData
    ? player.currentData
    : { tiles: liveTiles, resources: liveResources, explorers: liveExplorers, structures: liveStructures, quests: liveQuests };

  const { tiles, resources, explorers, structures, quests } = displayData;

  const [hoveredTile, setHoveredTile] = useState<MinimapTile | null>(null);
  const [selectedTile, setSelectedTile] = useState<MinimapTile | null>(null);

  // Load tiles on mount
  useEffect(() => {
    loadTiles();
  }, [loadTiles]);

  // Auto-refresh tiles periodically (only in live mode)
  useEffect(() => {
    if (isReplayMode) return;

    const interval = setInterval(async () => {
      await loadTiles();

      // Record snapshot if recording
      if (recorder.isRecording) {
        await recorder.recordSnapshot(
          { tiles: liveTiles, resources: liveResources, explorers: liveExplorers, structures: liveStructures, quests: liveQuests },
          { worldName: game.name, toriiUrl: game.toriiUrl }
        );
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [loadTiles, isReplayMode, recorder, liveTiles, liveResources, liveExplorers, liveStructures, liveQuests, game.name, game.toriiUrl]);

  // Record initial snapshot when recording starts
  useEffect(() => {
    if (recorder.isRecording && recorder.snapshotCount === 0 && liveTiles.length > 0) {
      recorder.recordSnapshot(
        { tiles: liveTiles, resources: liveResources, explorers: liveExplorers, structures: liveStructures, quests: liveQuests },
        { worldName: game.name, toriiUrl: game.toriiUrl }
      );
    }
  }, [recorder, liveTiles, liveResources, liveExplorers, liveStructures, liveQuests, game.name, game.toriiUrl]);

  // Calculate coordinate center and map center from tiles
  const coordConfig = useMemo(() => {
    if (tiles.length === 0) return { centerCol: 2147483646, centerRow: 2147483646 };
    return calculateTileCenter(tiles);
  }, [tiles]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (tiles.length === 0) return [0, 0];
    const bounds = calculateTileBounds(tiles, coordConfig);
    return [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2];
  }, [tiles, coordConfig]);

  const handleTileClick = useCallback((tile: MinimapTile) => {
    setSelectedTile(tile);
  }, []);

  const handleTileHover = useCallback((tile: MinimapTile | null) => {
    setHoveredTile(tile);
  }, []);

  const handleRefresh = useCallback(() => {
    loadTiles();
  }, [loadTiles]);

  const handleStartRecording = useCallback(async () => {
    const started = await recorder.startRecording();
    if (started && liveTiles.length > 0) {
      // Record immediately
      await recorder.recordSnapshot(
        { tiles: liveTiles, resources: liveResources, explorers: liveExplorers, structures: liveStructures, quests: liveQuests },
        { worldName: game.name, toriiUrl: game.toriiUrl }
      );
    }
  }, [recorder, liveTiles, liveResources, liveExplorers, liveStructures, liveQuests, game.name, game.toriiUrl]);

  const handleLoadSnapshots = useCallback(async () => {
    await player.loadSnapshots();
  }, [player]);

  const handleExitReplay = useCallback(() => {
    player.unloadSnapshots();
  }, [player]);

  // Loading state
  if (loading && tiles.length === 0) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            Loading tiles for {game.name}...
          </div>
          <button
            onClick={onBack}
            className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Back to world selection
          </button>
        </div>
      </div>
    );
  }

  // Error state
  if (error && tiles.length === 0) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <div className="text-destructive font-medium">Failed to load tiles</div>
          <div className="text-sm text-muted-foreground max-w-md">{error}</div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleRefresh}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-md border text-sm hover:bg-accent transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-dvh w-screen">
      <Map
        center={mapCenter}
        zoom={10}
        minZoom={2}
        maxZoom={20}
        styles={{ dark: BLANK_STYLE, light: BLANK_STYLE }}
      >
        <MapControls showZoom showFullscreen />

        {/* Drawing controls */}
        <MapDrawControl position="bottom-right">
          <MapDrawModes>
            <MapDrawSelect />
            <MapDrawPoint />
            <MapDrawLine />
            <MapDrawPolygon />
            <MapDrawDelete />
          </MapDrawModes>
          <MapDrawToolbar>
            <MapDrawRectangle />
            <MapDrawCircle />
            <MapDrawFreehand />
            <MapDrawDownload />
            <MapDrawImport />
          </MapDrawToolbar>
          <MapDrawModes>
            <MapDrawMapManager />
          </MapDrawModes>
        </MapDrawControl>

        <EternumHexLayer
          tiles={tiles}
          onTileClick={handleTileClick}
          onTileHover={handleTileHover}
        />
        <MapFitter tiles={tiles} coordConfig={coordConfig} />

        {/* Tile info panel */}
        <TileInfoPanel
          tile={hoveredTile || selectedTile}
          tileCenter={coordConfig}
          resources={resources}
          explorers={explorers}
          structures={structures}
          quests={quests}
        />

        {/* Stats panel */}
        <div className="absolute top-4 left-4 z-10 rounded-md border border-border bg-background/95 p-3 shadow-md backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className="p-1 rounded hover:bg-accent transition-colors"
              title="Back to world selection"
            >
              <ArrowLeft className="size-4" />
            </button>
            <div>
              <div className="text-sm font-medium">
                {isReplayMode ? `${game.name} (Replay)` : game.name}
              </div>
              <div className="text-[10px] text-muted-foreground uppercase">
                {game.chain}
              </div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
            <div>{tiles.length.toLocaleString()} tiles loaded</div>
            <div>{structures.size.toLocaleString()} structures</div>
            <div>{explorers.size.toLocaleString()} explorers</div>
            <div>{quests.size.toLocaleString()} quests</div>
            <div>{resources.size.toLocaleString()} entities with resources</div>
            {loading && !isReplayMode && (
              <div className="flex items-center gap-1 mt-1">
                <Loader2 className="size-3 animate-spin" />
                <span>Refreshing...</span>
              </div>
            )}
          </div>

          {!isReplayMode && (
            <>
              <button
                onClick={handleRefresh}
                disabled={loading || recorder.isRecording}
                className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-accent hover:bg-accent/80 transition-colors disabled:opacity-50 w-full justify-center"
              >
                <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>

              <RecordingControls
                isRecording={recorder.isRecording}
                isSupported={recorder.isSupported}
                snapshotCount={recorder.snapshotCount}
                directoryName={recorder.directoryName}
                onStartRecording={handleStartRecording}
                onStopRecording={recorder.stopRecording}
                onLoadSnapshots={handleLoadSnapshots}
              />
            </>
          )}
        </div>

        {/* Playback controls (only in replay mode) */}
        {isReplayMode && (
          <PlaybackControls
            snapshots={player.snapshots}
            currentIndex={player.currentIndex}
            isPlaying={player.isPlaying}
            playbackSpeed={player.playbackSpeed}
            onPlay={player.play}
            onPause={player.pause}
            onSetIndex={player.setIndex}
            onStepForward={player.stepForward}
            onStepBackward={player.stepBackward}
            onSetSpeed={player.setPlaybackSpeed}
            onExit={handleExitReplay}
          />
        )}
      </Map>
    </div>
  );
}
```

**Step 3: Verify the app compiles**

Run: `cd client/apps/vite-map && npx tsc --noEmit`
Expected: No errors

**Step 4: Test manually**

Run: `cd client/apps/vite-map && bun run dev`
Expected:
- App loads and shows game selector
- After selecting a game, map shows with tiles
- Record and Replay buttons appear in stats panel
- Clicking Record prompts for folder selection
- After selecting folder, recording indicator shows
- Clicking Replay prompts for folder selection
- After loading snapshots, playback controls appear

**Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(vite-map): integrate snapshot recording and replay into MapView"
```

---

## Task 8: Create hooks index file

**Files:**
- Create: `src/hooks/index.ts`

**Step 1: Create index export**

```typescript
// src/hooks/index.ts
export { useSnapshotRecorder } from "./use-snapshot-recorder";
export { useSnapshotPlayer } from "./use-snapshot-player";
export type { UseSnapshotRecorderReturn } from "./use-snapshot-recorder";
export type { UseSnapshotPlayerReturn, PlaybackSpeed } from "./use-snapshot-player";
```

**Step 2: Commit**

```bash
git add src/hooks/index.ts
git commit -m "chore(vite-map): add hooks index export"
```

---

## Task 9: Final Integration Test

**Step 1: Start the dev server**

Run: `cd client/apps/vite-map && bun run dev`

**Step 2: Manual testing checklist**

1. [ ] Select a game world
2. [ ] Verify tiles load on map
3. [ ] Click "Record" button
4. [ ] Select a folder for snapshots
5. [ ] Verify red recording indicator appears
6. [ ] Wait 60 seconds for auto-refresh
7. [ ] Verify snapshot count increases
8. [ ] Click "Stop Recording"
9. [ ] Click "Replay" button
10. [ ] Select the same folder
11. [ ] Verify playback controls appear
12. [ ] Click Play and verify auto-advance
13. [ ] Use timeline scrubber
14. [ ] Test step forward/backward
15. [ ] Test speed controls (1x, 2x, 5x, 10x)
16. [ ] Click X to exit replay mode
17. [ ] Verify returns to live mode

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(vite-map): complete snapshot recording and replay feature"
```
