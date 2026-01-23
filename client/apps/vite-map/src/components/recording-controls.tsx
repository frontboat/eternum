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
      <div className="mt-2 border-t pt-2">
        <p className="text-sm text-muted-foreground">
          Recording requires Chrome or Edge
        </p>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div className="mt-2 border-t pt-2">
        <div className="flex items-center gap-2">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex size-3 rounded-full bg-red-500" />
          </span>
          <span className="text-sm">Recording to {directoryName}</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {snapshotCount} snapshot(s) saved
        </p>
        <button
          onClick={onStopRecording}
          className="mt-2 flex items-center gap-2 rounded-lg bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90"
        >
          <Square className="size-4" />
          Stop Recording
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 border-t pt-2">
      <div className="flex gap-2">
        <button
          onClick={onStartRecording}
          className="flex items-center gap-2 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600"
        >
          <Circle className="size-4 fill-current" />
          Record
        </button>
        <button
          onClick={onLoadSnapshots}
          className="flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent/80"
        >
          <Play className="size-4" />
          Replay
        </button>
      </div>
    </div>
  );
}
