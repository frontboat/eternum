import type {
  MinimapTile,
  ResourceBalances,
  ExplorerInfo,
  StructureInfo,
  QuestInfo,
} from "./torii-api";

// ============================================================================
// File System Access API Type Declarations
// These are experimental APIs not yet in standard TypeScript DOM types
// ============================================================================

interface FSADirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  values(): AsyncIterableIterator<FSAHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<FSAFileHandle>;
}

interface FSAFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FSAWritableFileStream>;
}

interface FSAWritableFileStream {
  write(data: string | Blob | ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}

interface FSAHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
}

declare global {
  interface Window {
    showDirectoryPicker?: (
      options?: { mode?: "read" | "readwrite" }
    ) => Promise<FSADirectoryHandle>;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface SnapshotMeta {
  timestamp: string;
  worldName: string;
  toriiUrl: string;
}

export interface GameData {
  tiles: MinimapTile[];
  resources: Map<string, ResourceBalances>;
  explorers: Map<string, ExplorerInfo>;
  structures: Map<string, StructureInfo>;
  quests: Map<string, QuestInfo>;
}

export interface Snapshot {
  meta: SnapshotMeta;
  tiles: MinimapTile[];
  resources: Map<string, ResourceBalances>;
  explorers: Map<string, ExplorerInfo>;
  structures: Map<string, StructureInfo>;
  quests: Map<string, QuestInfo>;
}

// Known bigint fields that need special handling during deserialization
const BIGINT_FIELDS = new Set([
  "count",
  "stamina_amount",
  "stamina_updated_tick",
  "destroyed_tick",
]);

// ============================================================================
// Serialization Functions
// ============================================================================

/**
 * Recursively convert bigint values to strings for JSON serialization.
 */
export function serializeBigInts<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "bigint") {
    return obj.toString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => serializeBigInts(item)) as unknown as T;
  }

  if (obj instanceof Map) {
    const serialized = new Map();
    for (const [key, value] of obj) {
      serialized.set(key, serializeBigInts(value));
    }
    return serialized as unknown as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInts(value);
    }
    return result as T;
  }

  return obj;
}

/**
 * Recursively convert known bigint fields back from strings.
 * Handles fields: count, stamina_amount, stamina_updated_tick, destroyed_tick
 */
export function deserializeBigInts<T>(obj: T, parentKey?: string): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Check if this is a string that should be converted to bigint
  if (typeof obj === "string" && parentKey && BIGINT_FIELDS.has(parentKey)) {
    try {
      return BigInt(obj) as unknown as T;
    } catch {
      return obj;
    }
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => deserializeBigInts(item)) as unknown as T;
  }

  if (obj instanceof Map) {
    const deserialized = new Map();
    for (const [key, value] of obj) {
      deserialized.set(key, deserializeBigInts(value));
    }
    return deserialized as unknown as T;
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deserializeBigInts(value, key);
    }
    return result as T;
  }

  return obj;
}

/**
 * Create a snapshot from GameData with metadata.
 */
export function createSnapshot(data: GameData, meta: SnapshotMeta): Snapshot {
  return {
    meta,
    tiles: data.tiles,
    resources: data.resources,
    explorers: data.explorers,
    structures: data.structures,
    quests: data.quests,
  };
}

/**
 * Restore GameData from a snapshot.
 */
export function restoreFromSnapshot(snapshot: Snapshot): GameData {
  return {
    tiles: snapshot.tiles,
    resources: snapshot.resources,
    explorers: snapshot.explorers,
    structures: snapshot.structures,
    quests: snapshot.quests,
  };
}

// ============================================================================
// Filename Utilities
// ============================================================================

/**
 * Generate a snapshot filename from a timestamp.
 * Returns ISO timestamp with colons and dots replaced by dashes, plus .json extension.
 * Example: 2024-01-15T10-30-45-123Z.json
 */
export function generateSnapshotFilename(timestamp: Date): string {
  const iso = timestamp.toISOString();
  // Replace colons and dots with dashes for filesystem compatibility
  const safe = iso.replace(/:/g, "-").replace(/\./g, "-");
  return `${safe}.json`;
}

/**
 * Parse a Date from a snapshot filename.
 * Reverses the transformation done by generateSnapshotFilename.
 * Returns null if parsing fails.
 */
