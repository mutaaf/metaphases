// Signs every non-core lesson pack for the curated remote channel (/api/kids/packs) and writes
// packs/channel.json. Ed25519 over the exact bytes the worker serves: JSON.stringify(pack).
//
// The PRIVATE key never enters the repo. It lives at ~/.config/metaphases/kids-pack-signing.jwk
// (or the env var KIDS_PACK_KEY, a private JWK as JSON). First run creates it; keep a backup — the
// app ships the matching PUBLIC key (MoonClubCore PackChannel.publicKey), so losing it means a new
// app build. A pack is listed (`ready: true`) only when channelReady(): it validates and the teacher,
// the markets expert AND a human signed it off (see docs/PACKS.md in the moon-club repo).
//
// Run: npm run packs:sign
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { channelReady, type LessonPack } from "../shared/kidsPacks";

const keyPath = join(homedir(), ".config", "metaphases", "kids-pack-signing.jwk");
function privateJwk(): any {
  if (process.env.KIDS_PACK_KEY) return JSON.parse(process.env.KIDS_PACK_KEY);
  if (existsSync(keyPath)) return JSON.parse(readFileSync(keyPath, "utf8"));
  const { privateKey } = generateKeyPairSync("ed25519");
  const jwk = privateKey.export({ format: "jwk" });
  mkdirSync(join(homedir(), ".config", "metaphases"), { recursive: true });
  writeFileSync(keyPath, JSON.stringify(jwk), { mode: 0o600 });
  console.log(`created a new signing key at ${keyPath} (back it up)`);
  return jwk;
}
const jwk = privateJwk();
const priv = createPrivateKey({ key: jwk, format: "jwk" });
const pub = createPublicKey(priv).export({ format: "jwk" }) as { x: string };
const publicKey = Buffer.from(pub.x, "base64url").toString("base64");

const packs = readdirSync("packs", { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "core" && existsSync(join("packs", d.name, "pack.json")))
  .map((d) => JSON.parse(readFileSync(join("packs", d.name, "pack.json"), "utf8")) as LessonPack);
const entries = packs.map((p) => {
  const bytes = Buffer.from(JSON.stringify(p), "utf8");
  return {
    id: p.id, version: p.version, title: p.title, kind: p.kind, creator: p.creator?.name ?? null,
    ready: channelReady(p),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sig: sign(null, bytes, priv).toString("base64"),
  };
});
writeFileSync("packs/channel.json", JSON.stringify({ format: 1, publicKey, packs: entries }, null, 2) + "\n");
console.log(`signed ${entries.length} pack(s): ${entries.map((e) => `${e.id}${e.ready ? "" : " (not ready: needs every sign-off)"}`).join(", ")}`);
