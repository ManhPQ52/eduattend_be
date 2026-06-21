import { initDb, query, closeDb } from "../dist/db/index.js";
import { isSessionActive } from "../dist/utils/helpers.js";

await initDb();
const rows = await query(
  "SELECT * FROM attendance_sessions WHERE status = 'open' LIMIT 1"
);
const s = rows[0];
console.log("Session:", {
  id: s.id,
  date: s.date,
  opened_at: s.opened_at,
  expires_at: s.expires_at,
});
console.log("isSessionActive:", isSessionActive(s));
console.log(
  "Now (VN):",
  new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
);
await closeDb();
