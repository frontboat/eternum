import { Play, Pause, SkipForward, SkipBack, X } from "lucide-react";
import type { Snapshot } from "@/lib/snapshot";
import { Button } from "@/components/ui/button";

export type PlaybackSpeed = 1 | 2 | 5 | 10;

export interface PlaybackControlsProps {
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

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString();
}

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
  const speeds: PlaybackSpeed[] = [1, 2, 5, 10];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/95 backdrop-blur rounded-md border shadow-md p-4 flex flex-col gap-3 min-w-[400px]">
      {/* Timeline */}
      <div className="flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={snapshots.length - 1}
          value={currentIndex}
          onChange={(e) => onSetIndex(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            {currentIndex + 1} / {snapshots.length}
          </span>
          {currentSnapshot && (
            <span>{formatTimestamp(currentSnapshot.meta.timestamp)}</span>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-center gap-2">
        {/* Step backward */}
        <Button
          variant="outline"
          size="icon"
          onClick={onStepBackward}
          disabled={currentIndex === 0}
        >
          <SkipBack className="size-4" />
        </Button>

        {/* Play/Pause */}
        <Button
          variant="default"
          size="icon"
          className="rounded-full"
          onClick={isPlaying ? onPause : onPlay}
        >
          {isPlaying ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>

        {/* Step forward */}
        <Button
          variant="outline"
          size="icon"
          onClick={onStepForward}
          disabled={currentIndex === snapshots.length - 1}
        >
          <SkipForward className="size-4" />
        </Button>

        {/* Speed buttons */}
        {speeds.map((speed) => (
          <Button
            key={speed}
            variant={playbackSpeed === speed ? "default" : "outline"}
            size="sm"
            onClick={() => onSetSpeed(speed)}
          >
            {speed}x
          </Button>
        ))}

        {/* Exit button */}
        <Button variant="destructive" size="icon" onClick={onExit}>
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}
