import type { DiceAppearance, DiceAppearanceOverrides } from "./dice";
export const EDGERUNNERS_DICE = [2, 4, 6, 8, 10, 12, 20, 100] as const;
export const EDGERUNNERS_DICE_APPEARANCE: DiceAppearance = {
  name: "Edgerunners",
  foreground: "#32c92a",
  background: "#f0dc00",
  outline: "#32c92a",
  edge: "#f0dc00",
  texture: "edgerunners",
  material: "plastic",
  surface: "cyberpunk",
  font: "Arial",
  preset: "standard",
};
export function cyberpunkDiceAppearances(
  overrides: DiceAppearanceOverrides = {},
): DiceAppearanceOverrides {
  return {
    ...overrides,
    normal: { ...EDGERUNNERS_DICE_APPEARANCE, ...overrides.normal },
  };
}
export const diceEngineTexture = (texture: string) =>
  texture === "edgerunners" ? "none" : texture;
type Preset = { labels?: unknown[]; font?: string };
export type FaceTextureFactory = {
  get: (type: string) => Preset;
  materials_cache: Record<string, unknown>;
};
const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(path: string) {
  const cached = images.get(path);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(Error("Não foi possível carregar uma face Edgerunners."));
    image.src = path;
  });
  images.set(path, promise);
  void promise.catch(() => {
    if (images.get(path) === promise) images.delete(path);
  });
  return promise;
}
function faceLabels(
  labels: unknown[],
  sides: number,
  art: HTMLImageElement[],
): unknown[] {
  return labels.map((label) => {
    if (Array.isArray(label)) return faceLabels(label, sides, art);
    if (
      (typeof label !== "number" && typeof label !== "string") ||
      label === ""
    )
      return label;
    let value = Number(label);
    if (
      typeof label === "string" &&
      value === 0 &&
      (sides === 10 || sides === 100)
    )
      value = sides;
    const index = sides === 100 ? value / 10 - 1 : value - 1;
    return Number.isInteger(index) && index >= 0 && index < art.length
      ? art[index]
      : label;
  });
}
export async function withEdgerunnersFaces<T>(
  factory: FaceTextureFactory,
  roll: () => Promise<T>,
  dice: readonly number[] = [6, 10],
): Promise<T> {
  const saved: { preset: Preset; labels: unknown[] }[] = [];
  try {
    // Load before mutating presets, so a failed request cannot leave half a set applied.
    const loaded = await Promise.all(
      [...new Set(dice)].map(async (sides) => {
        if (!(EDGERUNNERS_DICE as readonly number[]).includes(sides))
          throw Error("Dado Edgerunners não suportado.");
        const preset = factory.get("d" + sides);
        if (!preset || !Array.isArray(preset.labels))
          throw Error("Faces do dado não disponíveis.");
        const art = await Promise.all(
          Array.from({ length: sides === 100 ? 10 : sides }, (_, i) =>
            loadImage(
              `/cyberpunk/dice/d${sides}-${sides === 100 ? (i + 1) * 10 : i + 1}.webp`,
            ),
          ),
        );
        return { preset, sides, art };
      }),
    );
    for (const { preset, sides, art } of loaded) {
      const labels = preset.labels!;
      saved.push({ preset, labels });
      preset.labels = faceLabels(labels, sides, art);
    }
    factory.materials_cache = {};
    return await roll();
  } finally {
    for (const { preset, labels } of saved) preset.labels = labels;
    factory.materials_cache = {};
  }
}
const queues = new WeakMap<FaceTextureFactory, Promise<unknown>>();
export async function rollWithDiceFaceTexture<T>(
  factory: FaceTextureFactory,
  texture: string,
  notation: string,
  roll: () => Promise<T>,
): Promise<T> {
  const prior = queues.get(factory) ?? Promise.resolve();
  const next = prior
    .catch(() => {})
    .then(() => {
      const sides = [
        ...notation.split("@")[0].matchAll(/d(100|20|12|10|8|6|4|2)(?!\d)/gi),
      ].map((m) => Number(m[1]));
      // The renderer represents a percentile roll with a tens die and a d10 units die.
      if (sides.includes(100)) sides.push(10);
      return texture === "edgerunners" && sides.length
        ? withEdgerunnersFaces(factory, roll, sides)
        : roll();
    });
  queues.set(factory, next);
  try {
    return await next;
  } finally {
    if (queues.get(factory) === next) queues.delete(factory);
  }
}
