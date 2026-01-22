export type Chain = "slot" | "mainnet" | "sepolia";

export interface FactoryWorld {
  name: string;
  chain: Chain;
  toriiUrl: string;
  isOnline: boolean;
  startMainAt: number | null;
  endAt: number | null;
  registrationCount: number | null;
}

const CARTRIDGE_API_BASE = "https://api.cartridge.gg";

/**
 * Get Factory Torii SQL URL for a chain.
 */
function getFactorySqlUrl(chain: Chain): string {
  switch (chain) {
    case "mainnet":
      return `${CARTRIDGE_API_BASE}/x/eternum-factory-mainnet/torii/sql`;
    case "sepolia":
      return `${CARTRIDGE_API_BASE}/x/eternum-factory-sepolia/torii/sql`;
    case "slot":
      return `${CARTRIDGE_API_BASE}/x/eternum-factory-slot-a/torii/sql`;
  }
}

/**
 * Build Torii URL from world name.
 */
export function buildToriiUrl(worldName: string): string {
  return `${CARTRIDGE_API_BASE}/x/${worldName}/torii`;
}

/**
 * Decode a felt (BigInt) to ASCII string.
 * Cairo short strings are stored as felt252, encoding ASCII bytes.
 */
function feltToAscii(feltBigInt: bigint): string {
  let hex = feltBigInt.toString(16);
  // Pad to even length
  if (hex.length % 2 !== 0) hex = "0" + hex;

  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16);
    if (byte > 0) str += String.fromCharCode(byte);
  }
  return str;
}

/**
 * Decode a padded felt-hex string into ASCII.
 */
function decodePaddedFeltAscii(hex: string): string {
  if (!hex) return "";
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (h === "0" || h === "") return "";

  try {
    const feltBigInt = BigInt(`0x${h}`);
    return feltToAscii(feltBigInt);
  } catch {
    return "";
  }
}

/**
 * Check if a Torii endpoint is available.
 */
async function isToriiOnline(toriiUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${toriiUrl}/sql`, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch world config metadata from a world's Torii.
 */
async function fetchWorldConfig(toriiUrl: string): Promise<{
  startMainAt: number | null;
  endAt: number | null;
  registrationCount: number | null;
}> {
  const meta = { startMainAt: null as number | null, endAt: null as number | null, registrationCount: null as number | null };

  try {
    const query = `SELECT "season_config.start_main_at" AS start_main_at, "season_config.end_at" AS end_at, "blitz_registration_config.registration_count" AS registration_count FROM "s1_eternum-WorldConfig" LIMIT 1;`;
    const url = `${toriiUrl}/sql?query=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return meta;

    const [row] = await res.json() as Record<string, unknown>[];
    if (row) {
      meta.startMainAt = parseHexToNumber(row.start_main_at);
      meta.endAt = parseHexToNumber(row.end_at);
      meta.registrationCount = parseHexToNumber(row.registration_count);
    }
  } catch {
    // ignore
  }

  return meta;
}

function parseHexToNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    try {
      if (v.startsWith("0x") || v.startsWith("0X")) return Number(BigInt(v));
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Fetch all deployed worlds from the Factory.
 */
async function fetchFactoryWorlds(chain: Chain): Promise<string[]> {
  const factoryUrl = getFactorySqlUrl(chain);
  const query = `SELECT name FROM [wf-WorldDeployed] LIMIT 1000;`;
  const url = `${factoryUrl}?query=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];

    const rows = await res.json() as Record<string, unknown>[];
    const names: string[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const feltHex = (row.name ?? row["data.name"]) as string | undefined;
      if (!feltHex) continue;

      const decoded = decodePaddedFeltAscii(feltHex);
      if (!decoded || seen.has(decoded)) continue;

      seen.add(decoded);
      names.push(decoded);
    }

    return names;
  } catch {
    return [];
  }
}

/**
 * Fetch all available games across chains, checking online status.
 */
export async function fetchAvailableGames(
  chains: Chain[] = ["slot", "mainnet"],
  concurrency = 6
): Promise<FactoryWorld[]> {
  // 1. Fetch world names from all chains
  const chainWorlds = await Promise.all(
    chains.map(async (chain) => {
      const names = await fetchFactoryWorlds(chain);
      return names.map((name) => ({ name, chain }));
    })
  );

  const allWorlds = chainWorlds.flat();
  const results: FactoryWorld[] = [];

  // 2. Check availability and fetch config with limited concurrency
  let index = 0;

  const worker = async () => {
    while (index < allWorlds.length) {
      const i = index++;
      const { name, chain } = allWorlds[i];
      const toriiUrl = buildToriiUrl(name);

      const isOnline = await isToriiOnline(toriiUrl);

      let config = { startMainAt: null as number | null, endAt: null as number | null, registrationCount: null as number | null };
      if (isOnline) {
        config = await fetchWorldConfig(toriiUrl);
      }

      results.push({
        name,
        chain,
        toriiUrl,
        isOnline,
        ...config,
      });
    }
  };

  // Run workers in parallel
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return results;
}

/**
 * Get game status based on timestamps.
 */
export function getGameStatus(
  startMainAt: number | null,
  endAt: number | null
): "upcoming" | "ongoing" | "ended" | "unknown" {
  if (startMainAt == null) return "unknown";

  const now = Math.floor(Date.now() / 1000);

  if (now < startMainAt) return "upcoming";
  if (endAt != null && endAt > 0 && now >= endAt) return "ended";
  return "ongoing";
}

/**
 * Format time remaining/elapsed.
 */
export function formatTimeRemaining(seconds: number): string {
  if (seconds < 0) seconds = 0;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
