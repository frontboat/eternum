import { useEffect, useMemo, useId, useCallback, useState } from "react";
import type maplibregl from "maplibre-gl";
import { useMap } from "./ui/map";
import {
  eternumToLatLng,
  hexCorners,
  calculateTileCenter,
  type CoordConfig,
} from "@/lib/eternum-coords";
import {
  RESOURCE_NAMES,
  RESOURCE_ID_TO_NAME,
  TROOP_CATEGORIES,
  TROOP_TIERS,
  STRUCTURE_CATEGORIES,
  REALM_ORDERS,
  type MinimapTile,
  type ResourceBalances,
  type ExplorerInfo,
  type StructureInfo,
  type QuestInfo,
} from "@/lib/torii-api";
import {
  getTileHighlightColor,
  buildOwnerLabelMap,
  getTileOwnerLabel,
  type TileFilters,
} from "@/lib/filters";

interface EternumHexLayerProps {
  tiles: MinimapTile[];
  filters: TileFilters;
  structures?: Map<string, StructureInfo>;
  explorers?: Map<string, ExplorerInfo>;
  onTileClick?: (tile: MinimapTile) => void;
  onTileHover?: (tile: MinimapTile | null) => void;
}

/**
 * MapLibre layer for rendering Eternum hex tiles as proper hexagon polygons.
 * Uses GeoJSON source with dynamic data updates.
 */
