// src/index.ts
const command = process.argv[2];

if (command === "collect") {
  console.log("Collecting data...");
} else if (command === "serve") {
  console.log("Starting server...");
} else {
  console.log("Usage: bun run collect | bun run serve");
}
