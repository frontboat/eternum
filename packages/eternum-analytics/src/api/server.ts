// src/api/server.ts
import { createRoutes } from "./routes.js";
import { serveStatic } from "hono/bun";

export function startServer(port: number = 3000) {
  const app = createRoutes();

  // Serve static dashboard
  app.use("/*", serveStatic({ root: "./dashboard" }));

  console.log(`Server running at http://localhost:${port}`);
  console.log(`  API: http://localhost:${port}/api/metrics/summary`);
  console.log(`  Dashboard: http://localhost:${port}/`);

  return Bun.serve({
    port,
    fetch: app.fetch,
  });
}