export function parseSnapshotFilename(filename: string): Date | null {
  // Remove .json extension
  const withoutExt = filename.replace(/\.json$/i, "");

  // Pattern: YYYY-MM-DDTHH-MM-SS-mmmZ
  // We need to convert back to: YYYY-MM-DDTHH:MM:SS.mmmZ
  const match = withoutExt.match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/
  );

  if (!match) {
    return null;
  }

  const [, date, hours, minutes, seconds, millis] = match;
  const isoString = `${date}T${hours}:${minutes}:${seconds}.${millis}Z`;

  try {
    const parsed = new Date(isoString);
    // Validate the date is valid
    if (isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// File System Access API Functions
// ============================================================================

/**
 * Check if the File System Access API is supported in this browser.
 */
export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "showDirectoryPicker" in window &&
    typeof window.showDirectoryPicker === "function"
  );
}

/**
 * Open a folder picker dialog and return the directory handle.
 * Returns null if the user cancels or the API is not supported.
 */
export async function selectDirectory(): Promise<FSADirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    console.warn("File System Access API is not supported in this browser");
    return null;
  }

  try {
    const dirHandle = await window.showDirectoryPicker!({
      mode: "readwrite",
    });
    return dirHandle;
  } catch (error) {
    // User cancelled the picker or permission denied
    if (error instanceof Error && error.name === "AbortError") {
      return null;
    }
    console.error("Error selecting directory:", error);
    return null;
  }
}

/**
 * Helper to convert Map to array for JSON serialization.
 */
function mapToArray<K, V>(map: Map<K, V>): [K, V][] {
  return Array.from(map.entries());
}

/**
 * Helper to convert array back to Map after JSON parsing.
 */
function arrayToMap<K, V>(arr: [K, V][]): Map<K, V> {
  return new Map(arr);
}

/**
 * Serialize a snapshot to JSON string, handling Maps and BigInts.
 */
function serializeSnapshot(snapshot: Snapshot): string {
  const serializable = {
    meta: snapshot.meta,
    tiles: snapshot.tiles,
    resources: mapToArray(serializeBigInts(snapshot.resources)),
    explorers: mapToArray(serializeBigInts(snapshot.explorers)),
    structures: mapToArray(serializeBigInts(snapshot.structures)),
    quests: mapToArray(serializeBigInts(snapshot.quests)),
  };
  return JSON.stringify(serializable, null, 2);
}

/**
 * Deserialize a JSON string back to a Snapshot, restoring Maps and BigInts.
 */
function deserializeSnapshot(json: string): Snapshot {
  const parsed = JSON.parse(json);
  return {
    meta: parsed.meta,
    tiles: parsed.tiles,
    resources: deserializeBigInts(arrayToMap(parsed.resources)),
    explorers: deserializeBigInts(arrayToMap(parsed.explorers)),
    structures: deserializeBigInts(arrayToMap(parsed.structures)),
    quests: deserializeBigInts(arrayToMap(parsed.quests)),
  };
}

/**
 * Save a snapshot to a directory as a JSON file.
 * The filename is generated from the snapshot's timestamp.
 */
export async function saveSnapshotToDirectory(
  dirHandle: FSADirectoryHandle,
  snapshot: Snapshot
): Promise<void> {
  const timestamp = new Date(snapshot.meta.timestamp);
  const filename = generateSnapshotFilename(timestamp);

  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();

  try {
    const json = serializeSnapshot(snapshot);
    await writable.write(json);
  } finally {
    await writable.close();
  }
}

/**
 * Load all snapshot JSON files from a directory.
 * Returns snapshots sorted by timestamp (oldest first).
 */
export async function loadSnapshotsFromDirectory(
  dirHandle: FSADirectoryHandle
): Promise<Snapshot[]> {
  const snapshots: Snapshot[] = [];

  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file" && entry.name.endsWith(".json")) {
      try {
        const fileHandle = await dirHandle.getFileHandle(entry.name);
        const file = await fileHandle.getFile();
        const json = await file.text();
        const snapshot = deserializeSnapshot(json);
        snapshots.push(snapshot);
      } catch (error) {
        console.warn(`Failed to load snapshot ${entry.name}:`, error);
      }
    }
  }

  // Sort by timestamp (oldest first)
  snapshots.sort((a, b) => {
    const timeA = new Date(a.meta.timestamp).getTime();
    const timeB = new Date(b.meta.timestamp).getTime();
    return timeA - timeB;
  });

  return snapshots;
}
