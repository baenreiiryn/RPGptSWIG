import type { CompendiumEntry } from "./daggerheart";

const FAMILY_TYPES: Record<string, readonly [string, string]> = {
  classes: ["class", "classFeature"],
  ancestries: ["ancestry", "ancestryFeature"],
  communities: ["community", "communityFeature"],
  subclasses: ["subclass", "subclassFeature"],
  transformations: ["transformation", "transformationFeature"],
};

const TIER_ORDER: Record<string, number> = { foundation: 0, specialization: 1, mastery: 2 };

export type CompendiumFamily = {
  parent: CompendiumEntry;
  children: CompendiumEntry[];
};

export type CompendiumDomain = {
  id: string;
  name: string;
  levels: Array<{ level: number | null; entries: CompendiumEntry[] }>;
};

export type CompendiumSection =
  | { category: string; kind: "families"; families: CompendiumFamily[]; ungrouped: CompendiumEntry[] }
  | { category: string; kind: "domains"; domains: CompendiumDomain[] }
  | { category: string; kind: "beastforms"; tiers: Array<{ tier: number; entries: CompendiumEntry[] }> }
  | { category: string; kind: "equipment"; rarities: Array<{ rarity: string; entries: CompendiumEntry[] }> }
  | { category: string; kind: "flat"; entries: CompendiumEntry[] };

function compareEntries(a: CompendiumEntry, b: CompendiumEntry) {
  const tier = (TIER_ORDER[a.tier || ""] ?? 99) - (TIER_ORDER[b.tier || ""] ?? 99);
  return tier || a.name.localeCompare(b.name, "pt-BR");
}

function groupFamilies(
  entries: CompendiumEntry[],
  matches: CompendiumEntry[],
  parentType: string,
  featureType: string,
): Pick<Extract<CompendiumSection, { kind: "families" }>, "families" | "ungrouped"> {
  const parents = entries.filter((entry) => entry.type === parentType);
  const parentsById = new Map<string, CompendiumEntry>();
  for (const parent of parents) {
    for (const key of [parent.id, parent.sourceId, parent.name]) {
      if (key) parentsById.set(key, parent);
    }
  }

  const childrenByParent = new Map<string, CompendiumEntry[]>();
  const ownedChildren = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== featureType || !entry.parent) continue;
    const parent = parentsById.get(entry.parent);
    if (!parent) continue;
    const children = childrenByParent.get(parent.id) || [];
    children.push(entry);
    childrenByParent.set(parent.id, children);
    ownedChildren.add(entry.id);
  }

  const matchedIds = new Set(matches.map((entry) => entry.id));
  const families: CompendiumFamily[] = [];
  for (const parent of parents.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) {
    const parentMatches = matchedIds.has(parent.id);
    const children = (childrenByParent.get(parent.id) || [])
      .filter((entry) => parentMatches || matchedIds.has(entry.id))
      .sort(compareEntries);
    if (parentMatches || children.length) families.push({ parent, children });
  }

  // Keep unmatched relationships visible instead of dropping their content.
  const ungrouped = matches.filter((entry) =>
    entry.type !== parentType && !ownedChildren.has(entry.id),
  );
  return { families, ungrouped };
}

function groupDomains(entries: CompendiumEntry[]): CompendiumDomain[] {
  const domains = new Map<string, Map<number | null, CompendiumEntry[]>>();
  for (const entry of entries) {
    const domain = (entry.domain?.trim() || "Sem domínio").toLocaleLowerCase("pt-BR");
    const levels = domains.get(domain) || new Map<number | null, CompendiumEntry[]>();
    const level = typeof entry.level === "number" ? entry.level : null;
    const cards = levels.get(level) || [];
    cards.push(entry);
    levels.set(level, cards);
    domains.set(domain, levels);
  }

  return Array.from(domains, ([id, levels]) => ({
    id,
    name: id.charAt(0).toLocaleUpperCase("pt-BR") + id.slice(1),
    levels: Array.from(levels, ([level, cards]) => ({
      level,
      entries: cards.toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    })).sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity)),
  })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function buildCompendiumSections(
  entries: CompendiumEntry[],
  matches: CompendiumEntry[],
  categoryOrder: string[],
): CompendiumSection[] {
  const entriesByCategory = new Map<string, CompendiumEntry[]>();
  const matchesByCategory = new Map<string, CompendiumEntry[]>();
  for (const entry of entries) {
    const items = entriesByCategory.get(entry.category) || [];
    items.push(entry);
    entriesByCategory.set(entry.category, items);
  }
  for (const entry of matches) {
    const items = matchesByCategory.get(entry.category) || [];
    items.push(entry);
    matchesByCategory.set(entry.category, items);
  }

  const sections: CompendiumSection[] = [];
  const categories = new Set([...categoryOrder, ...matchesByCategory.keys()]);
  for (const category of categories) {
    const categoryMatches = matchesByCategory.get(category);
    if (!categoryMatches?.length) continue;
    const familyTypes = FAMILY_TYPES[category];
    if (familyTypes) {
      const grouped = groupFamilies(entriesByCategory.get(category) || [], categoryMatches, ...familyTypes);
      sections.push({ category, kind: "families", ...grouped });
    } else if (category === "equipment") {
      const rarityOrder = ["common", "uncommon", "rare", "very-rare", "legendary", "unclassified"];
      const typeOrder = ["weapon", "armor", "consumable", "loot"];
      const groups = new Map<string, CompendiumEntry[]>();
      for (const entry of categoryMatches) {
        const rarity = entry.rarity || "unclassified";
        groups.set(rarity, [...(groups.get(rarity) || []), entry]);
      }
      sections.push({category, kind: "equipment", rarities: Array.from(groups, ([rarity, items]) => ({rarity, entries: items.toSorted((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || compareEntries(a, b))})).sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity))});
    } else if (category === "beastforms") {
      const tiers = new Map<number, CompendiumEntry[]>();
      for (const entry of categoryMatches) {
        const tier = entry.beastformTier || 1;
        tiers.set(tier, [...(tiers.get(tier) || []), entry]);
      }
      sections.push({ category, kind: "beastforms", tiers: Array.from(tiers, ([tier, items]) => ({ tier, entries: items.toSorted(compareEntries) })).sort((a, b) => a.tier - b.tier) });
    } else if (category === "domains") {
      sections.push({ category, kind: "domains", domains: groupDomains(categoryMatches) });
    } else {
      sections.push({ category, kind: "flat", entries: categoryMatches });
    }
  }
  return sections;
}
