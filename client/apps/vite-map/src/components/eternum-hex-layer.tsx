import { useEffect, useMemo, useId, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useMap } from "./ui/map";
import {
  eternumToLatLng,
  hexCorners,
  calculateTileCenter,
  type CoordConfig,
} from "@/lib/eternum-coords";
import { getBiomeColor, type MinimapTile } from "@/lib/torii-api";

interface EternumHexLayerProps {
  tiles: MinimapTile[];
  onTileClick?: (tile: MinimapTile) => void;
  onTileHover?: (tile: MinimapTile | null) => void;
}

/**
 * MapLibre layer for rendering Eternum hex tiles as proper hexagon polygons.
 * Uses GeoJSON source with dynamic data updates.
 */
export function EternumHexLayer({
  tiles,
  onTileClick,
  onTileHover,
}: EternumHexLayerProps) {
  const { map, isLoaded } = useMap();
  const id = useId();
  const sourceId = `eternum-tiles-${id}`;
  const fillLayerId = `eternum-tiles-fill-${id}`;
  const outlineLayerId = `eternum-tiles-outline-${id}`;

  // Calculate the center from tile data for proper coordinate mapping
  const coordConfig = useMemo<CoordConfig>(() => {
    if (tiles.length === 0) {
      return { centerCol: 2147483646, centerRow: 2147483646 };
    }
    const config = calculateTileCenter(tiles);
    console.log("[EternumHexLayer] Calculated center:", config);
    console.log("[EternumHexLayer] Sample tile raw coords:", tiles[0]);
    return config;
  }, [tiles]);

  // Convert tiles to GeoJSON FeatureCollection with hexagon polygons
  const geojson = useMemo(() => {
    const features = tiles.map((tile) => {
      const [lat, lng] = eternumToLatLng(
        { col: tile.col, row: tile.row },
        coordConfig
      );
      const color = getBiomeColor(tile.biome);
      const corners = hexCorners(lat, lng);

      return {
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [corners],
        },
        properties: {
          col: tile.col,
          row: tile.row,
          biome: tile.biome ?? 0,
          color,
          occupier_id: tile.occupier_id ?? "",
          occupier_type: tile.occupier_type ?? 0,
          occupier_is_structure: tile.occupier_is_structure ?? false,
          // For display
          displayCol: tile.col - coordConfig.centerCol,
          displayRow: tile.row - coordConfig.centerRow,
          // Center point for tooltips
          centerLng: lng,
          centerLat: lat,
        },
      };
    });

    if (features.length > 0) {
      const sample = features[0];
      console.log("[EternumHexLayer] Sample feature:", {
        geometry: sample.geometry,
        properties: {
          displayCol: sample.properties.displayCol,
          displayRow: sample.properties.displayRow,
        },
      });
    }

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [tiles, coordConfig]);

  // Initialize source and layers
  useEffect(() => {
    if (!isLoaded || !map) return;

    // Add GeoJSON source
    map.addSource(sourceId, {
      type: "geojson",
      data: geojson,
    });

    // Add fill layer for hex tiles
    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.85,
      },
    });

    // Add outline layer for hex borders
    map.addLayer({
      id: outlineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": "#1f130a",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          0.1,
          10,
          0.5,
          15,
          1,
          20,
          2,
        ],
        "line-opacity": 0.7,
      },
    });

    return () => {
      try {
        if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId);
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // Map may have been destroyed
      }
    };
    // Only run on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map]);

  // Update source data when tiles change
  useEffect(() => {
    if (!isLoaded || !map) return;

    const source = map.getSource(sourceId) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(geojson);
    }
  }, [isLoaded, map, geojson, sourceId]);

  // Handle click and hover events
  useEffect(() => {
    if (!isLoaded || !map) return;

    const handleClick = (
      e: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      }
    ) => {
      if (!onTileClick || !e.features?.length) return;

      const feature = e.features[0];
      const tile: MinimapTile = {
        col: feature.properties?.col,
        row: feature.properties?.row,
        biome: feature.properties?.biome || undefined,
        occupier_id: feature.properties?.occupier_id || undefined,
        occupier_type: feature.properties?.occupier_type || undefined,
        occupier_is_structure: feature.properties?.occupier_is_structure,
      };
      onTileClick(tile);
    };

    const handleMouseEnter = (
      e: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      }
    ) => {
      map.getCanvas().style.cursor = "pointer";
      if (!onTileHover || !e.features?.length) return;

      const feature = e.features[0];
      const tile: MinimapTile = {
        col: feature.properties?.col,
        row: feature.properties?.row,
        biome: feature.properties?.biome || undefined,
        occupier_id: feature.properties?.occupier_id || undefined,
        occupier_type: feature.properties?.occupier_type || undefined,
        occupier_is_structure: feature.properties?.occupier_is_structure,
      };
      onTileHover(tile);
    };

    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      onTileHover?.(null);
    };

    map.on("click", fillLayerId, handleClick);
    map.on("mouseenter", fillLayerId, handleMouseEnter);
    map.on("mouseleave", fillLayerId, handleMouseLeave);

    return () => {
      map.off("click", fillLayerId, handleClick);
      map.off("mouseenter", fillLayerId, handleMouseEnter);
      map.off("mouseleave", fillLayerId, handleMouseLeave);
    };
  }, [isLoaded, map, fillLayerId, onTileClick, onTileHover]);

  return null;
}

