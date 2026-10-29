import type {
  CharacterState,
  CharacterTracker,
  CharacterTraitName,
  DaggerheartTier,
  InventoryItem,
} from "@/lib/game";
import type { CompendiumEntry } from "@/lib/compendium/daggerheart";

export type DaggerheartClassStats = {
  hitPoints: number;
  evasion: number;
};

export const DAGGERHEART_CLASS_STATS: Record<string, DaggerheartClassStats> = {
  Bard: { hitPoints: 5, evasion: 10 },
  Druid: { hitPoints: 6, evasion: 10 },
  Guardian: { hitPoints: 7, evasion: 9 },
  Ranger: { hitPoints: 6, evasion: 12 },
  Rogue: { hitPoints: 6, evasion: 12 },
  Seraph: { hitPoints: 7, evasion: 9 },
  Sorcerer: { hitPoints: 6, evasion: 10 },
  Warrior: { hitPoints: 6, evasion: 11 },
  Wizard: { hitPoints: 5, evasion: 11 },
  Assassin: { hitPoints: 5, evasion: 12 },
  Brawler: { hitPoints: 6, evasion: 10 },
  Warlock: { hitPoints: 5, evasion: 11 },
  Witch: { hitPoints: 6, evasion: 10 },
  "Blood Hunter": { hitPoints: 6, evasion: 11 },
  Summoner: { hitPoints: 6, evasion: 10 },
};

const CLASS_ID_ALIASES: Record<string, string> = {
  Bardo: "Bard",
  Druida: "Druid",
  "Guardião": "Guardian",
  Patrulheiro: "Ranger",
  Ladino: "Rogue",
  Serafim: "Seraph",
  Feiticeiro: "Sorcerer",
  Guerreiro: "Warrior",
  Mago: "Wizard",
  Assassino: "Assassin",
  Pugilista: "Brawler",
  Ocultista: "Warlock",
  Bruxo: "Witch",
  "Caçador de Sangue": "Blood Hunter",
  Invocador: "Summoner",
};

export function normalizeDaggerheartClassId(classId: string) {
  return CLASS_ID_ALIASES[classId] || classId;
}

export function daggerheartTierForLevel(level: number): DaggerheartTier {
  const safeLevel = Math.max(1, Math.min(10, Math.trunc(level || 1)));
  if (safeLevel >= 8) return 4;
  if (safeLevel >= 5) return 3;
  if (safeLevel >= 2) return 2;
  return 1;
}

export function canUseBeastform(character: Pick<CharacterState, "daggerheart">) {
  const data = character.daggerheart;
  if (!data) return false;
  const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/g, "-");
  const druid = [data.class.id, data.class.name].map(normalize).some((value) =>
    value === "druid" || value === "druida" || value.endsWith("-class-druid"));
  return druid || (data.classFeatures || []).some((feature) =>
    [feature.id, feature.name].map(normalize).some((value) =>
      value === "beastform" || value === "forma-de-fera" || value.endsWith("-classfeature-beastform")));
}

export function availableBeastformsForCharacter(character: Pick<CharacterState, "level" | "daggerheart">, entries: CompendiumEntry[]) {
  if (!canUseBeastform(character)) return [];
  const tier = daggerheartTierForLevel(character.level);
  return entries.filter((entry) => entry.type === "beastform" && entry.category === "beastforms"
    && Number.isInteger(entry.beastformTier) && entry.beastformTier! >= 1 && entry.beastformTier! <= tier)
    .toSorted((a, b) => a.beastformTier! - b.beastformTier! || a.name.localeCompare(b.name, "pt-BR"));
}

export function subclassFeatureTiersForLevel(level: number) {
  const tier = daggerheartTierForLevel(level);
  if (tier >= 4) return ["foundation", "specialization", "mastery"] as const;
  if (tier >= 3) return ["foundation", "specialization"] as const;
  return ["foundation"] as const;
}

export function classStatsFor(classId: string) {
  const normalized = normalizeDaggerheartClassId(classId);
  return DAGGERHEART_CLASS_STATS[normalized] || { hitPoints: 6, evasion: 10 };
}

