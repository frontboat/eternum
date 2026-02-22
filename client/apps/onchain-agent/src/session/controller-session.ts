import { execFile } from "node:child_process";
import SessionProvider from "@cartridge/controller/session/node";
import type { WalletAccount } from "starknet";
import type { WorldProfile } from "../world/types";

type SessionPolicies = ConstructorParameters<typeof SessionProvider>[0]["policies"];

type PolicyMethod = { name: string; entrypoint: string; description?: string };

interface SessionManifest {
  contracts?: unknown[];
}

interface ControllerSessionConfig {
  rpcUrl: string;
  chainId: string;
  gameName?: string;
  basePath?: string;
  manifest: SessionManifest;
  worldProfile?: WorldProfile;
  /** When set, the auth URL is passed to this callback instead of opening a browser. */
  onAuthUrl?: (url: string) => void;
  /** Override the redirect URI for the auth callback (e.g. public VPS URL). */
  callbackUrl?: string;
}

interface BuildSessionPolicyOptions {
  gameName?: string;
  worldProfile?: WorldProfile;
}

const VRF_PROVIDER_ADDRESS = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";

function normalizeTag(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeGameName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^s\d+_/, "");
  return normalized || null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagMatchesGame(tag: string, gameName: string | null): boolean {
  if (!gameName) return true;
  const pattern = new RegExp(`(?:^|_)${escapeRegExp(gameName)}-`);
  return pattern.test(tag);
}

function buildMessageSigningPolicy(chain: string): Array<Record<string, unknown>> {
  const chainDomain = chain === "mainnet" ? "SN_MAIN" : "SN_SEPOLIA";
  return [
    {
      name: "Eternum Message Signing",
      description: "Allows signing messages for Eternum",
      types: {
        StarknetDomain: [
          { name: "name", type: "shortstring" },
          { name: "version", type: "shortstring" },
          { name: "chainId", type: "shortstring" },
          { name: "revision", type: "shortstring" },
        ],
        "s1_eternum-Message": [
          { name: "identity", type: "ContractAddress" },
          { name: "channel", type: "shortstring" },
          { name: "content", type: "string" },
          { name: "timestamp", type: "felt" },
          { name: "salt", type: "felt" },
        ],
      },
      primaryType: "s1_eternum-Message",
      domain: {
        name: "Eternum",
        version: "1",
        chainId: chainDomain,
        revision: "1",
      },
    },
  ];
}

/**
 * Extract all function entrypoints from a contract's ABI.
 * Reads interface items of type "function" and returns them as PolicyMethods.
 */
function extractEntrypointsFromAbi(abi: unknown[]): PolicyMethod[] {
  const methods: PolicyMethod[] = [];
  for (const entry of abi) {
    const item = entry as Record<string, unknown>;
    if (item.type === "interface" && Array.isArray(item.items)) {
      for (const fn of item.items as Record<string, unknown>[]) {
        if (fn.type === "function" && typeof fn.name === "string") {
          methods.push({ name: fn.name, entrypoint: fn.name });
        }
      }
    }
  }
  return methods;
}

