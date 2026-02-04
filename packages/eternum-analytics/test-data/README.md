# Test Data

Sample data fetched from Eternum Torii databases for development and testing.

## Data Sources

| File | Source | Description |
|------|--------|-------------|
| `mainnet-worlds.json` | Factory Mainnet | 16 deployed worlds on mainnet |
| `mainnet-series.json` | Factory Mainnet | Tournament series data |
| `slot-worlds.json` | Factory Slot-A | 75 deployed worlds on slot (testnet) |
| `sample-world-transactions.json` | test-opal-dark-97 | 849 transactions from a single game |
| `sample-world-player-txs.json` | test-opal-dark-97 | Transaction counts grouped by player |
| `sample-world-summary.json` | test-opal-dark-97 | Aggregate stats (total txs, unique players, time range) |

## API Endpoints

### Factory Torii DBs
- Mainnet: `https://api.cartridge.gg/x/eternum-factory-mainnet/torii/sql?query=`
- Slot: `https://api.cartridge.gg/x/eternum-factory-slot-a/torii/sql?query=`

### World Torii DBs
- Pattern: `https://api.cartridge.gg/x/{world_slug}/torii/sql?query=`
- Example: `https://api.cartridge.gg/x/test-opal-dark-97/torii/sql?query=`

## Key Tables

### Factory Tables (wf- prefix)
- `wf-WorldDeployed` - Deployed worlds with addresses and names
- `wf-Series` - Tournament series
- `wf-SeriesGame` - Games within series
- `wf-WorldContract` - Contracts per world

### World Tables
- `transactions` - All transactions (sender_address, tx_hash, executed_at, max_fee, nonce)
- `transaction_receipts` - Receipts with fee data
- `transaction_calls` - Individual calls within transactions

## Sample World Summary (test-opal-dark-97)

```json
{
  "total_txs": 849,
  "unique_players": 20,
  "start_time": "2026-02-04T13:42:57+00:00",
  "end_time": "2026-02-04T17:59:40+00:00",
  "duration_hours": 4.28
}
```

## Useful Queries

```sql
-- Total transactions
SELECT COUNT(*) as total_txs FROM transactions

-- Unique players
SELECT COUNT(DISTINCT sender_address) as unique_players FROM transactions

-- Transactions per player
SELECT sender_address, COUNT(*) as tx_count
FROM transactions
GROUP BY sender_address
ORDER BY tx_count DESC

-- Game time range
SELECT MIN(executed_at) as start, MAX(executed_at) as end FROM transactions
```

## Decoding World Names

World names in factory are hex-encoded. Decode with:

```typescript
const hexName = "0x000000000000000000000000000000746573742d6f70616c2d6461726b2d3937";
const name = Buffer.from(hexName.replace("0x", ""), "hex")
  .toString("utf8")
  .replace(/\x00/g, "");
// Result: "test-opal-dark-97"
```
