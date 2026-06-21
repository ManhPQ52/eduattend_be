import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { closeDb } from "./db/index.js";

const app = await createApp();

const server = app.listen(config.port, () => {
  console.log(`EduAttend API running on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
