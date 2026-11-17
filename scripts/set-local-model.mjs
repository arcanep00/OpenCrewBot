import { createClient } from "@libsql/client";
import { resolve } from "node:path";

const dataDir = process.env.OPENCREWBOT_DATA_DIR ?? "./data";
const dbPath = resolve(dataDir, "opencrewbot.db");
const model = process.env.LM_STUDIO_MODEL ?? "nvidia/nemotron-3-nano-4b";
const db = createClient({ url: `file:${dbPath}` });

const rows = await db.execute("SELECT id, data FROM bots");
let updated = 0;

for (const row of rows.rows) {
  const bot = JSON.parse(String(row.data));
  if (bot.model !== model) {
    bot.model = model;
    await db.execute({
      sql: "UPDATE bots SET data = ? WHERE id = ?",
      args: [JSON.stringify(bot), String(row.id)],
    });
    console.log(`Updated ${bot.name} -> ${model}`);
    updated++;
  }
}

console.log(`Done. ${updated} bot(s) updated.`);
process.exit(0);
