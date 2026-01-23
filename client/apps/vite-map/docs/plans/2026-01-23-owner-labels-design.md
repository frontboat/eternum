# Owner Labels on Map

## Summary

Add letter labels (A, B, C... AA, AB...) to entities on the vite-map to identify which owner they belong to.

**Entities affected:** Realms, Villages, Hyperstructures, Explorers

## How It Works

1. Collect all unique owner addresses from structures and explorers
2. Sort addresses lexicographically
3. Assign labels based on sorted index (0→A, 1→B, 25→Z, 26→AA, 27→AB...)
4. All entities belonging to the same owner display the same letter
5. Labels render as text on hex tiles via a MapLibre symbol layer
6. A "Show Owner Labels" checkbox in FilterPanel toggles visibility

## Example

- Owner `0x123abc...` owns 2 realms and 3 explorers → all 5 show label **A**
- Owner `0x456def...` owns 1 village → shows label **B**
- Owner `0x789ghi...` owns 1 hyperstructure and 2 explorers → all 3 show label **C**

## Implementation

### File Changes

| File | Changes |
|------|---------|
| `src/lib/filters.ts` | Add `showOwnerLabels` to `TileFilters`, add `indexToLabel()` helper, add `buildOwnerLabelMap()` |
| `src/hooks/use-filters.ts` | Add `showOwnerLabels: false` to default state |
| `src/components/filter-panel.tsx` | Add "Show Owner Labels" checkbox |
| `src/components/eternum-hex-layer.tsx` | Add label GeoJSON source, symbol layer, visibility toggle |

### Label Generation

```typescript
// Collect unique owners, sort, assign labels
const owners = [...new Set(ownersFromTiles)].sort();
const ownerToLabel = new Map(owners.map((addr, i) => [addr, indexToLabel(i)]));

// Excel-column-style label from index
function indexToLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}
```

### MapLibre Symbol Layer

Separate Point GeoJSON source at hex centers:

```typescript
const labelGeojson = {
  type: "FeatureCollection",
  features: qualifyingTiles.map(tile => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [centerLng, centerLat] },
    properties: { ownerLabel: ownerToLabel.get(owner) }
  }))
};
```

Symbol layer configuration:

```typescript
map.addLayer({
  id: 'owner-labels',
  type: 'symbol',
  source: 'owner-labels-source',
  layout: {
    'text-field': ['get', 'ownerLabel'],
    'text-size': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 14, 18, 24],
    'text-anchor': 'center',
    'text-allow-overlap': true
  },
  paint: {
    'text-color': '#000000',
    'text-halo-color': '#ffffff',
    'text-halo-width': 1.5
  }
});
```

### Visibility Toggle

```typescript
useEffect(() => {
  if (!map.getLayer('owner-labels')) return;
  map.setLayoutProperty('owner-labels', 'visibility',
    filters.showOwnerLabels ? 'visible' : 'none');
}, [filters.showOwnerLabels]);
```

## Goal

Quickly see which entities belong to the same player without needing to click each one.
