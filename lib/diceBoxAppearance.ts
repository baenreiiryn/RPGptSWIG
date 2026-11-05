import { diceEngineTexture } from "./edgerunnersDice";
import type { DiceAppearance } from "@/lib/dice";

type DiceFactoryLike = {
  materials_cache: Record<string, unknown>;
  get(type: string): { font: string };
};

export type DiceBoxAppearanceTarget = {
  DiceFactory: DiceFactoryLike;
  theme_customColorset: Record<string, unknown> | null;
  loadTheme(config: {
    colorset?: string;
    texture?: string;
    material?: string;
  }): Promise<void>;
};

const FONT_AWARE_DICE_TYPES = [
  "d2",
  "d4",
  "d6",
  "d8",
  "d10",
  "d12",
  "d20",
  "d100",
  "dpip",
  "dpoker",
  "dspanpoker",
  "dsuit",
] as const;

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function diceAppearanceSignature(appearance: DiceAppearance) {
  return JSON.stringify(appearance);
}

export function vendorColorSet(
  appearance: DiceAppearance,
  namespace = "oracle",
) {
  const engineMaterial =
    appearance.material === "plastic" ? "none" : appearance.material;
  return {
    name: `${namespace}-${hashText(diceAppearanceSignature(appearance))}`,
    description: appearance.name,
    category: "OracleRPG",
    foreground: appearance.foreground,
    background: appearance.background,
    outline: appearance.outline,
    edge: appearance.edge,
    texture: diceEngineTexture(appearance.texture),
    material: engineMaterial,
  };
}

export function applyDiceBoxFont(
  target: DiceBoxAppearanceTarget,
  font: string,
) {
  for (const type of FONT_AWARE_DICE_TYPES) {
    target.DiceFactory.get(type).font = font;
  }
  target.DiceFactory.materials_cache = {};
}

export async function applyDiceBoxAppearance(
  target: DiceBoxAppearanceTarget,
  appearance: DiceAppearance,
  namespace = "oracle",
) {
  applyDiceBoxFont(target, appearance.font);
  target.theme_customColorset = vendorColorSet(appearance, namespace);
  await target.loadTheme({
    colorset: "white",
    texture: diceEngineTexture(appearance.texture),
    material: appearance.material === "plastic" ? "none" : appearance.material,
  });
}
