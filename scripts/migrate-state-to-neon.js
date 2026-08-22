const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

const ROOT = path.resolve(__dirname, "..");

function loadEnvironment(fileName) {
  const file = path.join(ROOT, fileName);
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value;
  }
}

loadEnvironment(".env.local");
loadEnvironment(".env");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Link the Vercel project and pull its environment first.");
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "vortex-data.json"), "utf8"));
  const sql = neon(process.env.DATABASE_URL);
  await sql`CREATE TABLE IF NOT EXISTS vortex_state (
    id integer PRIMARY KEY,
    payload jsonb NOT NULL,
    version bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  const rows = await sql`SELECT payload FROM vortex_state WHERE id = 1`;
  const existing = rows[0]?.payload || {};
  const hasExistingData = Object.values(existing).some(value => Array.isArray(value) && value.length > 0);
  if (hasExistingData && !process.argv.includes("--force")) throw new Error("The production state already contains data. Re-run with --force only after taking a backup.");
  const payload = JSON.stringify(source);
  await sql`INSERT INTO vortex_state (id, payload, version, updated_at) VALUES (1, ${payload}::jsonb, 1, now())
    ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, version = vortex_state.version + 1, updated_at = now()`;
  const counts = Object.fromEntries(Object.entries(source).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length]));
  console.log("Neon migration complete.");
  console.log(JSON.stringify(counts, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

