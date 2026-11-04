export const SUPPORTED_DICE = [2, 4, 6, 8, 10, 12, 20, 100] as const;

export type DieSides = (typeof SUPPORTED_DICE)[number];
export type DiceAppearanceRole = "normal" | "hope" | "fear";
export type DiceMaterial = "none" | "plastic" | "perfectmetal" | "metal" | "wood" | "glass";
export type DiceSurface = "default" | "blue-felt" | "red-felt" | "green-felt" | "taverntable" | "mahogany" | "stainless" | "cyberpunk" | "cagetown";
export type DiceFacePreset = "standard" | "pips" | "poker" | "spanish-poker" | "suits";

export type DiceAppearance = {
  name: string;
  foreground: string;
  background: string | string[];
  outline: string;
  edge: string;
  texture: string;
  material: DiceMaterial;
  surface: DiceSurface;
  font: string;
  preset: DiceFacePreset;
};

export type DiceAppearanceSettings = Record<DiceAppearanceRole, DiceAppearance>;
export type DiceAppearanceOverrides = Partial<Record<DiceAppearanceRole, Partial<DiceAppearance>>>;

export type DiceTerm = {
  count: number;
  sides: DieSides;
  sign: 1 | -1;
};

export type ParsedDiceFormula = {
  input: string;
  expression: string;
  normalized: string;
  terms: DiceTerm[];
  modifier: number;
  diceCount: number;
};

export type DieRollResult = {
  sides: DieSides;
  value: number;
  signedValue: number;
  sign: 1 | -1;
  termIndex: number;
  dieIndex: number;
  appearance: DiceAppearanceRole;
};

export type DiceRollResult = {
  id: string;
  formula: string;
  normalized: string;
  terms: DiceTerm[];
  dice: DieRollResult[];
  diceTotal: number;
  modifier: number;
  total: number;
  appearance: DiceAppearanceRole;
  createdAt: string;
};

export type DiceRollOptions = {
  random?: () => number;
  appearance?: DiceAppearanceRole;
  appearanceByDie?: Array<DiceAppearanceRole | undefined>;
  id?: string;
};

export type DiceBoxRoll = {
  notation: string;
  outcomes: number[];
};

export type DiceBoxRenderLane = {
  role: DiceAppearanceRole;
  dieIndexes: number[];
  roll: DiceBoxRoll;
};

export type DiceFormulaErrorCode =
  | "empty"
  | "invalid-syntax"
  | "invalid-count"
  | "unsupported-die"
  | "too-many-dice"
  | "modifier-out-of-range";

export class DiceFormulaError extends Error {
  readonly code: DiceFormulaErrorCode;

  constructor(code: DiceFormulaErrorCode, message: string) {
    super(message);
    this.name = "DiceFormulaError";
    this.code = code;
  }
}

export const MAX_DICE_PER_ROLL = 100;

export const DEFAULT_DICE_APPEARANCES: DiceAppearanceSettings = {
  normal: {
    name: "Oracle",
    foreground: "#f5efe1",
    background: "#2d2740",
    outline: "#100d18",
    edge: "#171220",
    texture: "none",
    material: "plastic",
    surface: "green-felt",
    font: "Georgia",
    preset: "standard",
  },
  hope: {
    name: "Hope",
    foreground: "#fff6cc",
    background: ["#c98a24", "#e1ad3d", "#f1c85a"],
    outline: "#6d4410",
    edge: "#8b5a18",
    texture: "none",
    material: "glass",
    surface: "green-felt",
    font: "Georgia",
    preset: "standard",
  },
  fear: {
    name: "Fear",
    foreground: "#f8dbe8",
    background: ["#41132e", "#65183f", "#82224f"],
    outline: "#1d0714",
    edge: "#300a21",
    texture: "none",
    material: "glass",
    surface: "green-felt",
    font: "Georgia",
    preset: "standard",
  },
};

export function normalizeDiceAppearanceFonts(overrides: DiceAppearanceOverrides): DiceAppearanceOverrides {
  const globalFont = overrides.normal?.font
    ?? overrides.hope?.font
    ?? overrides.fear?.font
    ?? DEFAULT_DICE_APPEARANCES.normal.font;
  return {
    ...overrides,
    normal: { ...(overrides.normal ?? {}), font: globalFont },
    hope: { ...(overrides.hope ?? {}), font: globalFont },
    fear: { ...(overrides.fear ?? {}), font: globalFont },
  };
}

const SUPPORTED_DICE_SET = new Set<number>(SUPPORTED_DICE);
const TOKEN_PATTERN = /([+-]?)(?:(\d*)d(\d+)|(\d+))/iy;
const MAX_EXPRESSION_LENGTH = 256;