export function thresholdsFromEquipment(items: Array<Pick<InventoryItem, "name" | "detail">>, level: number) {
  const armor = items.find((item) => /armadura|couro|gib[aã]o|cota de malha|armor/i.test(`${item.name} ${item.detail}`));
  const text = armor?.detail || "";
  const match = text.match(/(?:limiares?|thresholds?)\s*(\d+)\s*[/\-]\s*(\d+)/i);
  const safeLevel = Math.max(1, Math.min(10, Math.trunc(level || 1)));
  // Armor entries store BASE thresholds. Daggerheart adds the current level
  // when recording final Major and Severe thresholds on the character sheet.
  if (!match) return { major: safeLevel, severe: safeLevel * 2 };
  return {
    major: Number(match[1]) + safeLevel,
    severe: Number(match[2]) + safeLevel,
  };
}

export function equipmentEvasionBonus(items: Array<Pick<InventoryItem, "name" | "detail">>) {
  return items.reduce((total, item) => {
    const text = `${item.name} ${item.detail}`.replace(/[–−]/g, "-");
    const explicit = text.match(/([+-]\d+)\s*(?:em\s+)?Evas[aã]o/gi) || [];
    const explicitTotal = explicit.reduce((sum, match) => sum + Number(match.match(/[+-]\d+/)?.[0] || 0), 0);
    if (explicit.length) return total + explicitTotal;
    if (/muito pesada|very heavy/i.test(text)) return total - 2;
    if (/pesada|heavy/i.test(text)) return total - 1;
    return total;
  }, 0);
}

export function baseProficiencyForLevel(level: number) {
  return daggerheartTierForLevel(level);
}

function counter(id: string, name: string, value: number, max: number, source: CharacterTracker["source"]): CharacterTracker {
  return { id, name, kind: "counter", value, min: 0, max, source };
}

function die(id: string, name: string, sides: number, source: CharacterTracker["source"], active = false): CharacterTracker {
  return { id, name, kind: "die", value: active ? 1 : 0, min: 0, max: sides, dieSides: sides, source, active };
}

export function initialTrackersForCharacter(classId: string, level: number, subclassId?: string): CharacterTracker[] {
  classId = normalizeDaggerheartClassId(classId);
  const trackers: CharacterTracker[] = [];
  if (classId === "Brawler" && (subclassId === "Martial Artist" || subclassId === "Artista Marcial")) {
    trackers.push({
      ...counter("martial-artist-focus", "Foco", 0, 6, { type: "subclassFeature", id: "Stance Fighter" }),
      description: "Uma vez por descanso, em um momento de calma, zere o Foco, role d6 em quantidade igual ao Instinto e use o maior resultado como novo Foco (máximo 6). Gaste Foco para assumir posturas e usar suas características.",
    });
  }
  if (classId === "Warlock") {
    trackers.push({ ...counter("warlock-favor", "Favor", 3, 6, { type: "classFeature", id: "Favor" }), description: "Você começa com 3 Pontos de Favor e pode acumular até 6." });
  }
  if (classId === "Guardian") {
    trackers.push({ ...die("guardian-unstoppable", "Dado de Determinação", level >= 5 ? 6 : 4, { type: "classFeature", id: "Unstoppable" }), description: "Ao ficar Determinado, começa em 1 e sobe em +1 após causar dano que marque PV. Ao ultrapassar o máximo ou a cena terminar, fica inativo." });
  }
  if (classId === "Seraph") {
    trackers.push({
      id: "seraph-prayer-dice",
      name: "Dados de Oração",
      kind: "dicePool",
      value: 0,
      min: 0,
      max: 12,
      dieSides: 4,
      dice: [],
      source: { type: "classFeature", id: "Prayer Dice" },
      description: "No início da sessão, role d4 em quantidade igual ao atributo de Conjuração da subclasse. Dados gastos são removidos até a próxima sessão.",
    });
  }
  if (classId === "Bard") {
    trackers.push({ ...die("bard-rally", "Dado de Inspiração", level >= 5 ? 8 : 6, { type: "classFeature", id: "Rally" }), description: "Uma vez por sessão, a Inspiração fornece este dado. No 5º nível, ele aumenta de d6 para d8." });
  }
  if (classId === "Summoner") {
    trackers.push(
      { ...counter("summoner-total", "Entidades Invocadas", 0, Math.max(1, level), { type: "classFeature", id: "Summon Entity" }), description: `Você pode manter no máximo ${Math.max(1, level)} Entidade(s) invocada(s), igual ao seu nível.` },
      { ...counter("summoner-circle-1", "1º Círculo · Espírito do Destino", 0, Math.max(1, level), { type: "classFeature", id: "Summon Entity" }), description: "Entidades do 1º Círculo. O total de todas as entidades não pode exceder seu nível." },
      { ...counter("summoner-circle-2", "2º Círculo", 0, Math.max(1, level), { type: "subclassFeature", id: subclassId || "Summoner" }), description: "Entidades do 2º Círculo liberadas pela subclasse. Compartilham o limite total igual ao nível." },
    );
    if (daggerheartTierForLevel(level) >= 3) {
      trackers.push({ ...counter("summoner-circle-3", "3º Círculo", 0, Math.max(1, level), { type: "subclassFeature", id: subclassId || "Summoner" }), description: "Entidades do 3º Círculo. Compartilham o limite total igual ao nível." });
    }
    if (daggerheartTierForLevel(level) >= 4) {
      trackers.push({ ...counter("summoner-circle-4", "4º Círculo", 0, 1, { type: "subclassFeature", id: subclassId || "Summoner" }), description: "Você pode manter apenas uma Entidade do 4º Círculo por vez." });
    }
  }
  return trackers;
}

