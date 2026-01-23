import { useState } from "react";
import { Filter, ChevronDown, ChevronUp, X, RotateCcw } from "lucide-react";
import type { TileFilters } from "@/lib/filters";

interface FilterCheckboxProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  indented?: boolean;
}

function FilterCheckbox({ label, checked, onChange, indented }: FilterCheckboxProps) {
  return (
    <label className={`flex items-center gap-2 text-xs cursor-pointer hover:bg-accent/50 px-2 py-1 rounded ${indented ? "ml-4" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-3.5 rounded border-border"
      />
      {label}
    </label>
  );
}

interface FilterPanelProps {
  filters: TileFilters;
  onToggleFilter: (key: keyof Omit<TileFilters, "ownerAddress">) => void;
  onSetOwnerAddress: (address: string) => void;
  onResetFilters: () => void;
  filteredCount: number;
  totalCount: number;
}

export function FilterPanel({
  filters,
  onToggleFilter,
  onSetOwnerAddress,
  onResetFilters,
  filteredCount,
  totalCount,
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="absolute top-4 right-4 bg-background/95 backdrop-blur rounded-md border shadow-md max-w-xs">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium hover:bg-accent/50 rounded-md transition-colors"
      >
        <Filter className="size-4" />
        <span>Filters</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {filteredCount} / {totalCount} tiles
        </span>
        {isExpanded ? (
          <ChevronUp className="size-4" />
        ) : (
          <ChevronDown className="size-4" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-3">
          {/* Entity Toggles */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">Entity Toggles</p>

            {/* Structures master toggle */}
            <FilterCheckbox
              label="Structures"
              checked={filters.showStructures}
              onChange={() => onToggleFilter("showStructures")}
            />

            {/* Structure sub-toggles (only show when structures enabled) */}
            {filters.showStructures && (
              <>
                <FilterCheckbox
                  label="Realms"
                  checked={filters.showRealms}
                  onChange={() => onToggleFilter("showRealms")}
                  indented
                />
                <FilterCheckbox
                  label="Villages"
                  checked={filters.showVillages}
                  onChange={() => onToggleFilter("showVillages")}
                  indented
                />
                <FilterCheckbox
                  label="Hyperstructures"
                  checked={filters.showHyperstructures}
                  onChange={() => onToggleFilter("showHyperstructures")}
                  indented
                />
                <FilterCheckbox
                  label="Banks"
                  checked={filters.showBanks}
                  onChange={() => onToggleFilter("showBanks")}
                  indented
                />
                <FilterCheckbox
                  label="Mines"
                  checked={filters.showMines}
                  onChange={() => onToggleFilter("showMines")}
                  indented
                />
              </>
            )}

            {/* Other entity toggles */}
            <FilterCheckbox
              label="Explorers"
              checked={filters.showExplorers}
              onChange={() => onToggleFilter("showExplorers")}
            />
            <FilterCheckbox
              label="Quests"
              checked={filters.showQuests}
              onChange={() => onToggleFilter("showQuests")}
            />
            <FilterCheckbox
              label="Chests"
              checked={filters.showChests}
              onChange={() => onToggleFilter("showChests")}
            />
          </div>

          {/* Owner Filter */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground mb-1">Owner Filter</p>
            <div className="relative">
              <input
                type="text"
                value={filters.ownerAddress}
                onChange={(e) => onSetOwnerAddress(e.target.value)}
                placeholder="Filter by owner address..."
                className="w-full px-2 py-1.5 text-xs rounded border bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {filters.ownerAddress && (
                <button
                  onClick={() => onSetOwnerAddress("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-accent rounded"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t pt-2">
            <button
              onClick={onResetFilters}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="size-3" />
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
