import { useEffect, useState, useCallback, useMemo } from "react";
import {
  fetchAvailableGames,
  getGameStatus,
  formatTimeRemaining,
  type FactoryWorld,
  type Chain,
} from "@/lib/factory-api";
import { Loader2, RefreshCw, Globe, Users, Clock, CheckCircle2 } from "lucide-react";

interface GameSelectorProps {
  onSelectGame: (game: FactoryWorld) => void;
}

export function GameSelector({ onSelectGame }: GameSelectorProps) {
  const [games, setGames] = useState<FactoryWorld[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chainFilter, setChainFilter] = useState<Chain | "all">("all");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const loadGames = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedGames = await fetchAvailableGames(["slot", "mainnet"]);
      setGames(fetchedGames);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load games");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load games on mount
  useEffect(() => {
    loadGames();
  }, [loadGames]);

  // Update time every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  // Filter and sort games
  const filteredGames = useMemo(() => {
    let filtered = games.filter((g) => g.isOnline);

    if (chainFilter !== "all") {
      filtered = filtered.filter((g) => g.chain === chainFilter);
    }

    // Sort: ongoing first, then upcoming, then ended, then unknown
    return filtered.sort((a, b) => {
      const statusA = getGameStatus(a.startMainAt, a.endAt);
      const statusB = getGameStatus(b.startMainAt, b.endAt);

      const order = { ongoing: 0, upcoming: 1, unknown: 2, ended: 3 };
      const diff = order[statusA] - order[statusB];
      if (diff !== 0) return diff;

      // Within same status, sort by time
      if (statusA === "ongoing" && a.endAt && b.endAt) {
        return a.endAt - b.endAt; // Ending soonest first
      }
      if (statusA === "upcoming" && a.startMainAt && b.startMainAt) {
        return a.startMainAt - b.startMainAt; // Starting soonest first
      }

      return a.name.localeCompare(b.name);
    });
  }, [games, chainFilter]);

  const onlineCount = games.filter((g) => g.isOnline).length;

  if (loading && games.length === 0) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-10 animate-spin text-primary" />
          <div className="text-sm text-muted-foreground">
            Discovering Eternum worlds...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-3">
              <Globe className="size-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Select World
              </h1>
              <p className="text-sm text-muted-foreground">
                {onlineCount} worlds online
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Chain filter */}
            <div className="flex items-center gap-1 rounded-full border bg-card p-1">
              {(["all", "mainnet", "slot"] as const).map((chain) => (
                <button
                  key={chain}
                  onClick={() => setChainFilter(chain)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    chainFilter === chain
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {chain === "all" ? "All" : chain.charAt(0).toUpperCase() + chain.slice(1)}
                </button>
              ))}
            </div>

            {/* Refresh button */}
            <button
              onClick={loadGames}
              disabled={loading}
              className="rounded-lg border bg-card p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={loadGames}
              className="mt-2 text-sm text-destructive underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Games list */}
        {filteredGames.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed p-12 text-center">
            <Globe className="mx-auto mb-3 size-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">No online worlds found</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Try changing the chain filter or refresh
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredGames.map((game) => (
              <GameCard
                key={`${game.chain}-${game.name}`}
                game={game}
                now={now}
                onClick={() => onSelectGame(game)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface GameCardProps {
  game: FactoryWorld;
  now: number;
  onClick: () => void;
}

function GameCard({ game, now, onClick }: GameCardProps) {
  const status = getGameStatus(game.startMainAt, game.endAt);

  const statusConfig = {
    ongoing: {
      label: "Live",
      color: "bg-green-500/10 text-green-500 border-green-500/30",
      dot: "bg-green-500",
    },
    upcoming: {
      label: "Upcoming",
      color: "bg-blue-500/10 text-blue-500 border-blue-500/30",
      dot: "bg-blue-500",
    },
    ended: {
      label: "Ended",
      color: "bg-muted text-muted-foreground border-border",
      dot: "bg-muted-foreground",
    },
    unknown: {
      label: "Unknown",
      color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30",
      dot: "bg-yellow-500",
    },
  };

  const config = statusConfig[status];

  // Calculate time display
  let timeDisplay = "";
  if (status === "ongoing" && game.endAt && game.endAt > 0) {
    const remaining = game.endAt - now;
    timeDisplay = `${formatTimeRemaining(remaining)} left`;
  } else if (status === "upcoming" && game.startMainAt) {
    const until = game.startMainAt - now;
    timeDisplay = `Starts in ${formatTimeRemaining(until)}`;
  }

  return (
    <button
      onClick={onClick}
      className={`group relative w-full rounded-lg border bg-card p-4 text-left transition-all hover:border-primary/50 hover:bg-accent/50 ${
        status === "ended" ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{game.name}</h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase ${
                game.chain === "mainnet"
                  ? "border-purple-500/30 bg-purple-500/10 text-purple-500"
                  : "border-orange-500/30 bg-orange-500/10 text-orange-500"
              }`}
            >
              {game.chain}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {game.registrationCount != null && (
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {game.registrationCount} registered
              </span>
            )}
            {timeDisplay && (
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {timeDisplay}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Status badge */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${config.color}`}
          >
            <span className={`size-1.5 rounded-full ${config.dot} ${status === "ongoing" ? "animate-pulse" : ""}`} />
            {config.label}
          </span>

          {/* Select indicator */}
          <span className="flex items-center gap-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            <CheckCircle2 className="size-3" />
            Select
          </span>
        </div>
      </div>
    </button>
  );
}