export function buildSessionPoliciesFromManifest(
  manifest: SessionManifest,
  options: BuildSessionPolicyOptions = {},
): SessionPolicies {
  const contracts: Record<string, { methods: PolicyMethod[] }> = {};
  const entries = Array.isArray(manifest.contracts) ? manifest.contracts : [];
  const gameName = normalizeGameName(options.gameName);
  const profile = options.worldProfile;

  for (const contract of entries) {
    const item = contract as Record<string, unknown>;
    const tag = normalizeTag(item.tag);
    const address = normalizeAddress(item.address);
    if (!tag || !address) continue;
    if (!tagMatchesGame(tag, gameName)) continue;

    // Extract every function entrypoint from the contract ABI
    const abi = Array.isArray(item.abi) ? item.abi : [];
    const methods = extractEntrypointsFromAbi(abi);
    if (methods.length === 0) continue;

    contracts[address] = { methods };
  }

  // Add VRF provider policy
  contracts[VRF_PROVIDER_ADDRESS] = {
    methods: [{ name: "VRF", entrypoint: "request_random", description: "Verifiable Random Function" }],
  };

  // Add token policies from WorldProfile
  if (profile?.entryTokenAddress && profile.entryTokenAddress !== "0x0") {
    contracts[profile.entryTokenAddress] = {
      methods: [{ name: "token_lock", entrypoint: "token_lock" }],
    };
  }
  if (profile?.feeTokenAddress) {
    contracts[profile.feeTokenAddress] = {
      methods: [{ name: "approve", entrypoint: "approve" }],
    };
  }

  if (Object.keys(contracts).length === 0) {
    const gameSuffix = gameName ? ` for game '${gameName}'` : "";
    throw new Error(
      `Could not derive Controller session policies from manifest${gameSuffix}: no recognized system contracts found`,
    );
  }

  const chain = profile?.chain ?? "slot";
  return { contracts, messages: buildMessageSigningPolicy(chain) } as SessionPolicies;
}

export class ControllerSession {
  private provider: SessionProvider;
  private _callbackPromise?: Promise<string>;
  private _resolveCallback?: ((data: string) => void) | null;

  constructor(config: ControllerSessionConfig) {
    const policies = buildSessionPoliciesFromManifest(config.manifest, {
      gameName: config.gameName,
      worldProfile: config.worldProfile,
    });
    this.provider = new SessionProvider({
      rpc: config.rpcUrl,
      chainId: config.chainId,
      policies,
      basePath: config.basePath ?? ".cartridge",
    });

    const backend = (this.provider as any)._backend;
    if (backend) {
      // Patch openLink: either capture URL via callback or open browser
      if (config.onAuthUrl) {
        const callback = config.onAuthUrl;
        backend.openLink = (url: string) => {
          callback(url);
        };
      } else {
        backend.openLink = (url: string) => {
          const openCmd = process.platform === "darwin" ? "open" : "xdg-open";
          execFile(openCmd, [url]);
        };
      }

      // Override redirect URI when a custom callback URL is provided.
      // This replaces the localhost callback server with an external URL
      // (e.g. a public VPS endpoint) so remote browsers can redirect back.
      if (config.callbackUrl) {
        const customUrl = config.callbackUrl;
        // Store a resolver so feedCallbackData() can complete the connect() flow
        let resolveCallback: ((data: string) => void) | null = null;
        this._callbackPromise = new Promise<string>((resolve) => {
          resolveCallback = resolve;
        });
        this._resolveCallback = resolveCallback;

        backend.getRedirectUri = async () => customUrl;
        backend.waitForCallback = () => this._callbackPromise;
      }
    }
  }

  /**
   * Check for an existing valid session on disk.
   * Returns the account if a session exists and hasn't expired, null otherwise.
   * Does NOT trigger the browser auth flow.
   */
  async probe(): Promise<WalletAccount | null> {
    const account = await this.provider.probe();
    return account ?? null;
  }

  /**
   * Connect to the Cartridge Controller.
   *
   * 1. Checks for an existing session on disk (probe).
   * 2. If none, prints an auth URL to stdout and waits up to 5 minutes
   *    for the human to approve in their browser.
   * 3. Returns the session account once authorized.
   *
   * Throws if the callback times out or the session cannot be established.
   */
  async connect(): Promise<WalletAccount> {
    const account = await this.provider.connect();
    if (!account) {
      throw new Error(
        "Controller session not established. The human must open the printed URL and approve the session.",
      );
    }
    return account;
  }

  /**
   * Feed session data received from an external callback endpoint.
   * Used when callbackUrl is set — the API server receives the redirect
   * and passes the session data here to complete the connect() flow.
   */
  feedCallbackData(sessionData: string): void {
    if (this._resolveCallback) {
      this._resolveCallback(sessionData);
      this._resolveCallback = null;
    }
  }

  /**
   * Clear the stored session. Next connect() will require re-authorization.
   */
  async disconnect(): Promise<void> {
    await this.provider.disconnect();
  }
}
