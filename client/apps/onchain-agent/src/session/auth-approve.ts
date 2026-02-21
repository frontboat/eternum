import { execFileSync } from "node:child_process";

interface ApproveOptions {
  authUrl: string;
  method: string;
  username?: string;
  password?: string;
}

function agentBrowser(...args: string[]): string {
  return execFileSync("agent-browser", args, { encoding: "utf-8", timeout: 60000 });
}

export function checkAgentBrowserInstalled(): boolean {
  try {
    execFileSync("which", ["agent-browser"], { encoding: "utf-8" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse snapshot output to find interactive element refs.
 * Snapshot lines look like: @e1 [input type="email"] "placeholder text"
 */
function parseSnapshotRefs(snapshot: string): Array<{ ref: string; tag: string; type?: string; text?: string }> {
  const refs: Array<{ ref: string; tag: string; type?: string; text?: string }> = [];
  for (const line of snapshot.split("\n")) {
    const match = line.match(/^(@e\d+)\s+\[(\w+)(?:\s+type="([^"]*)")?\](?:\s+"([^"]*)")?/);
    if (match) {
      refs.push({
        ref: match[1],
        tag: match[2],
        type: match[3],
        text: match[4],
      });
    }
  }
  return refs;
}

async function approveWithPassword(options: ApproveOptions): Promise<void> {
  if (!options.username || !options.password) {
    throw new Error("--username and --password required for password auth method");
  }

  // Open the auth URL
  agentBrowser("open", options.authUrl);
  agentBrowser("wait", "--load", "networkidle");

  // Snapshot to discover form elements
  const snapshot = agentBrowser("snapshot", "-i");
  const refs = parseSnapshotRefs(snapshot);

  // Find username/email and password inputs
  const emailInput = refs.find((r) => r.tag === "input" && (r.type === "email" || r.type === "text"));
  const passwordInput = refs.find((r) => r.tag === "input" && r.type === "password");
  const submitButton = refs.find((r) => r.tag === "button");

  if (!emailInput || !passwordInput) {
    throw new Error(
      `Could not find login form fields in auth page. Found refs: ${refs.map((r) => `${r.ref}[${r.tag}/${r.type}]`).join(", ")}`,
    );
  }

  // Fill credentials and submit
  agentBrowser("fill", emailInput.ref, options.username);
  agentBrowser("fill", passwordInput.ref, options.password);

  if (submitButton) {
    agentBrowser("click", submitButton.ref);
  } else {
    agentBrowser("press", "Enter");
  }

  agentBrowser("wait", "--load", "networkidle");

  // Look for policy approval page
  const policySnapshot = agentBrowser("snapshot", "-i");
  const policyRefs = parseSnapshotRefs(policySnapshot);
  const approveButton = policyRefs.find(
    (r) => r.tag === "button" && r.text && /approve|confirm|allow|accept/i.test(r.text),
  );

  if (approveButton) {
    agentBrowser("click", approveButton.ref);
    agentBrowser("wait", "--load", "networkidle");
  }

  agentBrowser("close");
}

export async function runAuthApprove(options: ApproveOptions): Promise<void> {
  if (!checkAgentBrowserInstalled()) {
    throw new Error(
      `agent-browser not found -- install it or complete auth manually at: ${options.authUrl}`,
    );
  }

  switch (options.method) {
    case "password":
      await approveWithPassword(options);
      break;
    default:
      throw new Error(
        `Auth method "${options.method}" is not yet supported for auto-approve. Supported: password`,
      );
  }
}