export function reconcileCharacterTrackers(existing: CharacterTracker[] | undefined, classId: string, level: number, subclassId?: string) {
  const defaults = initialTrackersForCharacter(classId, level, subclassId);
  if (!Array.isArray(existing)) return defaults;
  const byId = new Map(existing.map((tracker) => [tracker.id, tracker]));
  const reconciled = defaults.map((fallback) => {
    const current = byId.get(fallback.id);
    if (!current) return fallback;
    const max = fallback.max;
    const value = Math.max(fallback.min, Math.min(max, current.value));
    return {
      ...fallback,
      value,
      active: fallback.kind === "die" ? Boolean(current.active) && value > 0 : current.active,
      ...(fallback.kind === "dicePool" ? { dice: Array.isArray(current.dice) ? current.dice.map((die) => Math.max(0, Math.min(fallback.dieSides || fallback.max, die))) : [] } : {}),
    };
  });
  const same = existing.length === reconciled.length && existing.every((current, index) => {
    const next = reconciled[index];
    return current.id === next.id
      && current.name === next.name
      && current.kind === next.kind
      && current.value === next.value
      && current.min === next.min
      && current.max === next.max
      && current.dieSides === next.dieSides
      && current.active === next.active
      && current.description === next.description
      && current.source.type === next.source.type
      && current.source.id === next.source.id
      && JSON.stringify(current.dice || []) === JSON.stringify(next.dice || []);
  });
  return same ? existing : reconciled;
}

export function effectiveCharacterEvasion(character: CharacterState) {
  return character.evasion + (character.daggerheart?.transformation?.evasionBonus || 0);
}

export function effectiveCharacterTraits(character: CharacterState): Record<CharacterTraitName, number> | undefined {
  const traits = character.daggerheart?.traits;
  if (!traits) return undefined;
  const overrides = character.daggerheart?.transformation?.traitOverrides || {};
  return Object.fromEntries(
    Object.entries(traits).map(([key, value]) => [key, overrides[key as CharacterTraitName] ?? value]),
  ) as Record<CharacterTraitName, number>;
}

export function markedHitPointsAfterLegacyMigration(currentHp: number, maxHp: number) {
  return Math.max(0, Math.min(maxHp, maxHp - currentHp));
}
