import { useState, useCallback } from "react";
import { type TileFilters, DEFAULT_FILTERS } from "@/lib/filters";

export interface UseFiltersReturn {
  filters: TileFilters;
  setFilter: <K extends keyof TileFilters>(key: K, value: TileFilters[K]) => void;
  toggleFilter: (key: keyof Omit<TileFilters, "ownerAddress">) => void;
  resetFilters: () => void;
  setOwnerAddress: (address: string) => void;
}

export function useFilters(): UseFiltersReturn {
  const [filters, setFilters] = useState<TileFilters>(DEFAULT_FILTERS);

  const setFilter = useCallback(<K extends keyof TileFilters>(
    key: K,
    value: TileFilters[K]
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFilter = useCallback((key: keyof Omit<TileFilters, "ownerAddress">) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const setOwnerAddress = useCallback((address: string) => {
    setFilters((prev) => ({ ...prev, ownerAddress: address }));
  }, []);

  return {
    filters,
    setFilter,
    toggleFilter,
    resetFilters,
    setOwnerAddress,
  };
}
