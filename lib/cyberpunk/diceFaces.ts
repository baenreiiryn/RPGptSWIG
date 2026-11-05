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
export { withEdgerunnersFaces } from "../edgerunnersDice";
