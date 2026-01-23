import { useState, useCallback, useRef, useEffect } from "react";
import {
  loadSnapshotsFromDirectory,
  selectDirectory,
  restoreFromSnapshot,
} from "@/lib/snapshot";
import type { Snapshot, GameData } from "@/lib/snapshot";

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

const BASE_INTERVAL = 1000;

export function useSnapshotPlayer(): UseSnapshotPlayerReturn {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeedState] = useState<PlaybackSpeed>(1);
  const intervalRef = useRef<number | null>(null);

  const isLoaded = snapshots.length > 0;

  const currentData: GameData | null =
    isLoaded && snapshots[currentIndex]
      ? restoreFromSnapshot(snapshots[currentIndex])
      : null;

  const loadSnapshots = useCallback(async (): Promise<boolean> => {
    const directoryHandle = await selectDirectory();
    if (!directoryHandle) {
      return false;
    }

    const loadedSnapshots = await loadSnapshotsFromDirectory(directoryHandle);
    const sortedSnapshots = loadedSnapshots.sort(
      (a, b) =>
        new Date(a.meta.timestamp).getTime() -
        new Date(b.meta.timestamp).getTime()
    );

    setSnapshots(sortedSnapshots);
    setCurrentIndex(0);
    setIsPlaying(false);

    return sortedSnapshots.length > 0;
  }, []);

  const unloadSnapshots = useCallback(() => {
    setSnapshots([]);
    setCurrentIndex(0);
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const setIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < snapshots.length) {
        setCurrentIndex(index);
      }
    },
    [snapshots.length]
  );

  const stepForward = useCallback(() => {
    setCurrentIndex((prev) => Math.min(prev + 1, snapshots.length - 1));
  }, [snapshots.length]);

  const stepBackward = useCallback(() => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const setPlaybackSpeed = useCallback((speed: PlaybackSpeed) => {
    setPlaybackSpeedState(speed);
  }, []);

  useEffect(() => {
    if (isPlaying && isLoaded) {
      intervalRef.current = window.setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= snapshots.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, BASE_INTERVAL / playbackSpeed);
    }

    return () => {
      if (intervalRef.current !== null) {
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
