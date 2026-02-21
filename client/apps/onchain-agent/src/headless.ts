import { EternumClient } from "@bibliothecadao/client";
import {
  createHeartbeatLoop,
  createGameAgent,
  type HeartbeatJob,
  type RuntimeConfigManager,
} from "@bibliothecadao/game-agent";
import { getModel } from "@mariozechner/pi-ai";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { AccountInterface } from "starknet";
import { createShutdownGate } from "./shutdown-gate";
import { type AgentConfig, loadConfig } from "./config";
import { EternumGameAdapter } from "./adapter/eternum-adapter";
import { MutableGameAdapter } from "./adapter/mutable-adapter";
import { ControllerSession } from "./session";
import { readArtifacts } from "./session/artifacts";
import { createPrivateKeyAccount } from "./session/privatekey-auth";
import { deriveChainIdFromRpcUrl } from "./world/normalize";
import { createInspectTools } from "./tools/inspect-tools";
import { getActionDefinitions } from "./adapter/action-registry";
import { formatEternumTickPrompt, type EternumWorldState } from "./adapter/world-state";
import { JsonEmitter } from "./output/json-emitter";
import { createApiServer } from "./api/server";
import { startStdinReader } from "./input/stdin-reader";
import type { CliOptions } from "./cli-args";

function loadReferenceHandbooks(dataDir: string): string {
  const taskDir = path.join(dataDir, "tasks");
  if (!existsSync(taskDir)) return "";

  const sections: string[] = [];
  let files: string[];
  try {
    files = readdirSync(taskDir).filter((f: string) => f.endsWith(".md")).sort();
  } catch {
    return "";
  }

  for (const file of files) {
    const raw = readFileSync(path.join(taskDir, file), "utf-8");
    const autoloadMatch = raw.match(/^---\n[\s\S]*?autoload:\s*(true|false)[\s\S]*?\n---/);
    if (autoloadMatch && autoloadMatch[1] === "true") continue;
    if (!raw.startsWith("---\n")) continue;

    const domain = file.replace(/\.md$/, "");
    const content = raw.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    if (content) {
      sections.push(`<reference domain="${domain}">\n${content}\n</reference>`);
    }
  }

  if (sections.length === 0) return "";
  return `## Reference Handbooks (study these before acting)\n\n${sections.join("\n\n")}`;
}

