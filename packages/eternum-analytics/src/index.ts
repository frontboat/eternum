// src/index.ts
import { runCollect } from "./commands/collect.js";
import { startServer } from "./api/server.js";

const command = process.argv[2];
const flags = process.argv.slice(3);

async function main() {
  if (command === "collect") {
    const full = flags.includes("--full");
    await runCollect({ full });
  } else if (command === "serve") {
    const port = parseInt(process.env.PORT || "3000");
    startServer(port);
  } else {
    console.log("Usage:");
    console.log("  bun run collect [--full]  Collect data from Torii");
    console.log("  bun run serve             Start API server");
  }
}

main().catch(console.error);
