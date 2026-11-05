import type { CyberRoll } from "./types";
import type { DiceRollResult } from "../dice";
export function visualCyberRoll(r: CyberRoll): DiceRollResult {
  const dice = r.dice.map((value, i) => {
    const sign = (
      ["skill", "interface"].includes(r.kind) && r.dice[0] === 1 && i === 1
        ? -1
        : 1
    ) as 1 | -1;
    return {
      sides: r.sides as 6 | 10,
      value,
      sign,
      signedValue: sign * value,
      termIndex: i,
      dieIndex: 0,
      appearance: "normal" as const,
    };
  });
  return {
    id: r.id,
    formula: `${r.dice.length}d${r.sides}`,
    normalized: `${r.dice.length}d${r.sides}`,
    terms: dice.map((d) => ({ count: 1, sides: d.sides, sign: d.sign })),
    dice,
    diceTotal: dice.reduce((n, d) => n + d.signedValue, 0),
    modifier: r.modifier,
    total: r.total,
    appearance: "normal",
    createdAt: new Date().toISOString(),
  };
}
type Factory = {
  get: (name: string) => { font: string };
  materials_cache: Record<string, unknown>;
};
export async function withEdgerunnersFaces<T>(
  factory: Factory,
  roll: () => Promise<T>,
): Promise<T> {
  const saved: {
    preset: { font: string; labels: unknown[] };
    labels: unknown[];
  }[] = [];
  try {
    for (const sides of [6, 10]) {
      const preset = factory.get("d" + sides) as {
        font: string;
        labels: unknown[];
      };
      const images = await Promise.all(
        Array.from(
          { length: sides },
          (_, i) =>
            new Promise<HTMLImageElement>((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve(image);
              image.onerror = () =>
                reject(
                  Error("Não foi possível carregar uma face Edgerunners."),
                );
              image.src = `/cyberpunk/dice/d${sides}-${i + 1}.webp`;
            }),
        ),
      );
      saved.push({ preset, labels: preset.labels });
      preset.labels = [...(sides === 10 ? [""] : ["", ""]), ...images];
    }
    factory.materials_cache = {};
    return await roll();
  } finally {
    for (const { preset, labels } of saved) preset.labels = labels;
    factory.materials_cache = {};
  }
}
