import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  ctorCalls: [] as any[],
}));

vi.mock("@cartridge/controller/session/node", () => ({
  default: class {
    constructor(opts: unknown) {
      mocks.ctorCalls.push(opts);
    }

    async probe() {
      return undefined;
    }

    async connect() {
      return { address: "0xsession" };
    }

    async disconnect() {
      return undefined;
    }
  },
}));

import { ControllerSession, buildSessionPoliciesFromManifest } from "../../src/session/controller-session";

// Load real manifest once for all tests
const manifest = JSON.parse(readFileSync(join(__dirname, "../fixtures/manifest.json"), "utf-8"));

/** Helper: get entrypoints for a contract by tag substring */
function getEntrypoints(policies: any, tagSubstring: string): string[] {
  const contract = manifest.contracts.find((c: any) => c.tag.endsWith(tagSubstring));
  if (!contract) return [];
  return (policies.contracts?.[contract.address]?.methods ?? []).map((m: any) => m.entrypoint);
}

/** Helper: get contract address by tag substring */
function getAddress(tagSubstring: string): string {
  return manifest.contracts.find((c: any) => c.tag.endsWith(tagSubstring))?.address ?? "";
}

describe("controller session policies", () => {
  it("builds policies from all manifest contracts with ABIs", () => {
    const policies = buildSessionPoliciesFromManifest(manifest);

    // Every contract with ABI functions should have policies
    const resourceAddr = getAddress("resource_systems");
    expect(policies.contracts?.[resourceAddr]).toBeDefined();

    const guildAddr = getAddress("guild_systems");
    expect(policies.contracts?.[guildAddr]).toBeDefined();
  });

  it("extracts all function entrypoints from contract ABIs", () => {
    const policies = buildSessionPoliciesFromManifest(manifest);

    // resource_systems should have send, pickup, approve, etc.
    const resourceEps = getEntrypoints(policies, "-resource_systems");
    expect(resourceEps).toContain("send");
    expect(resourceEps).toContain("pickup");
    expect(resourceEps).toContain("approve");
    expect(resourceEps).toContain("arrivals_offload");

    // production_systems
    const prodEps = getEntrypoints(policies, "production_systems");
    expect(prodEps).toContain("create_building");
    expect(prodEps).toContain("pause_building_production");
    expect(prodEps).toContain("burn_resource_for_labor_production");

    // swap_systems
    const swapEps = getEntrypoints(policies, "swap_systems");
    expect(swapEps).toContain("buy");
    expect(swapEps).toContain("sell");

    // structure_systems
    const structEps = getEntrypoints(policies, "-structure_systems");
    expect(structEps).toContain("level_up");
  });

  it("includes blitz realm entrypoints from ABI", () => {
    const policies = buildSessionPoliciesFromManifest(manifest);

    const blitzEps = getEntrypoints(policies, "blitz_realm_systems");
    expect(blitzEps).toContain("obtain_entry_token");
    expect(blitzEps).toContain("register");
    expect(blitzEps).toContain("make_hyperstructures");
    expect(blitzEps).toContain("create");
  });

  it("includes dojo_name and world_dispatcher on all system contracts", () => {
    const policies = buildSessionPoliciesFromManifest(manifest);

    for (const tag of ["resource_systems", "trade_systems", "guild_systems"]) {
      const eps = getEntrypoints(policies, tag);
      expect(eps).toContain("dojo_name");
      expect(eps).toContain("world_dispatcher");
    }
  });

  it("skips contracts with empty ABIs", () => {
    const policies = buildSessionPoliciesFromManifest(manifest);

    // mmr_systems and point_systems have no ABI functions
    const mmrAddr = getAddress("mmr_systems");
    const pointAddr = getAddress("point_systems");
    expect(policies.contracts?.[mmrAddr]).toBeUndefined();
    expect(policies.contracts?.[pointAddr]).toBeUndefined();
  });

  it("filters contracts by game name when provided", () => {
    const policies = buildSessionPoliciesFromManifest(manifest, { gameName: "eternum" });

    // Should include eternum contracts
    const resourceAddr = getAddress("resource_systems");
    expect(policies.contracts?.[resourceAddr]).toBeDefined();
  });

  it("passes generated policies to SessionProvider", () => {
    new ControllerSession({
      rpcUrl: "http://localhost:5050",
      chainId: "SN_SEPOLIA",
      basePath: ".cartridge",
      gameName: "eternum",
      manifest,
    });

    expect(mocks.ctorCalls).toHaveLength(1);
    const opts = mocks.ctorCalls[0];
    expect(opts.basePath).toBe(".cartridge");

    const resourceAddr = getAddress("resource_systems");
    expect(opts.policies?.contracts?.[resourceAddr]).toBeDefined();
  });

  it("always includes VRF provider policy", () => {
    const policies = buildSessionPoliciesFromManifest(manifest);

    const vrfAddress = "0x051fea4450da9d6aee758bdeba88b2f665bcbf549d2c61421aa724e9ac0ced8f";
    expect(policies.contracts?.[vrfAddress]).toBeDefined();
    expect(policies.contracts?.[vrfAddress]?.methods?.some((m: any) => m.entrypoint === "request_random")).toBe(true);
  });

  it("includes token policies when worldProfile provides addresses", () => {
    const policies = buildSessionPoliciesFromManifest(manifest, {
      worldProfile: {
        name: "test",
        chain: "slot",
        toriiBaseUrl: "http://example.com",
        worldAddress: "0x1",
        contractsBySelector: {},
        entryTokenAddress: "0xentry",
        feeTokenAddress: "0xfee",
        fetchedAt: Date.now(),
      },
    });

    expect(policies.contracts?.["0xentry"]).toBeDefined();
    expect(policies.contracts?.["0xentry"]?.methods?.some((m: any) => m.entrypoint === "token_lock")).toBe(true);

    expect(policies.contracts?.["0xfee"]).toBeDefined();
    expect(policies.contracts?.["0xfee"]?.methods?.some((m: any) => m.entrypoint === "approve")).toBe(true);
  });

  it("skips entry token policy when address is 0x0", () => {
    const policies = buildSessionPoliciesFromManifest(manifest, {
      worldProfile: {
        name: "test",
        chain: "slot",
        toriiBaseUrl: "http://example.com",
        worldAddress: "0x1",
        contractsBySelector: {},
        entryTokenAddress: "0x0",
        fetchedAt: Date.now(),
      },
    });

    expect(policies.contracts?.["0x0"]).toBeUndefined();
  });

  it("includes message signing policy", () => {
    const policies = buildSessionPoliciesFromManifest(manifest) as any;

    expect(policies.messages).toBeDefined();
    expect(Array.isArray(policies.messages)).toBe(true);
    expect(policies.messages.length).toBeGreaterThan(0);
    expect(policies.messages[0].primaryType).toBe("s1_eternum-Message");
  });

  it("includes all system contract categories", () => {
    const policies = buildSessionPoliciesFromManifest(manifest);

    // Verify key systems are all present
    const systems = [
      "config_systems",
      "name_systems",
      "ownership_systems",
      "dev_resource_systems",
      "relic_systems",
      "season_systems",
      "village_systems",
      "blitz_realm_systems",
      "troop_movement_util_systems",
    ];

    for (const system of systems) {
      const addr = getAddress(system);
      expect(policies.contracts?.[addr]).toBeDefined();
    }
  });
});
