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
import { calculateTileCenter, calculateTileBounds } from "@/lib/eternum-coords";
import type { MinimapTile } from "@/lib/torii-api";
import type { FactoryWorld } from "@/lib/factory-api";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import type { StyleSpecification } from "maplibre-gl";

// Refresh interval in milliseconds (60 seconds)
const REFRESH_INTERVAL = 60_000;

// Blank dark style for the map - no world basemap, just our tiles
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  name: "Eternum",
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#0a0a0a",
      },
    },
  ],
};

export function App() {
  const [selectedGame, setSelectedGame] = useState<FactoryWorld | null>(null);

  // Show game selector if no game selected
  if (!selectedGame) {
    return <GameSelector onSelectGame={setSelectedGame} />;
  }

  // Show map for selected game
  return (
    <MapView
      game={selectedGame}
      onBack={() => setSelectedGame(null)}
    />
  );
}

interface MapViewProps {
  game: FactoryWorld;
  onBack: () => void;
}

function MapView({ game, onBack }: MapViewProps) {
  const { tiles, resources, explorers, structures, quests, loading, error, loadTiles } = useTileData(game.toriiUrl);
  const [hoveredTile, setHoveredTile] = useState<MinimapTile | null>(null);
  const [selectedTile, setSelectedTile] = useState<MinimapTile | null>(null);

  // Load tiles on mount
  useEffect(() => {
    loadTiles();
  }, [loadTiles]);

  // Auto-refresh tiles periodically
  useEffect(() => {
    const interval = setInterval(loadTiles, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadTiles]);

  // Calculate coordinate center and map center from tiles
  const coordConfig = useMemo(() => {
    if (tiles.length === 0) return { centerCol: 2147483646, centerRow: 2147483646 };
    return calculateTileCenter(tiles);
  }, [tiles]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (tiles.length === 0) return [0, 0];
    const bounds = calculateTileBounds(tiles, coordConfig);
    // Return center as [lng, lat] for MapLibre
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
              <div className="text-sm font-medium">{game.name}</div>
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
            {loading && (
              <div className="flex items-center gap-1 mt-1">
                <Loader2 className="size-3 animate-spin" />
                <span>Refreshing...</span>
              </div>
            )}
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="mt-2 flex items-center gap-1.5 px-2 py-1 rounded text-xs bg-accent hover:bg-accent/80 transition-colors disabled:opacity-50 w-full justify-center"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </Map>
    </div>
  );
}

/**
 * Component that fits the map to tile bounds once tiles are loaded.
 */
interface MapFitterProps {
  tiles: MinimapTile[];
  coordConfig: { centerCol: number; centerRow: number };
}

function MapFitter({ tiles, coordConfig }: MapFitterProps) {
  const { map, isLoaded } = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (!isLoaded || !map || tiles.length === 0 || hasFitted.current) return;

    // Calculate bounds using the coord config
    const bounds = calculateTileBounds(tiles, coordConfig);

    // Log bounds for debugging
    console.log("[MapFitter] Tile bounds:", bounds);
    console.log("[MapFitter] Coord config:", coordConfig);
    console.log("[MapFitter] Sample tile:", tiles[0]);

    // Fit map to bounds with padding
    map.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      { padding: 50, duration: 1000 }
    );

    hasFitted.current = true;
  }, [isLoaded, map, tiles, coordConfig]);

  return null;
}

export default App;
