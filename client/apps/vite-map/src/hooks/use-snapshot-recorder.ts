import { useState, useCallback, useRef } from "react";
import {
  createSnapshot,
  saveSnapshotToDirectory,
  selectDirectory,
  isFileSystemAccessSupported,
  type GameData,
  type SnapshotMeta,
} from "@/lib/snapshot.ts";

// Re-declare the FSADirectoryHandle type for the ref
interface FSADirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
}

export interface UseSnapshotRecorderReturn {
  isRecording: boolean;
  snapshotCount: number;
  directoryName: string | null;
  isSupported: boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  recordSnapshot: (
    data: GameData,
    meta: Omit<SnapshotMeta, "timestamp">
  ) => Promise<void>;
}

export function useSnapshotRecorder(): UseSnapshotRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const [directoryName, setDirectoryName] = useState<string | null>(null);

  const directoryHandleRef = useRef<FSADirectoryHandle | null>(null);
  const isSupported = isFileSystemAccessSupported();

  const startRecording = useCallback(async (): Promise<boolean> => {
    const handle = await selectDirectory();
    if (!handle) {
      return false;
    }

    directoryHandleRef.current = handle;
    setDirectoryName(handle.name);
    setSnapshotCount(0);
    setIsRecording(true);
    return true;
  }, []);

  const stopRecording = useCallback((): void => {
    setIsRecording(false);
    directoryHandleRef.current = null;
  }, []);

  const recordSnapshot = useCallback(
    async (
      data: GameData,
      meta: Omit<SnapshotMeta, "timestamp">
    ): Promise<void> => {
      if (!isRecording || !directoryHandleRef.current) {
        return;
      }

      const fullMeta: SnapshotMeta = {
        ...meta,
        timestamp: new Date().toISOString(),
      };

      const snapshot = createSnapshot(data, fullMeta);
      await saveSnapshotToDirectory(
        directoryHandleRef.current as Parameters<
          typeof saveSnapshotToDirectory
        >[0],
        snapshot
      );
      setSnapshotCount((prev) => prev + 1);
    },
    [isRecording]
  );

  return {
    isRecording,
    snapshotCount,
    directoryName,
    isSupported,
    startRecording,
    stopRecording,
    recordSnapshot,
  };
}