/**
 * Info panel for displaying tile details.
 */
interface TileInfoPanelProps {
  tile: MinimapTile | null;
  tileCenter?: CoordConfig;
  className?: string;
}

const BIOME_NAMES: Record<number, string> = {
  1: "Deep Ocean",
  2: "Ocean",
  3: "Beach",
  4: "Scorched",
  5: "Bare",
  6: "Tundra",
  7: "Snow",
  8: "Temperate Desert",
  9: "Shrubland",
  10: "Taiga",
  11: "Grassland",
  12: "Temperate Deciduous Forest",
  13: "Temperate Rain Forest",
  14: "Subtropical Desert",
  15: "Tropical Seasonal Forest",
  16: "Tropical Rain Forest",
};

export function TileInfoPanel({ tile, tileCenter, className }: TileInfoPanelProps) {
  if (!tile) return null;

  const centerCol = tileCenter?.centerCol ?? 2147483646;
  const centerRow = tileCenter?.centerRow ?? 2147483646;
  const displayCol = tile.col - centerCol;
  const displayRow = tile.row - centerRow;
  const biomeName = BIOME_NAMES[tile.biome ?? 0] ?? "Unknown";

  return (
    <div
      className={`absolute bottom-4 left-4 z-10 rounded-md border border-border bg-background/95 p-3 shadow-md backdrop-blur-sm ${className ?? ""}`}
    >
      <div className="text-sm font-medium">
        Tile ({displayCol}, {displayRow})
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        <div>Biome: {biomeName}</div>
        {tile.occupier_id && (
          <div>
            Occupier: {tile.occupier_type === 1 ? "Army" : "Structure"} #
            {tile.occupier_id}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook for managing tile data loading state.
 */
export function useTileData(toriiUrl?: string) {
  const [tiles, setTiles] = useState<MinimapTile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { fetchAllTiles } = await import("@/lib/torii-api");
      const fetchedTiles = await fetchAllTiles(toriiUrl);

      // Log the first few tiles to understand the coordinate range
      console.log("[useTileData] Loaded", fetchedTiles.length, "tiles");
      if (fetchedTiles.length > 0) {
        console.log("[useTileData] First tile:", fetchedTiles[0]);
        console.log("[useTileData] Last tile:", fetchedTiles[fetchedTiles.length - 1]);
      }

      const { tileIndex } = await import("@/lib/h3-tile-index");
      tileIndex.indexTiles(fetchedTiles);

      setTiles(fetchedTiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tiles");
    } finally {
      setLoading(false);
    }
  }, [toriiUrl]);

  const refresh = useCallback(() => {
    loadTiles();
  }, [loadTiles]);

  return { tiles, loading, error, refresh, loadTiles };
}
