// src/index.ts
import { runCollect } from "./commands/collect.js";
import { startServer } from "./api/server.js";

const command = process.argv[2];
const flags = process.argv.slice(3);

async function main() {
  if (command === "collect") {
    const full = flags.includes("--full");
    const quiet = flags.includes("--quiet") || flags.includes("-q");
    const limitFlag = flags.find(f => f.startsWith("--limit="));
    const limit = limitFlag ? parseInt(limitFlag.split("=")[1]) : undefined;
    await runCollect({ full, limit, quiet });
  } else if (command === "serve") {
    const port = parseInt(process.env.PORT || "3000");
    startServer(port);
  } else {
    console.log("Usage:");
    console.log("  bun run collect [--full] [--limit=N] [-q]  Collect data from Torii");
    console.log("  bun run serve                              Start API server");
  }
}

main().catch(console.error);
