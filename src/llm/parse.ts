import { DIRS, type Dir } from "../game/engine.ts";

export function estimateUsd(
  inputTokens: number | null,
  outputTokens: number | null,
  inputUsdPerMtok: number,
  outputUsdPerMtok: number,
): number | null {
  if (inputTokens == null && outputTokens == null) return null;
  return ((inputTokens ?? 0) * inputUsdPerMtok + (outputTokens ?? 0) * outputUsdPerMtok) / 1e6;
}

/** Pull a legal direction out of a chat-completion string. */
export function parseChoice(text: string, legal: readonly Dir[]): Dir | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let choice: unknown;
  try {
    choice = (JSON.parse(cleaned) as { choice?: unknown }).choice;
  } catch {
    const match = cleaned.match(/"choice"\s*:\s*"(up|down|left|right)"/i);
    choice = match?.[1];
  }

  if (typeof choice !== "string") return null;
  const dir = choice.toLowerCase() as Dir;
  if (!DIRS.includes(dir) || !legal.includes(dir)) return null;
  return dir;
}

export function probabilitiesFor(choice: Dir, legal: readonly Dir[]): Partial<Record<Dir, number>> {
  const probabilities: Partial<Record<Dir, number>> = {};
  for (const dir of legal) probabilities[dir] = dir === choice ? 1 : 0;
  return probabilities;
}
