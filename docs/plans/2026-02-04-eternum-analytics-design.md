# Eternum Analytics Dashboard Design

**Date:** 2026-02-04
**Status:** Draft
**Audience:** Starkware team

## Purpose

Collect and display objective data about Eternum games for the Starkware team. No narrative spin - just the facts.

## Metrics

| Metric | Definition |
|--------|------------|
| New players | Address never seen in ANY previous Eternum game |
| Recurring players | Address that has played at least one previous game |
| Total transactions | Count of Starknet transactions per game |
| Avg transactions per player | Total txs / unique players per game |
| Paymaster fees | TBD - needs investigation |
| Games left in tournament | Manual input (total - completed) |

## Data Sources

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Source Hierarchy                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Factory Torii DBs                                          │
│  ├── Mainnet: api.cartridge.gg/x/eternum-factory-mainnet   │
│  └── Slot:    api.cartridge.gg/x/eternum-factory-slot-a    │
│       │                                                     │
│       ├── wf-WorldDeployed  (world addresses, names)       │
│       ├── wf-Series         (tournaments)                  │
│       └── wf-SeriesGame     (games in tournaments)         │
│                    │                                        │
│                    ▼                                        │
│  Per-World Torii DBs                                        │
│  └── api.cartridge.gg/x/{world_slug}/torii/sql             │
│       │                                                     │
│       ├── transactions                (all txs)            │
│       ├── s1_eternum-BlitzPlayerRegisterList (players)     │
│       ├── s1_eternum-AddressName      (player names)       │
│       └── controllers                 (AA → username)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Important: Player Counting

Due to Starknet account abstraction, `transactions.sender_address` does NOT equal unique players.

| Source | What it counts | Example |
|--------|----------------|---------|
| `COUNT(DISTINCT sender_address)` | All tx senders (includes session keys, contracts) | 20 |
| `s1_eternum-BlitzPlayerRegisterList` | **Actual registered players** | 4 |
| `controllers` | Cartridge usernames | Maps address → username |

**Always use `BlitzPlayerRegisterList` for player counts.**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    eternum-analytics                        │
│                  (packages/eternum-analytics/)              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Collector  │───▶│    Store     │───▶│   Outputs    │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │          │
│         ▼                   ▼                   ▼          │
│  - Factory Torii      - JSON files        - Static HTML    │
│  - World Torii DBs    - Historical data   - JSON/CSV       │
│  - Manual input                           - REST API       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Data Model

```typescript
// A game (completed or active)
interface Game {
  worldSlug: string;         // e.g., "test-opal-dark-97"
  worldAddress: string;      // Contract address
  name: string;              // Decoded hex name
  startTime: string;         // ISO timestamp
  endTime: string | null;    // Null if active
  status: "active" | "completed";
  seriesName?: string;       // If part of a tournament
}

// Aggregated metrics per game
interface GameMetrics {
  worldSlug: string;
  totalPlayers: number;
  newPlayers: number;
  recurringPlayers: number;
  totalTransactions: number;
  avgTxPerPlayer: number;
  durationHours: number;
  paymasterFees: string | null;  // TBD
}

// Player history (for new vs recurring)
interface PlayerHistory {
  address: string;
  firstSeenGame: string;
  firstSeenTime: string;
  gamesPlayed: string[];
}

// Manual tournament input
interface Tournament {
  id: string;
  name: string;
  totalGames: number;
  completedGameSlugs: string[];
}
```

## Storage

Flat JSON files in `data/` directory:

```
data/
├── games.json           # All games with metadata
├── metrics.json         # Per-game metrics
├── players.json         # Player history
├── tournaments.json     # Manual tournament config
└── snapshots/           # Historical backups
```

## Collector Logic

```
1. Fetch game list from Factory Torii
   └── Query wf-WorldDeployed
   └── Decode hex names to world slugs

2. For each game's World Torii DB:
   └── Query transactions table
       └── COUNT(*) → total transactions
   └── Query s1_eternum-BlitzPlayerRegisterList
       └── COUNT(*) → registered players (actual humans)
       └── Get player addresses
   └── Query MIN/MAX executed_at → game duration

3. Cross-reference players against history:
   └── Load players.json (historical player addresses)
   └── For each player in BlitzPlayerRegisterList:
       └── Not in history → "new", add to history
       └── In history → "recurring"

4. Aggregate and store:
   └── Update games.json, metrics.json, players.json
```

## REST API

```
GET /api/games              # List all games
GET /api/games/:slug        # Single game + metrics
GET /api/metrics            # All metrics
GET /api/metrics/summary    # High-level totals
GET /api/players/stats      # New vs recurring
GET /api/tournaments        # Tournament status
```

## Package Structure

```
packages/eternum-analytics/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # CLI entry point
│   ├── collector/
│   │   ├── factory.ts        # Fetch from Factory Torii
│   │   ├── world.ts          # Fetch from World Torii
│   │   └── index.ts
│   ├── processors/
│   │   ├── players.ts        # New vs recurring logic
│   │   ├── metrics.ts        # Aggregations
│   │   └── index.ts
│   ├── api/
│   │   ├── server.ts         # Bun HTTP server
│   │   ├── routes.ts         # Endpoints
│   │   └── index.ts
│   ├── store/
│   │   ├── json-store.ts     # File I/O
│   │   └── types.ts          # Interfaces
│   └── utils/
│       ├── torii-client.ts   # SQL query helpers
│       └── config.ts         # Environment
├── data/                     # Generated (gitignored)
├── test-data/                # Sample data for dev
└── dashboard/
    ├── index.html
    └── styles.css
```

## CLI Commands

```bash
bun run collect              # Fetch and process data
bun run collect --full       # Full refresh
bun run serve                # Start API + dashboard
```

## Configuration

```bash
# .env
FACTORY_MAINNET_URL=https://api.cartridge.gg/x/eternum-factory-mainnet/torii/sql
FACTORY_SLOT_URL=https://api.cartridge.gg/x/eternum-factory-slot-a/torii/sql
PORT=3000
```

## Test Data

Sample data saved in `packages/eternum-analytics/test-data/`:

| File | Records | Description |
|------|---------|-------------|
| mainnet-worlds.json | 16 | Mainnet deployed worlds |
| slot-worlds.json | 75 | Slot deployed worlds |
| sample-world-transactions.json | 849 | Transactions from test-opal-dark-97 |
| sample-world-players.json | 4 | Registered players (BlitzPlayerRegisterList) |
| sample-world-summary-corrected.json | 1 | Corrected stats (4 players, not 20) |

### Sample World Stats (test-opal-dark-97)

| Metric | Value |
|--------|-------|
| Duration | ~4.3 hours |
| Total transactions | 849 |
| Registered players | 4 |
| Avg tx per player | 212 |
| Unique tx senders | 20 (includes session keys, contracts) |

## Open Questions

1. **Paymaster fees** - Where is this data? Cartridge API? Derived from receipts?
2. **Game end detection** - How to know when a game is "completed"? Season config?
3. **Historical data** - How far back can we query?
4. **Rate limits** - Any limits on Torii SQL API?

## Next Steps

1. Set up package scaffolding (package.json, tsconfig)
2. Implement Torii client with SQL query helpers
3. Build collector for factory data
4. Build collector for world data
5. Implement player history tracking
6. Add REST API
7. Create minimal dashboard
8. Test with real data