export async function mainHeadless(options: CliOptions): Promise<void> {
  const config = loadConfig();

  const emitter = new JsonEmitter({
    verbosity: options.verbosity,
    write: (line) => process.stdout.write(line + "\n"),
  });

  // Read artifacts from session directory
  const worldDir = path.join(config.sessionBasePath, options.world!);
  const artifacts = readArtifacts(worldDir);

  // Override config from artifacts
  config.rpcUrl = artifacts.profile.rpcUrl ?? config.rpcUrl;
  config.toriiUrl = `${artifacts.profile.toriiBaseUrl}/sql`;
  config.worldAddress = artifacts.profile.worldAddress;
  config.chainId = deriveChainIdFromRpcUrl(config.rpcUrl) ?? config.chainId;
  config.chain = artifacts.profile.chain;

  // Create account (session or privatekey)
  let account: AccountInterface;
  let session: ControllerSession | null = null;

  if (options.auth === "privatekey") {
    const privateKey = process.env.PRIVATE_KEY ?? "";
    const accountAddress = process.env.ACCOUNT_ADDRESS ?? "";
    account = createPrivateKeyAccount(config.rpcUrl, privateKey, accountAddress);
  } else {
    const sessionBasePath = path.join(config.sessionBasePath, options.world!);
    session = new ControllerSession({
      rpcUrl: config.rpcUrl,
      chainId: config.chainId,
      gameName: config.gameName,
      basePath: sessionBasePath,
      manifest: artifacts.manifest,
      worldProfile: artifacts.profile,
    });
    account = await session.connect();
  }

  // Create Eternum client
  const client = await EternumClient.create({
    rpcUrl: config.rpcUrl,
    toriiUrl: config.toriiUrl,
    worldAddress: config.worldAddress,
    manifest: artifacts.manifest,
  });
  client.connect(account as any);

  const adapter = new EternumGameAdapter(client, account as any, account.address);
  const mutableAdapter = new MutableGameAdapter(adapter);

  emitter.emit({
    type: "startup",
    world: options.world,
    chain: artifacts.profile.chain,
    address: account.address,
  });

  // Create game agent
  const model = getModel(config.modelProvider, config.modelId);
  let isFirstTick = true;
  const formatTickPromptWithHandbooks = (state: EternumWorldState): string => {
    const base = formatEternumTickPrompt(state);
    if (isFirstTick) {
      isFirstTick = false;
      const handbooks = loadReferenceHandbooks(config.dataDir);
      if (handbooks) {
        return `${handbooks}\n\n---\n\n${base}\n\nIMPORTANT: This is your first tick. Study the reference handbooks above carefully before taking any actions. Write key insights to tasks/learnings.md so you retain them.`;
      }
    }
    return base;
  };

  const runtimeConfigManager: RuntimeConfigManager = {
    getConfig: () => ({ ...config }),
    applyChanges: async (changes, _reason) => ({
      ok: true,
      results: changes.map((c) => ({ path: c.path, applied: true, message: "applied" })),
      currentConfig: { ...config },
    }),
  };

  const game = createGameAgent({
    adapter: mutableAdapter,
    dataDir: config.dataDir,
    model,
    tickIntervalMs: config.tickIntervalMs,
    runtimeConfigManager,
    extraTools: createInspectTools(client),
    actionDefs: getActionDefinitions(),
    formatTickPrompt: formatTickPromptWithHandbooks,
    onTickError: (err) => {
      emitter.emit({ type: "error", message: `Tick error: ${err.message}` });
    },
  });

  const { agent, ticker, dispose: disposeAgent } = game;

  // Subscribe to agent events and map to emitter
  agent.subscribe((event) => {
    switch (event.type) {
      case "agent_start":
        break;
      case "agent_end":
        break;
      case "tool_execution_start":
        emitter.emit({
          type: "action",
          tick: ticker.tickCount,
          action: event.toolName,
          params: event.args,
          status: "started",
        });
        break;
      case "tool_execution_end":
        emitter.emit({
          type: "action",
          tick: ticker.tickCount,
          action: event.toolName,
          status: event.isError ? "fail" : "ok",
        });
        break;
      case "message_end":
        if (event.message.role === "assistant") {
          const content = event.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text" && block.text.trim()) {
                emitter.emit({
                  type: "decision",
                  tick: ticker.tickCount,
                  reasoning: block.text.slice(0, 500),
                  actions: [],
                });
              }
            }
          }
        }
        break;
    }
  });

  // Heartbeat
  const heartbeat = createHeartbeatLoop({
    getHeartbeatPath: () => path.join(config.dataDir, "HEARTBEAT.md"),
    onRun: async (job: HeartbeatJob) => {
      emitter.emit({ type: "heartbeat", job: job.id, mode: job.mode });
      const modeGuidance =
        job.mode === "observe"
          ? "Observe-only heartbeat: do not execute on-chain actions. You may read and update markdown/task files."
          : "Action-enabled heartbeat: you may execute actions if justified.";
      const heartbeatPrompt = [
        `## Heartbeat Job: ${job.id}`,
        `Schedule: ${job.schedule}`,
        `Mode: ${job.mode}`,
        modeGuidance,
        "Follow the job instructions below:",
        job.prompt,
      ].join("\n\n");
      await game.enqueuePrompt(heartbeatPrompt);
    },
    onError: (error) => {
      emitter.emit({ type: "error", message: `Heartbeat error: ${error.message}` });
    },
  });

  // Shutdown gate
  const gate = createShutdownGate();

  const shutdown = async () => {
    emitter.emit({ type: "shutdown", reason: "requested" });
    heartbeat.stop();
    ticker.stop();
    await disposeAgent();
    client.disconnect();
    if (apiClose) await apiClose();
    if (stdinClose) stdinClose();
    gate.shutdown();
  };

  // HTTP API
  let apiClose: (() => Promise<void>) | null = null;
  if (options.apiPort) {
    const { close } = createApiServer(
      {
        enqueuePrompt: async (content) => {
          emitter.emit({ type: "prompt", source: "http", content });
          await game.enqueuePrompt(content);
        },
        getStatus: () => ({
          tick: ticker.tickCount,
          session: "active",
          loopEnabled: config.loopEnabled,
          world: options.world,
        }),
        getState: () => ({}),
        shutdown,
        applyConfig: async (changes) => runtimeConfigManager.applyChanges(changes),
        emitter,
      },
      options.apiPort,
      options.apiHost ?? "127.0.0.1",
    );
    apiClose = close;
    emitter.emit({
      type: "startup",
      message: `HTTP API listening on ${options.apiHost ?? "127.0.0.1"}:${options.apiPort}`,
    });
  }

  // Stdin reader
  let stdinClose: (() => void) | null = null;
  if (options.stdin || !process.stdin.isTTY) {
    stdinClose = startStdinReader({
      enqueuePrompt: async (content) => {
        emitter.emit({ type: "prompt", source: "stdin", content });
        await game.enqueuePrompt(content);
      },
      applyConfig: async (changes) => runtimeConfigManager.applyChanges(changes),
      shutdown,
    });
  }

  // Start loops
  if (config.loopEnabled) {
    ticker.start();
  }
  heartbeat.start();

  // Signal handlers
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return gate.promise;
}
