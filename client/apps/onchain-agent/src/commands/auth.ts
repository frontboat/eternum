import path from "node:path";
import { loadConfig } from "../config";
import { discoverAllWorlds, buildWorldProfile, buildResolvedManifest } from "../world/discovery";
import { ControllerSession, buildSessionPoliciesFromManifest } from "../session/controller-session";
import { writeArtifacts, updateAuthStatus } from "../session/artifacts";
import { deriveChainIdFromRpcUrl } from "../world/normalize";
import type { DiscoveredWorld } from "../world/discovery";

interface AuthOptions {
  world?: string;
  all: boolean;
  approve: boolean;
  method?: string;
  username?: string;
  password?: string;
  json: boolean;
  write: (s: string) => void;
}

interface AuthResult {
  world: string;
  chain: string;
  status: string;
  url?: string;
  address?: string;
  artifactDir: string;
  error?: string;
}

async function authSingleWorld(
  world: DiscoveredWorld,
  options: AuthOptions,
): Promise<AuthResult> {
  const config = loadConfig();
  const worldDir = path.join(config.sessionBasePath, world.name);

  try {
    // 1. Build world profile and resolve manifest
    const profile = await buildWorldProfile(world.chain, world.name);
    const manifest = await buildResolvedManifest(world.chain, profile);
    const policies = buildSessionPoliciesFromManifest(manifest, {
      gameName: config.gameName,
      worldProfile: profile,
    });

    // 2. Capture auth URL via callback
    let authUrl = "";
    const chainId = deriveChainIdFromRpcUrl(profile.rpcUrl ?? "") ?? config.chainId;

    const sessionBasePath = path.join(config.sessionBasePath, world.name);

    const session = new ControllerSession({
      rpcUrl: profile.rpcUrl ?? config.rpcUrl,
      chainId,
      gameName: config.gameName,
      basePath: sessionBasePath,
      manifest,
      worldProfile: profile,
      onAuthUrl: (url) => {
        authUrl = url;
      },
    });

    // 3. Write artifacts
    writeArtifacts(worldDir, {
      profile,
      manifest,
      policy: policies as Record<string, unknown>,
      auth: {
        url: "", // will be updated after connect triggers URL generation
        status: "pending",
        worldName: world.name,
        chain: world.chain,
        createdAt: new Date().toISOString(),
      },
    });

    // 4. Check for existing session first
    const existing = await session.probe();
    if (existing) {
      updateAuthStatus(worldDir, {
        status: "active",
        address: existing.address,
      });
      return {
        world: world.name,
        chain: world.chain,
        status: "active",
        address: existing.address,
        artifactDir: worldDir,
      };
    }

    // 5. Trigger connect (generates auth URL, starts polling)
    // Run in background so we can capture the URL and optionally auto-approve
    const connectPromise = session.connect();

    // Wait a moment for the URL to be captured via the callback
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (authUrl) {
      updateAuthStatus(worldDir, { url: authUrl });
    }

    // 6. If --approve, run auth-approve
    if (options.approve && authUrl) {
      try {
        const { runAuthApprove } = await import("../session/auth-approve");
        await runAuthApprove({
          authUrl,
          method: options.method ?? "password",
          username: options.username,
          password: options.password,
        });
      } catch (approveErr) {
        const errorMsg = approveErr instanceof Error ? approveErr.message : String(approveErr);
        updateAuthStatus(worldDir, { status: "pending" });
        return {
          world: world.name,
          chain: world.chain,
          status: "pending",
          url: authUrl,
          artifactDir: worldDir,
          error: `Auto-approve failed: ${errorMsg}`,
        };
      }
    }

    // 7. Wait for session approval
    try {
      const account = await connectPromise;
      updateAuthStatus(worldDir, {
        status: "active",
        address: account.address,
      });
      return {
        world: world.name,
        chain: world.chain,
        status: "active",
        address: account.address,
        url: authUrl,
        artifactDir: worldDir,
      };
    } catch {
      return {
        world: world.name,
        chain: world.chain,
        status: "pending",
        url: authUrl,
        artifactDir: worldDir,
        error: "Session not approved within timeout",
      };
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      world: world.name,
      chain: world.chain,
      status: "error",
      artifactDir: worldDir,
      error: errorMsg,
    };
  }
}

export async function runAuth(options: AuthOptions): Promise<number> {
  const worlds = await discoverAllWorlds();

  const targets = options.all
    ? worlds
    : worlds.filter((w) => w.name === options.world);

  if (targets.length === 0) {
    const msg = options.world
      ? `World "${options.world}" not found. Available: ${worlds.map((w) => w.name).join(", ")}`
      : "No worlds discovered";
    if (options.json) {
      options.write(JSON.stringify({ error: msg }));
    } else {
      options.write(`${msg}\n`);
    }
    return 1;
  }

  const results: AuthResult[] = [];

  for (const world of targets) {
    if (!options.json) {
      options.write(`Authenticating [${world.chain}] ${world.name}...\n`);
    }
    const result = await authSingleWorld(world, options);
    results.push(result);
  }

  if (options.json) {
    options.write(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  } else {
    for (const r of results) {
      if (r.status === "active") {
        options.write(`  [${r.chain}] ${r.world}: active (${r.address})\n`);
      } else if (r.url) {
        options.write(`  [${r.chain}] ${r.world}: pending — approve at: ${r.url}\n`);
      } else if (r.error) {
        options.write(`  [${r.chain}] ${r.world}: ${r.error}\n`);
      }
    }
  }

  const allActive = results.every((r) => r.status === "active");
  return allActive ? 0 : 1;
}
