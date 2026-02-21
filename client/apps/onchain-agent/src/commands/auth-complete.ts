import path from "node:path";
import { encode } from "starknet";
import { signerToGuid } from "@cartridge/controller-wasm";
import { loadConfig } from "../config";
import { readArtifacts, updateAuthStatus } from "../session/artifacts";
import { readFileSync, writeFileSync } from "node:fs";

interface AuthCompleteOptions {
  world?: string;
  sessionData?: string;
  redirectUrl?: string;
  json: boolean;
  write: (s: string) => void;
}

/**
 * Extract the startapp session data from either:
 * - Raw base64 session data string
 * - A full redirect URL containing ?startapp=<data>
 */
function extractSessionData(options: AuthCompleteOptions): string | null {
  if (options.sessionData) {
    return options.sessionData;
  }
  if (options.redirectUrl) {
    try {
      const url = new URL(options.redirectUrl);
      return url.searchParams.get("startapp");
    } catch {
      // Maybe it's just the query string portion
      const match = options.redirectUrl.match(/[?&]startapp=([^&]+)/);
      return match ? match[1] : null;
    }
  }
  return null;
}

export async function runAuthComplete(options: AuthCompleteOptions): Promise<number> {
  if (!options.world) {
    const msg = "Usage: axis auth-complete <world> --session-data=<base64> OR --redirect-url=<url>";
    if (options.json) {
      options.write(JSON.stringify({ error: msg }));
    } else {
      options.write(`${msg}\n`);
    }
    return 1;
  }

  const sessionData = extractSessionData(options);
  if (!sessionData) {
    const msg = "Provide --session-data=<base64> or --redirect-url=<full callback URL>";
    if (options.json) {
      options.write(JSON.stringify({ error: msg }));
    } else {
      options.write(`${msg}\n`);
    }
    return 1;
  }

  const config = loadConfig();
  const worldDir = path.join(config.sessionBasePath, options.world);

  // Verify artifacts exist
  try {
    readArtifacts(worldDir);
  } catch {
    const msg = `No artifacts found for world "${options.world}". Run "axis auth ${options.world}" first.`;
    if (options.json) {
      options.write(JSON.stringify({ error: msg }));
    } else {
      options.write(`${msg}\n`);
    }
    return 1;
  }

  // Decode the session registration from base64
  let sessionRegistration: Record<string, unknown>;
  try {
    const decoded = Buffer.from(sessionData, "base64").toString("utf-8");
    sessionRegistration = JSON.parse(decoded);
  } catch {
    const msg = "Failed to decode session data. Ensure it's valid base64-encoded JSON.";
    if (options.json) {
      options.write(JSON.stringify({ error: msg }));
    } else {
      options.write(`${msg}\n`);
    }
    return 1;
  }

  // Read the existing session.json to get the signer keypair
  const sessionFilePath = path.join(worldDir, "session.json");
  let signerData: { privKey: string; pubKey: string };
  try {
    const raw = readFileSync(sessionFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    // The signer might be stored as a JSON string or as an object
    const signerRaw = parsed.signer ?? parsed;
    signerData = typeof signerRaw === "string" ? JSON.parse(signerRaw) : signerRaw;
  } catch {
    const msg = 'No session.json with signer keypair found. Run "axis auth" first to generate keys.';
    if (options.json) {
      options.write(JSON.stringify({ error: msg }));
    } else {
      options.write(`${msg}\n`);
    }
    return 1;
  }

  // Mirror exactly what SessionProvider.connect() does:
  // 1. lowercase address and ownerGuid
  // 2. set guardianKeyGuid and metadataHash to "0x0"
  // 3. compute sessionKeyGuid from the public key via signerToGuid
  const formattedPk = encode.addHexPrefix(signerData.pubKey);

  sessionRegistration.address = typeof sessionRegistration.address === "string"
    ? sessionRegistration.address.toLowerCase()
    : sessionRegistration.address;

  sessionRegistration.ownerGuid = typeof sessionRegistration.ownerGuid === "string"
    ? sessionRegistration.ownerGuid.toLowerCase()
    : sessionRegistration.ownerGuid;

  sessionRegistration.guardianKeyGuid = "0x0";
  sessionRegistration.metadataHash = "0x0";
  sessionRegistration.sessionKeyGuid = signerToGuid({
    starknet: { privateKey: formattedPk },
  });

  // Write in the same format as SessionProvider's NodeBackend:
  // { "signer": "<json-string>", "session": "<json-string>" }
  const backendData: Record<string, string> = {};
  backendData["signer"] = JSON.stringify(signerData);
  backendData["session"] = JSON.stringify(sessionRegistration);

  writeFileSync(sessionFilePath, JSON.stringify(backendData, null, 2));

  // Update auth.json
  const address = sessionRegistration.address as string;
  updateAuthStatus(worldDir, {
    status: "active",
    address,
  });

  const result = {
    world: options.world,
    status: "active",
    address,
  };

  if (options.json) {
    options.write(JSON.stringify(result, null, 2));
  } else {
    options.write(`  Session activated for ${options.world} (${address})\n`);
  }

  return 0;
}