function signFromToken(value: string): 1 | -1 {
  return value === "-" ? -1 : 1;
}

function assertSafeInteger(value: number, code: DiceFormulaErrorCode, message: string) {
  if (!Number.isSafeInteger(value)) throw new DiceFormulaError(code, message);
}

function normalizedFormula(terms: DiceTerm[], modifier: number) {
  let output = "";
  terms.forEach((term, index) => {
    const operator = term.sign < 0 ? "-" : index === 0 ? "" : "+";
    output += `${operator}${term.count}d${term.sides}`;
  });
  if (modifier !== 0) output += `${modifier > 0 ? "+" : ""}${modifier}`;
  return output;
}

export function parseDiceFormula(input: string): ParsedDiceFormula {
  const original = input.trim();
  const withoutCommand = original.replace(/^\/r\b/i, "").trim();
  const expression = withoutCommand.replace(/\s+/g, "");

  if (!expression) throw new DiceFormulaError("empty", "Informe uma fórmula de dados depois de /r.");
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new DiceFormulaError("invalid-syntax", "A fórmula de dados é longa demais.");
  }

  const terms: DiceTerm[] = [];
  let modifier = 0;
  let diceCount = 0;
  let cursor = 0;

  while (cursor < expression.length) {
    TOKEN_PATTERN.lastIndex = cursor;
    const match = TOKEN_PATTERN.exec(expression);
    if (!match || match.index !== cursor) {
      throw new DiceFormulaError("invalid-syntax", `Fórmula de dados inválida perto de "${expression.slice(cursor)}".`);
    }

    const operator = match[1] || "";
    if (cursor > 0 && !operator) {
      throw new DiceFormulaError("invalid-syntax", "Use + ou - entre os termos da fórmula.");
    }

    const sign = signFromToken(operator);
    const dieSidesText = match[3];
    const constantText = match[4];

    if (dieSidesText !== undefined) {
      const countText = match[2];
      const count = countText ? Number(countText) : 1;
      const sides = Number(dieSidesText);
      assertSafeInteger(count, "invalid-count", "A quantidade de dados precisa ser um número inteiro.");
      if (count < 1) throw new DiceFormulaError("invalid-count", "A quantidade de dados precisa ser pelo menos 1.");
      if (!SUPPORTED_DICE_SET.has(sides)) {
        throw new DiceFormulaError("unsupported-die", `d${sides} não é suportado. Use d2, d4, d6, d8, d10, d12, d20 ou d100.`);
      }
      diceCount += count;
      if (diceCount > MAX_DICE_PER_ROLL) {
        throw new DiceFormulaError("too-many-dice", `Uma rolagem pode ter no máximo ${MAX_DICE_PER_ROLL} dados.`);
      }
      terms.push({ count, sides: sides as DieSides, sign });
    } else if (constantText !== undefined) {
      const constant = Number(constantText);
      assertSafeInteger(constant, "modifier-out-of-range", "O modificador está fora do intervalo permitido.");
      modifier += sign * constant;
      assertSafeInteger(modifier, "modifier-out-of-range", "O modificador está fora do intervalo permitido.");
    }

    cursor = TOKEN_PATTERN.lastIndex;
  }

  if (!terms.length) throw new DiceFormulaError("invalid-syntax", "A fórmula precisa conter pelo menos um dado.");

  return {
    input: original,
    expression,
    normalized: normalizedFormula(terms, modifier),
    terms,
    modifier,
    diceCount,
  };
}

export function dualityFormulaFromCommand(input: string) {
  return /^\/dr$/i.test(input.trim()) ? "2d12" : null;
}

export function dualityAppearanceByDie(parsed: ParsedDiceFormula, fearSides: 12 | 20 = 12): DiceAppearanceRole[] {
  const positive = (sides: number) => parsed.terms.filter(term => term.sign > 0 && term.sides === sides).reduce((sum, term) => sum + term.count, 0);
  if ((fearSides === 12 && positive(12) !== 2) || (fearSides === 20 && (positive(12) !== 1 || positive(20) < 1))) {
    throw new Error(fearSides === 20 ? "Este ataque exige 1d12 de Esperança e 1d20 de Medo." : "Uma rolagem de Dualidade precisa conter exatamente 2d12: um de Esperança e um de Medo.");
  }
  let hope = false, fear = false;
  return parsed.terms.flatMap(term => Array.from({ length: term.count }, (): DiceAppearanceRole => {
    if (term.sign > 0 && term.sides === 12 && !hope) { hope = true; return "hope"; }
    if (term.sign > 0 && term.sides === fearSides && !fear) { fear = true; return "fear"; }
    return "normal";
  }));
}

