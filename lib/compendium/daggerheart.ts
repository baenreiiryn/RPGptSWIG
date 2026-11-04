import raw from "./daggerheart.generated.json";
import type { EquipmentRarity } from "@/lib/equipmentRarity";
import type { SessionRestRule } from "@/lib/sessionRestRules";

export type CompendiumMechanics = {
  costs: Array<{ resource: string; amount: number | null; label: string }>;
  damage: Array<{ formula: string; type?: string }>;
  tests: string[];
  difficulties: number[];
  ranges: string[];
  frequency: string[];
  reaction: boolean;
  hope: boolean;
  fear: boolean;
};

export type CompendiumEntry = {
  id: string;
  sourceId?: string;
  name: string;
  originalName?: string;
  type: string;
  category: string;
  source: string;
  parent?: string | null;
  tier?: "foundation" | "specialization" | "mastery";
  level?: number;
  beastformTier?: number;
  rarity?: EquipmentRarity;
  equipmentTier?: number;
  weaponSlot?: "primary" | "secondary";
  hands?: number;
  equipmentDetail?: string;
  creationRestricted?: string;
  domain?: string;
  recallCost?: number;
  description: string;
  mechanics: CompendiumMechanics;
  art?: string | null;
  artSource?: string;
  artLicense?: string;
  motivesAndTactics?: string;
  sessionRest?: SessionRestRule;
};

export type SubclassFeatureTier = NonNullable<CompendiumEntry["tier"]>;

export function subclassFeatureTierLabel(tier?: CompendiumEntry["tier"]) {
  if (!tier) return "";
  return ({
    foundation: "Fundação",
    specialization: "Especialização",
    mastery: "Maestria",
  } as const)[tier];
}

export type CompendiumCategory = {
  id: string;
  name: string;
  icon: string;
  description: string;
};

export const daggerheartCompendium = raw as {
  generatedAt: string;
  sources: Record<string, string>;
  categories: CompendiumCategory[];
  entries: CompendiumEntry[];
};

export function entryTypeLabel(type: string) {
  return ({
    rule: "Regra",
    trait: "Traço",
    range: "Alcance",
    condition: "Condição",
    deathMove: "Morte",
    class: "Classe",
    classFeature: "Característica de classe",
    ancestry: "Ancestralidade",
    ancestryFeature: "Característica ancestral",
    community: "Comunidade",
    communityFeature: "Característica de comunidade",
    subclass: "Subclasse",
    subclassFeature: "Característica de subclasse",
    domainCard: "Carta de domínio",
    beastform: "Forma de Fera",
    weapon: "Arma",
    armor: "Armadura",
    consumable: "Consumível",
    loot: "Item de saque",
    adversary: "Adversário",
  } as Record<string, string>)[type] || type;
}

export function mechanicsSummary(entry: CompendiumEntry) {
  const parts: Array<{ kind: string; label: string }> = [];
  for (const cost of entry.mechanics.costs) parts.push({ kind: "cost", label: "Custo · " + cost.label });
  for (const damage of entry.mechanics.damage) {
    parts.push({ kind: "damage", label: "Dano · " + damage.formula + (damage.type ? " " + damage.type : "") });
  }
  for (const test of entry.mechanics.tests) parts.push({ kind: "test", label: test });
  for (const difficulty of entry.mechanics.difficulties) parts.push({ kind: "difficulty", label: "Dificuldade " + difficulty });
  if (entry.mechanics.reaction && !entry.mechanics.tests.some((test) => /reação/i.test(test))) {
    parts.push({ kind: "test", label: "Teste de Reação" });
  }
  for (const range of entry.mechanics.ranges.slice(0, 2)) parts.push({ kind: "range", label: range });
  for (const frequency of entry.mechanics.frequency.slice(0, 1)) parts.push({ kind: "frequency", label: frequency });
  return parts;
}
