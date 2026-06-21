import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { closeDb } from "./db/index.js";

let server: ReturnType<typeof import("http").createServer>;

try {
  const app = await createApp();
  server = app.listen(config.port, () => {
    console.log(`EduAttend API running on http://localhost:${config.port}`);
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

async function shutdown() {
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