function randomDieValue(sides: DieSides, random?: () => number) {
  if (random) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new RangeError("Dice random source must return a finite number from 0 (inclusive) to 1 (exclusive).");
    }
    return Math.floor(value * sides) + 1;
  }

  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const range = 0x1_0000_0000;
    const limit = range - (range % sides);
    const buffer = new Uint32Array(1);
    do cryptoApi.getRandomValues(buffer); while (buffer[0] >= limit);
    return (buffer[0] % sides) + 1;
  }

  return Math.floor(Math.random() * sides) + 1;
}

function createRollId() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `dice-${randomUuid}`;
  return `dice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function rollDice(input: string | ParsedDiceFormula, options: DiceRollOptions = {}): DiceRollResult {
  const parsed = typeof input === "string" ? parseDiceFormula(input) : input;
  const dice: DieRollResult[] = [];
  let dieIndex = 0;

  parsed.terms.forEach((term, termIndex) => {
    for (let index = 0; index < term.count; index += 1) {
      const value = randomDieValue(term.sides, options.random);
      dice.push({
        sides: term.sides,
        value,
        signedValue: value * term.sign,
        sign: term.sign,
        termIndex,
        dieIndex,
        appearance: options.appearanceByDie?.[dieIndex] ?? options.appearance ?? "normal",
      });
      dieIndex += 1;
    }
  });

  const diceTotal = dice.reduce((total, die) => total + die.signedValue, 0);
  return {
    id: options.id ?? createRollId(),
    formula: parsed.expression,
    normalized: parsed.normalized,
    terms: parsed.terms.map((term) => ({ ...term })),
    dice,
    diceTotal,
    modifier: parsed.modifier,
    total: diceTotal + parsed.modifier,
    appearance: options.appearance ?? "normal",
    createdAt: new Date().toISOString(),
  };
}

function percentileFaces(value: number): [number, number] {
  if (value === 100) return [100, 10];
  const tens = Math.floor(value / 10) * 10 || 100;
  const ones = value % 10 || 10;
  return [tens, ones];
}

export function buildDiceBoxRoll(result: DiceRollResult, dieIndexes?: number[]): DiceBoxRoll {
  const notation: string[] = [];
  const outcomes: number[] = [];
  const includedIndexes = dieIndexes ? new Set(dieIndexes) : null;

  result.dice.forEach((die) => {
    if (includedIndexes && !includedIndexes.has(die.dieIndex)) return;
    if (die.sides === 100) {
      const [tens, ones] = percentileFaces(die.value);
      notation.push("1d100", "1d10");
      outcomes.push(tens, ones);
      return;
    }
    notation.push(`1d${die.sides}`);
    outcomes.push(die.value);
  });

  return {
    notation: notation.join("+"),
    outcomes,
  };
}

export function applyDiceFacePresetToNotation(notation: string, preset: DiceFacePreset) {
  if (preset === "standard") return notation;
  const replacement = ({
    pips: { sides: 6, type: "dpip" },
    poker: { sides: 6, type: "dpoker" },
    "spanish-poker": { sides: 8, type: "dspanpoker" },
    suits: { sides: 4, type: "dsuit" },
  } as const)[preset];
  return notation.replace(new RegExp(`(\\d+)d${replacement.sides}(?!\\d)`, "g"), `$1${replacement.type}`);
}

export function buildDiceBoxRenderPlan(
  result: DiceRollResult,
  forcedAppearance?: DiceAppearanceRole,
): DiceBoxRenderLane[] {
  const lanes: DiceBoxRenderLane[] = [];

  for (const die of result.dice) {
    const role = forcedAppearance ?? die.appearance ?? result.appearance;
    const existing = lanes.find((lane) => lane.role === role);
    if (existing) existing.dieIndexes.push(die.dieIndex);
    else lanes.push({ role, dieIndexes: [die.dieIndex], roll: { notation: "", outcomes: [] } });
  }

  return lanes.map((lane) => ({
    ...lane,
    roll: buildDiceBoxRoll(result, lane.dieIndexes),
  }));
}

export async function runDiceBoxRenderPlan(
  plan: DiceBoxRenderLane[],
  runLane: (lane: DiceBoxRenderLane) => Promise<unknown>,
) {
  await Promise.all(plan.map((lane) => runLane(lane)));
}

export function resolveDiceAppearance(
  role: DiceAppearanceRole,
  overrides?: DiceAppearanceOverrides,
): DiceAppearance {
  return {
    ...DEFAULT_DICE_APPEARANCES[role],
    ...(overrides?.[role] ?? {}),
  };
}
