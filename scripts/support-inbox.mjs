#!/usr/bin/env node
// Moon Club support inbox: reads parents' messages from the SUPPORT KV namespace (production).
//   npm run support:inbox                   newest first (default: 20)
//   npm run support:inbox -- --limit 50
//   npm run support:inbox -- --json         raw records
//   npm run support:inbox -- --delete <id>  remove one message after you've replied
// Messages expire on their own 180 days after they arrive. Needs `wrangler login`.
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const wrangler = (...a) => execFileSync("npx", ["wrangler", "kv", "key", ...a, "--binding", "SUPPORT", "--remote"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const del = flag("--delete");
if (args.includes("--delete")) {
  if (!del) { console.error("Usage: npm run support:inbox -- --delete <id>"); process.exit(1); }
  const id = del.replace(/^msg:/, "");
  if (!/^\d{13}-[0-9a-f]{8}$/.test(id)) { console.error(`That doesn't look like a message id: ${del}`); process.exit(1); }
  wrangler("delete", `msg:${id}`);
  console.log(`Deleted ${id}`);
  process.exit(0);
}

const limit = Math.max(1, Number(flag("--limit") ?? 20) || 20);
// KV lists keys in lexicographic order; ids invert the timestamp, so this is newest first.
const keys = JSON.parse(wrangler("list", "--prefix", "msg:")).slice(0, limit);
if (!keys.length) { console.log("Inbox is empty. 🌙"); process.exit(0); }

const records = keys.map((k) => {
  try { return JSON.parse(wrangler("get", k.name, "--text")); } catch { return { id: k.name.slice(4), at: k.metadata?.at ?? "?", message: "(couldn't read this one)" }; }
});
if (args.includes("--json")) { console.log(JSON.stringify(records, null, 2)); process.exit(0); }

const when = (iso) => { const d = new Date(iso); return isNaN(+d) ? iso : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); };
console.log(`${records.length} message${records.length === 1 ? "" : "s"}, newest first\n`);
for (const r of records) {
  console.log(`── ${r.id}  ·  ${when(r.at)}`);
  console.log(`   Reply to: ${r.email ?? "(no email given)"}${r.device ? `   Device: ${r.device}` : ""}`);
  console.log(r.message.split("\n").map((l) => `   ${l}`).join("\n"));
  console.log("");
}
console.log("Delete one after replying: npm run support:inbox -- --delete <id>");
