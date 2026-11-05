import { entriesForEra, type CyberEntry } from "./catalog";
import { STAT_KEYS } from "./rules";
import type { CyberpunkEra, Stat, Stats } from "./types";

const priorities: Record<string, Stat[]> = {
  Solo: [
    "ref",
    "dex",
    "body",
    "will",
    "move",
    "emp",
    "cool",
    "int",
    "tech",
    "luck",
  ],
  Netrunner: [
    "int",
    "tech",
    "will",
    "dex",
    "ref",
    "emp",
    "cool",
    "move",
    "luck",
    "body",
  ],
  Tech: [
    "tech",
    "int",
    "dex",
    "will",
    "ref",
    "emp",
    "luck",
    "body",
    "cool",
    "move",
  ],
  Medtech: [
    "tech",
    "int",
    "emp",
    "will",
    "dex",
    "ref",
    "cool",
    "luck",
    "move",
    "body",
  ],
  Nomad: [
    "ref",
    "dex",
    "tech",
    "body",
    "will",
    "move",
    "emp",
    "int",
    "cool",
    "luck",
  ],
  Media: [
    "int",
    "emp",
    "cool",
    "will",
    "ref",
    "dex",
    "luck",
    "tech",
    "move",
    "body",
  ],
  Exec: [
    "cool",
    "emp",
    "int",
    "will",
    "ref",
    "dex",
    "luck",
    "tech",
    "body",
    "move",
  ],
  Fixer: [
    "cool",
    "emp",
    "int",
    "ref",
    "dex",
    "will",
    "luck",
    "tech",
    "move",
    "body",
  ],
  Lawman: [
    "ref",
    "will",
    "dex",
    "body",
    "emp",
    "int",
    "cool",
    "move",
    "tech",
    "luck",
  ],
  Rockerboy: [
    "cool",
    "emp",
    "dex",
    "ref",
    "will",
    "int",
    "luck",
    "move",
    "tech",
    "body",
  ],
};
export function suggestedCyberStats(role: string): Stats {
  const order = priorities[role] ?? STAT_KEYS;
  return Object.fromEntries(
    order.map((s, i) => [s, [8, 8, 7, 7, 6, 6, 6, 5, 5, 4][i]]),
  ) as Stats;
}
function named(
  era: CyberpunkEra,
  names: string[],
  cyberware = false,
): CyberEntry[] {
  const entries = entriesForEra(era).filter((e) =>
    cyberware ? e.type === "cyberware" : e.type !== "cyberware",
  );
  return names
    .map((name) => entries.find((e) => e.name === name))
    .filter((e): e is CyberEntry => !!e);
}
export function suggestedCyberEquipment(
  role: string,
  era: CyberpunkEra,
): CyberEntry[] {
  const shared = [
    "Heavy Pistol",
    "Light Armorjack (Body)",
    "Light Armorjack (Head)",
    ...(era === 2045 ? ["Agent"] : []),
    "Carryall",
    "Food Stick",
    "Generic Chic Top",
    "Generic Chic Bottoms",
    "Generic Chic Footwear",
  ];
  const roleGear: Record<string, string[]> = {
    Solo: ["Assault Rifle"],
    Netrunner: ["Cyberdeck", ...(era === 2045 ? ["Virtuality Goggles"] : [])],
    Tech: ["Techtool", "Techscanner"],
    Medtech: ["Medtech Bag", "Medscanner"],
    Nomad: ["Tent and Camping Equipment", "Techtool"],
    Media: ["Video Camera", "Audio Recorder"],
    Exec: ["Radio Communicator"],
    Fixer: ["Radio Communicator", "Lock Picking Set"],
    Lawman: ["Handcuffs", "Radio Communicator"],
    Rockerboy: ["Electric Guitar/Other Instrument", "Pocket Amplifier"],
  };
  const ammo = entriesForEra(era).find(
    (e) =>
      e.name === "Heavy Pistol (Basic)" &&
      e.type === "ammo" &&
      e.data.type === "basic" &&
      e.data.variety === "heavyPistol",
  );
  const result = named(era, [...shared, ...(roleGear[role] ?? [])]);
  if (ammo) result.push(ammo);
  return result;
}
export function suggestedCyberware(
  role: string,
  era: CyberpunkEra,
  neuroport: boolean,
): CyberEntry[] {
  const neural =
    era === 2077 && neuroport
      ? []
      : [era === 2077 ? "Neuroport" : "Neural Link"];
  const byRole: Record<string, string[]> = {
    Solo: [...neural, "Sandevistan"],
    Netrunner:
      era === 2077
        ? [...neural, "Neuroport Cyberdeck Port"]
        : [...neural, "Interface Plugs"],
    Tech: ["Cybereye", "Image Enhance"],
    Medtech: ["Enhanced Antibodies", "Toxin Binders"],
    Nomad: [...neural, "Interface Plugs"],
    Media: ["Cyberaudio Suite", "Audio Recorder"],
    Exec: ["Subdermal Pocket", "Biomonitor"],
    Fixer: ["Subdermal Pocket", "Biomonitor"],
    Lawman: ["Cybereye", "Image Enhance"],
    Rockerboy: ["Cyberaudio Suite", "Amplified Hearing", "Techhair"],
  };
  return named(era, byRole[role] ?? ["Biomonitor"], true);
}
export const isFashion = (e: CyberEntry) =>
  e.type === "clothing" || e.data.type?.toLowerCase() === "fashionware";
export function startingBudget(items: CyberEntry[]) {
  const total = items.reduce(
    (n, e) => n + Math.max(0, Number(e.data.price?.market) || 0),
    0,
  );
  const fashionSpent = items
    .filter(isFashion)
    .reduce((n, e) => n + Math.max(0, Number(e.data.price?.market) || 0), 0);
  const fashionCredit = Math.min(800, fashionSpent);
  return {
    total,
    fashionCredit,
    fashionRemaining: Math.max(0, 800 - fashionSpent),
    remaining: 2550 + fashionCredit - total,
  };
}