export function EternumHexLayer({
  tiles,
  filters,
  structures,
  explorers,
  onTileClick,
  onTileHover,
}: EternumHexLayerProps) {
  const { map, isLoaded } = useMap();
  const id = useId();
  const sourceId = `eternum-tiles-${id}`;
  const fillLayerId = `eternum-tiles-fill-${id}`;
  const outlineLayerId = `eternum-tiles-outline-${id}`;
  const labelSourceId = `eternum-labels-${id}`;
  const labelLayerId = `eternum-labels-layer-${id}`;

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
      const color = getTileHighlightColor(tile, filters, structures, explorers);
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
          alt: tile.alt ?? false,
          biome: tile.biome ?? 0,
          color,
          occupier_id: tile.occupier_id ?? "",
          occupier_type: tile.occupier_type ?? 0,
          occupier_is_structure: tile.occupier_is_structure ?? false,
          reward_extracted: tile.reward_extracted ?? false,
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
  }, [tiles, coordConfig, filters, structures, explorers]);

  // Build owner label map
  const ownerLabelMap = useMemo(() => {
    if (!structures || !explorers) return new Map<string, string>();
    return buildOwnerLabelMap(tiles, structures, explorers);
  }, [tiles, structures, explorers]);

  // Create label GeoJSON (Point features at hex centers)
  const labelGeojson = useMemo(() => {
    if (!structures || !explorers) {
      return { type: "FeatureCollection" as const, features: [] };
    }

    const features = tiles
      .map((tile) => {
        const label = getTileOwnerLabel(tile, ownerLabelMap, structures, explorers);
        if (!label) return null;

        const [lat, lng] = eternumToLatLng(
          { col: tile.col, row: tile.row },
          coordConfig
        );

        return {
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [lng, lat],
          },
          properties: {
            ownerLabel: label,
          },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [tiles, coordConfig, ownerLabelMap, structures, explorers]);

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

    // Add label source
    map.addSource(labelSourceId, {
      type: "geojson",
      data: labelGeojson,
    });

    // Add label layer
    map.addLayer({
      id: labelLayerId,
      type: "symbol",
      source: labelSourceId,
      layout: {
        "text-field": ["get", "ownerLabel"],
        "text-font": ["Noto Sans Bold"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8, 6,
          12, 10,
          16, 16,
          20, 24,
        ],
        "text-anchor": "center",
        "text-allow-overlap": true,
        "visibility": "none", // Start hidden
      },
      paint: {
        "text-color": "#000000",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5,
      },
    });

    return () => {
      try {
        if (map.getLayer(labelLayerId)) map.removeLayer(labelLayerId);
        if (map.getSource(labelSourceId)) map.removeSource(labelSourceId);
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

  // Update label source data when labels change
  useEffect(() => {
    if (!isLoaded || !map) return;

    const source = map.getSource(labelSourceId) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(labelGeojson);
    }
  }, [isLoaded, map, labelGeojson, labelSourceId]);

  // Toggle label layer visibility
  useEffect(() => {
    if (!isLoaded || !map) return;

    const layer = map.getLayer(labelLayerId);
    if (layer) {
      map.setLayoutProperty(
        labelLayerId,
        "visibility",
        filters.showOwnerLabels ? "visible" : "none"
      );
    }
  }, [isLoaded, map, filters.showOwnerLabels, labelLayerId]);

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
        alt: feature.properties?.alt ?? false,
        biome: feature.properties?.biome || undefined,
        occupier_id: feature.properties?.occupier_id || undefined,
        occupier_type: feature.properties?.occupier_type || undefined,
        occupier_is_structure: feature.properties?.occupier_is_structure,
        reward_extracted: feature.properties?.reward_extracted ?? false,
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
        alt: feature.properties?.alt ?? false,
        biome: feature.properties?.biome || undefined,
        occupier_id: feature.properties?.occupier_id || undefined,
        occupier_type: feature.properties?.occupier_type || undefined,
        occupier_is_structure: feature.properties?.occupier_is_structure,
        reward_extracted: feature.properties?.reward_extracted ?? false,
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
  resources?: Map<string, ResourceBalances>;
  explorers?: Map<string, ExplorerInfo>;
  structures?: Map<string, StructureInfo>;
  quests?: Map<string, QuestInfo>;
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

const OCCUPIER_TYPE_NAMES: Record<number, string> = {
  0: "None",
  1: "Realm Regular L1",
  2: "Realm Regular L2",
  3: "Realm Regular L3",
  4: "Realm Regular L4",
  5: "Realm Wonder L1",
  6: "Realm Wonder L2",
  7: "Realm Wonder L3",
  8: "Realm Wonder L4",
  9: "Hyperstructure L1",
  10: "Hyperstructure L2",
  11: "Hyperstructure L3",
  12: "Fragment Mine",
  13: "Village",
  14: "Bank",
  15: "Knight T1",
  16: "Knight T2",
  17: "Knight T3",
  18: "Paladin T1",
  19: "Paladin T2",
  20: "Paladin T3",
  21: "Crossbowman T1",
  22: "Crossbowman T2",
  23: "Crossbowman T3",
  24: "Knight T1 (Daydreams)",
  25: "Knight T2 (Daydreams)",
  26: "Knight T3 (Daydreams)",
  27: "Paladin T1 (Daydreams)",
  28: "Paladin T2 (Daydreams)",
  29: "Paladin T3 (Daydreams)",
  30: "Crossbowman T1 (Daydreams)",
  31: "Crossbowman T2 (Daydreams)",
  32: "Crossbowman T3 (Daydreams)",
  33: "Quest",
  34: "Chest",
  35: "Spire",
};

// Resource precision divisor (matches game's RESOURCE_PRECISION)
const RESOURCE_PRECISION = 1_000_000_000n;

function formatTroopCount(count: number): string {
  // Convert from precision-scaled value
  const actualCount = BigInt(count) / RESOURCE_PRECISION;
  return actualCount.toLocaleString();
}

function formatTimestamp(timestamp: number): string {
  if (timestamp === 0) return "Ready";
  const now = Math.floor(Date.now() / 1000);
  if (timestamp <= now) return "Ready";
  const remaining = timestamp - now;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function TileInfoPanel({ tile, tileCenter, resources, explorers, structures, quests, className }: TileInfoPanelProps) {
  if (!tile) return null;

  const centerCol = tileCenter?.centerCol ?? 2147483646;
  const centerRow = tileCenter?.centerRow ?? 2147483646;
  const displayCol = tile.col - centerCol;
  const displayRow = tile.row - centerRow;
  const biomeName = BIOME_NAMES[tile.biome ?? 0] ?? "Unknown";
  const occupierTypeName = OCCUPIER_TYPE_NAMES[tile.occupier_type ?? 0] ?? "Unknown";

  // Determine if this is a quest or chest (special non-structure, non-explorer types)
  const isQuest = tile.occupier_type === 33;
  const isChest = tile.occupier_type === 34;
  const isExplorer = tile.occupier_type !== undefined && tile.occupier_type >= 15 && tile.occupier_type <= 32;

  // Get structure info for structure occupiers
  const structureInfo = tile.occupier_id && tile.occupier_is_structure
    ? structures?.get(tile.occupier_id)
    : undefined;

  // Get resources for this tile's occupier (structures only)
  const tileResources = tile.occupier_id && tile.occupier_is_structure
    ? resources?.get(tile.occupier_id)
    : undefined;
  const resourceEntries = tileResources
    ? Object.entries(tileResources.balances).sort(([, a], [, b]) => b - a)
    : [];

  // Get explorer info for explorer occupiers (types 15-32)
  const explorerInfo = tile.occupier_id && isExplorer
    ? explorers?.get(tile.occupier_id)
    : undefined;

  // Get resources carried by explorer
  const explorerResources = tile.occupier_id && isExplorer
    ? resources?.get(tile.occupier_id)
    : undefined;
  const explorerResourceEntries = explorerResources
    ? Object.entries(explorerResources.balances).sort(([, a], [, b]) => b - a)
    : [];

  // Get quest info for quest tiles
  const questInfo = tile.occupier_id && isQuest
    ? quests?.get(tile.occupier_id)
    : undefined;

  // Check for active boosts
  const hasActiveBoosts = explorerInfo && (
    explorerInfo.boosts.damage_dealt_percent > 0 ||
    explorerInfo.boosts.damage_reduction_percent > 0 ||
    explorerInfo.boosts.stamina_regen_percent > 0 ||
    explorerInfo.boosts.explore_reward_percent > 0
  );

  return (
    <div
      className={`absolute bottom-4 left-4 z-10 rounded-md border border-border bg-background/95 p-3 shadow-md backdrop-blur-sm max-h-[32rem] overflow-y-auto ${className ?? ""}`}
    >
      <div className="text-sm font-medium">
        Tile ({displayCol}, {displayRow})
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        <div>Biome: {biomeName}</div>
        <div>Alt: {tile.alt ? "Yes" : "No"}</div>
        <div>Reward Extracted: {tile.reward_extracted ? "Yes" : "No"}</div>

        {/* Occupier section */}
        {tile.occupier_type !== undefined && tile.occupier_type !== 0 && (
          <>
            <div className="mt-1 pt-1 border-t border-border/50">
              Occupier: {occupierTypeName}
            </div>
            {tile.occupier_id && (
              <div>ID: {tile.occupier_id}</div>
            )}
          </>
        )}

        {/* Structure details */}
        {structureInfo && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="font-medium text-foreground mb-1">Structure Details:</div>
            <div>Category: {STRUCTURE_CATEGORIES[structureInfo.category] ?? "Unknown"}</div>
            <div>Level: {structureInfo.level}</div>
            <div>Owner: {structureInfo.owner.slice(0, 10)}...</div>
            {structureInfo.realm_id > 0 && (
              <div>Realm ID: {structureInfo.realm_id}</div>
            )}
            {structureInfo.order > 0 && (
              <div>Order: {REALM_ORDERS[structureInfo.order] ?? `Unknown (${structureInfo.order})`}</div>
            )}
            {structureInfo.produces_resource_types.length > 0 && (
              <div>
                Can Produce: {structureInfo.produces_resource_types
                  .map((id) => RESOURCE_ID_TO_NAME[id] ?? `#${id}`)
                  .join(", ")}
              </div>
            )}
            {tileResources && tileResources.producing_resource_types.length > 0 && (
              <div className="text-green-400">
                Currently Producing: {tileResources.producing_resource_types
                  .map((id) => RESOURCE_ID_TO_NAME[id] ?? `#${id}`)
                  .join(", ")}
              </div>
            )}
            {structureInfo.has_wonder && (
              <div className="text-amber-500">Has Wonder</div>
            )}
            {structureInfo.villages_count > 0 && (
              <div>Villages: {structureInfo.villages_count}</div>
            )}
            {structureInfo.village_realm > 0 && (
              <div>Parent Realm: {structureInfo.village_realm}</div>
            )}
            <div>Guards: {structureInfo.troop_guard_count}/{structureInfo.troop_max_guard_count}</div>
            <div>Explorers: {structureInfo.troop_explorer_count}/{structureInfo.troop_max_explorer_count}</div>

            {/* Guard army details */}
            {structureInfo.guards.length > 0 && (
              <div className="mt-1 pt-1 border-t border-border/50">
                <div className="font-medium text-foreground mb-1">Guard Armies:</div>
                {structureInfo.guards.map((guard) => {
                  const hasActiveBoosts =
                    guard.boosts.damage_dealt_percent > 0 ||
                    guard.boosts.damage_reduction_percent > 0 ||
                    guard.boosts.stamina_regen_percent > 0 ||
                    guard.boosts.explore_reward_percent > 0;
                  return (
                    <div key={guard.slot} className="ml-2 mb-2">
                      <div className="text-foreground">
                        [{guard.slot}] {TROOP_CATEGORIES[guard.category] ?? "Unknown"} {TROOP_TIERS[guard.tier] ?? ""}
                      </div>
                      <div className="ml-2">
                        Count: {formatTroopCount(Number(guard.count))}
                      </div>
                      <div className="ml-2">
                        Stamina: {guard.stamina_amount.toLocaleString()}
                      </div>
                      <div className="ml-2">
                        Battle Ready: {formatTimestamp(guard.battle_cooldown_end)}
                      </div>
                      {guard.destroyed_tick > 0n && (
                        <div className="ml-2 text-red-400">
                          Destroyed at tick: {guard.destroyed_tick.toLocaleString()}
                        </div>
                      )}
                      {hasActiveBoosts && (
                        <div className="ml-2 mt-1 text-green-400">
                          <div className="text-foreground text-xs">Active Boosts:</div>
                          {guard.boosts.damage_dealt_percent > 0 && (
                            <div className="ml-2">+{guard.boosts.damage_dealt_percent}% Damage</div>
                          )}
                          {guard.boosts.damage_reduction_percent > 0 && (
                            <div className="ml-2">-{guard.boosts.damage_reduction_percent}% Damage Taken</div>
                          )}
                          {guard.boosts.stamina_regen_percent > 0 && (
                            <div className="ml-2">+{guard.boosts.stamina_regen_percent}% Stamina Regen</div>
                          )}
                          {guard.boosts.explore_reward_percent > 0 && (
                            <div className="ml-2">+{guard.boosts.explore_reward_percent}% Explore Reward</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Explorer details (types 15-32) */}
        {explorerInfo && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="font-medium text-foreground mb-1">Army Details:</div>
            <div>
              Type: {TROOP_CATEGORIES[explorerInfo.troop_category] ?? "Unknown"} {TROOP_TIERS[explorerInfo.troop_tier] ?? ""}
            </div>
            <div>Count: {formatTroopCount(explorerInfo.troop_count)}</div>
            <div>Owner: {explorerInfo.owner}</div>
            <div>Stamina: {explorerInfo.stamina_amount.toLocaleString()}</div>
            <div>Battle Ready: {formatTimestamp(explorerInfo.battle_cooldown_end)}</div>

            {/* Boosts section */}
            {hasActiveBoosts && (
              <div className="mt-1 pt-1 border-t border-border/50">
                <div className="font-medium text-foreground mb-1">Active Boosts:</div>
                {explorerInfo.boosts.damage_dealt_percent > 0 && (
                  <div>+{explorerInfo.boosts.damage_dealt_percent}% Damage</div>
                )}
                {explorerInfo.boosts.damage_reduction_percent > 0 && (
                  <div>-{explorerInfo.boosts.damage_reduction_percent}% Damage Taken</div>
                )}
                {explorerInfo.boosts.stamina_regen_percent > 0 && (
                  <div>+{explorerInfo.boosts.stamina_regen_percent}% Stamina Regen ({explorerInfo.boosts.stamina_regen_tick_count} ticks)</div>
                )}
                {explorerInfo.boosts.explore_reward_percent > 0 && (
                  <div>+{explorerInfo.boosts.explore_reward_percent}% Explore Rewards</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quest details */}
        {questInfo && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="font-medium text-foreground mb-1">Quest Details:</div>
            <div>Difficulty: Level {questInfo.level}</div>
            <div>Reward: {RESOURCE_NAMES[String(questInfo.resource_type)] ?? `Resource ${questInfo.resource_type}`}</div>
            <div>Amount: {questInfo.amount.toLocaleString()}</div>
            <div>Participants: {questInfo.participant_count}/{questInfo.capacity}</div>
          </div>
        )}

        {/* Chest indicator (minimal info available) */}
        {isChest && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="font-medium text-foreground mb-1">Chest</div>
            <div>Contains rewards - explore to open</div>
          </div>
        )}

        {/* Structure resources */}
        {resourceEntries.length > 0 && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="font-medium text-foreground mb-1">Resources:</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {resourceEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span>{RESOURCE_NAMES[key] ?? key}:</span>
                  <span className="ml-1 font-mono">{value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Explorer inventory */}
        {explorerResourceEntries.length > 0 && (
          <div className="mt-1 pt-1 border-t border-border/50">
            <div className="font-medium text-foreground mb-1">Inventory:</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {explorerResourceEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span>{RESOURCE_NAMES[key] ?? key}:</span>
                  <span className="ml-1 font-mono">{value.toLocaleString()}</span>
                </div>
              ))}
            </div>
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
  const [resources, setResources] = useState<Map<string, ResourceBalances>>(new Map());
  const [explorers, setExplorers] = useState<Map<string, ExplorerInfo>>(new Map());
  const [structures, setStructures] = useState<Map<string, StructureInfo>>(new Map());
  const [quests, setQuests] = useState<Map<string, QuestInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTiles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const {
        fetchAllTiles,
        fetchAllResources,
        fetchAllExplorers,
        fetchAllStructures,
        fetchAllQuests,
      } = await import("@/lib/torii-api");

      // Fetch all data in parallel (no duplicates - each fetches unique data)
      const [fetchedTiles, fetchedResources, fetchedExplorers, fetchedStructures, fetchedQuests] = await Promise.all([
        fetchAllTiles(toriiUrl),
        fetchAllResources(toriiUrl),
        fetchAllExplorers(toriiUrl),
        fetchAllStructures(toriiUrl),
        fetchAllQuests(toriiUrl),
      ]);

      // Log stats
      console.log("[useTileData] Loaded", fetchedTiles.length, "tiles");
      console.log("[useTileData] Loaded", fetchedResources.size, "resource entries");
      console.log("[useTileData] Loaded", fetchedExplorers.size, "explorers");
      console.log("[useTileData] Loaded", fetchedStructures.size, "structures");
      console.log("[useTileData] Loaded", fetchedQuests.size, "quests");
      if (fetchedTiles.length > 0) {
        console.log("[useTileData] First tile:", fetchedTiles[0]);
        console.log("[useTileData] Last tile:", fetchedTiles[fetchedTiles.length - 1]);
      }

      const { tileIndex } = await import("@/lib/h3-tile-index");
      tileIndex.indexTiles(fetchedTiles);

      setTiles(fetchedTiles);
      setResources(fetchedResources);
      setExplorers(fetchedExplorers);
      setStructures(fetchedStructures);
      setQuests(fetchedQuests);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tiles");
    } finally {
      setLoading(false);
    }
  }, [toriiUrl]);

  const refresh = useCallback(() => {
    loadTiles();
  }, [loadTiles]);

  return { tiles, resources, explorers, structures, quests, loading, error, refresh, loadTiles };
}
