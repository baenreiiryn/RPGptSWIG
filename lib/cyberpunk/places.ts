import original from "./places.generated.json" with { type: "json" };
import poi from "./poi2077.json" with { type: "json" };
import type { CyberpunkEra, Place } from "./types";
const centers: Record<string, [number, number]> = {
  Northside: [96, 40],
  "Arasaka Waterfront": [78, 52],
  "Little China": [92, 65],
  Kabuki: [99, 57],
  Japantown: [110, 75],
  "North Oak": [127, 69],
  "Charter Hill": [122, 90],
  Downtown: [80, 86],
  "Corpo Plaza": [94, 86],
  Wellsprings: [79, 105],
  "The Glen": [91, 105],
  "Vista del Rey": [103, 97],
  Arroyo: [109, 112],
  "Rancho Coronado": [124, 124],
  Coastview: [82, 123],
  "West Wind Estate": [73, 133],
  Dogtown: [87, 131],
};
export const PLACE_CATEGORIES: Record<string, string> = {
  district: "Bairros",
  bar: "Bares e clubes",
  clinic: "Clínicas",
  shop: "Lojas",
  netrunner: "Netrunners",
  fixer: "Fixers",
  landmark: "Pontos de interesse",
  custom: "Meus endereços",
};
export const PLACE_GLYPHS: Record<string, string> = {
  district: "◇",
  bar: "B",
  clinic: "+",
  shop: "€",
  netrunner: "N",
  fixer: "F",
  landmark: "◆",
  custom: "⌖",
};
export function defaultNightCityPlaces(era: CyberpunkEra): Place[] {
  return [
    ...(original as Place[])
      .filter((p) => p.era === era)
      .map((p) => {
        const center = centers[p.name];
        return {
          ...p,
          category: p.precision === "district" ? "district" : "landmark",
          ...(era === 2077 && center
            ? {
                streetPosition: {
                  x: (center[0] / 256) * 100,
                  y: (center[1] / 256) * 100,
                },
              }
            : {}),
        };
      }),
    ...(era === 2077 ? (poi as Place[]) : []),
  ].map((p) => ({ ...p }));
}
export function mergeNightCityPlaces(
  saved: Place[],
  era: CyberpunkEra,
): Place[] {
  const result = new Map(defaultNightCityPlaces(era).map((p) => [p.id, p]));
  for (const p of saved) {
    const baseline = result.get(p.id);
    const complete =
      !baseline || Object.keys(baseline).every((key) => key in p);
    result.set(p.id, complete ? p : { ...baseline, ...p });
  }
  const merged = [...result.values()];
  return merged.length === saved.length &&
    merged.every((p, i) => p === saved[i])
    ? saved
    : merged;
}
