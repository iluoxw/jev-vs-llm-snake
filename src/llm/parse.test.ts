import { describe, expect, it } from "vitest";
import { completionsUrl } from "./env.ts";
import { estimateUsd, parseChoice, probabilitiesFor } from "./parse.ts";

describe("completionsUrl", () => {
  it("keeps a full chat/completions URL", () => {
    expect(completionsUrl("https://token.cvte.com/v1/chat/completions")).toBe(
      "https://token.cvte.com/v1/chat/completions",
    );
  });

  it("appends chat/completions onto a /v1 base", () => {
    expect(completionsUrl("https://token.cvte.com/v1")).toBe("https://token.cvte.com/v1/chat/completions");
  });
});

describe("parseChoice", () => {
  const legal = ["up", "left"] as const;

  it("reads a bare JSON object", () => {
    expect(parseChoice('{"choice":"up"}', legal)).toBe("up");
  });

  it("strips markdown fences and ignores case", () => {
    expect(parseChoice('```json\n{"choice":"LEFT"}\n```', legal)).toBe("left");
  });

  it("recovers a choice field from surrounding prose", () => {
    expect(parseChoice('Sure. {"choice": "up"} thanks', legal)).toBe("up");
  });

  it("rejects illegal or missing choices", () => {
    expect(parseChoice('{"choice":"down"}', legal)).toBeNull();
    expect(parseChoice("go somewhere", legal)).toBeNull();
  });
});

describe("estimateUsd", () => {
  it("returns null when usage is missing", () => {
    expect(estimateUsd(null, null, 1, 2)).toBeNull();
  });

  it("treats a missing side as zero tokens", () => {
    expect(estimateUsd(1_000_000, null, 3, 4)).toBe(3);
    expect(estimateUsd(null, 2_000_000, 3, 4)).toBe(8);
  });
});

describe("probabilitiesFor", () => {
  it("puts 1 on the chosen legal move", () => {
    expect(probabilitiesFor("left", ["up", "left"])).toEqual({ up: 0, left: 1 });
  });
});
