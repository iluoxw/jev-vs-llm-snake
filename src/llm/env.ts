import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Load `.env` and overwrite existing process.env keys (tsx --env-file will not). */
export function loadDotEnv(path = resolve(process.cwd(), ".env")) {
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/** Accept `/v1`, a host root, or a full `.../chat/completions` URL. */
export function completionsUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  if (trimmed.endsWith("/v3")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}
