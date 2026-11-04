import type {
  CharacterDomainCard,
  CharacterFeatureRef,
  CharacterState,
  CharacterTracker,
  CharacterTraitName,
  DaggerheartTier,
  GameState,
  InventoryItem,
} from "@/lib/game";
import { reconcileExpansionCharacter } from "@/lib/expansionTransformations";
import {
  daggerheartTierForLevel,
  initialTrackersForCharacter,
  reconcileCharacterTrackers,
  thresholdsFromEquipment,
} from "@/lib/daggerheartCharacter";

export type DaggerheartAdvancementTier = 2 | 3 | 4;

export type DaggerheartAdvancementKind =
  | "trait"
  | "hp"
  | "stress"
  | "experience"
  | "domain"
  | "evasion"
  | "subclass"
  | "proficiency"
  | "multiclass"
  | "classSpecific";

export type DaggerheartMulticlassState = {
  class: CharacterFeatureRef;
  domain: string;
  subclass: CharacterFeatureRef;
  classFeatures: CharacterFeatureRef[];
  foundationFeatures: CharacterFeatureRef[];
  takenAtTier: DaggerheartAdvancementTier;
  takenAtLevel: number;
};

export type DaggerheartProgressionState = {
  version: 1;
  advancementMarks: Partial<Record<DaggerheartAdvancementTier, Partial<Record<DaggerheartAdvancementKind, number>>>>;
  traitMarks: CharacterTraitName[];
  multiclass?: DaggerheartMulticlassState;
};

type AdvancementBase = {
  sourceTier: DaggerheartAdvancementTier;
};

export type DaggerheartAdvancementChoice =
  | (AdvancementBase & { kind: "trait"; traits: [CharacterTraitName, CharacterTraitName] })
  | (AdvancementBase & { kind: "hp" })
  | (AdvancementBase & { kind: "stress" })
  | (AdvancementBase & { kind: "experience"; experiences: [string, string] })
  | (AdvancementBase & { kind: "domain"; card: CharacterDomainCard })
  | (AdvancementBase & { kind: "evasion" })
  | (AdvancementBase & { kind: "subclass"; features: CharacterFeatureRef[] })
  | (AdvancementBase & { kind: "proficiency" })
  | (AdvancementBase & { kind: "classSpecific"; id: "brawler-combo-die" })
  | (AdvancementBase & {
      kind: "multiclass";
      class: CharacterFeatureRef;
      domain: string;
      subclass: CharacterFeatureRef;
      classFeatures: CharacterFeatureRef[];
      foundationFeatures: CharacterFeatureRef[];
    });

export type DaggerheartCompanionAdvancementKind =
  | "intelligent"
  | "lightInTheDark"
  | "creatureComfort"
  | "armored"
  | "vicious"
  | "resilient"
  | "bonded"
  | "aware";

export type DaggerheartCompanionAdvancementChoice =
  | { kind: "intelligent"; experience: string }
  | { kind: "lightInTheDark" }
  | { kind: "creatureComfort" }
  | { kind: "armored" }
  | { kind: "vicious"; improvement: "damageDie" | "range" }
  | { kind: "resilient" }
  | { kind: "bonded" }
  | { kind: "aware" };

export type DaggerheartLevelUpChoice = {
  targetLevel: number;
  tierAchievementExperience?: string;
  companionTierExperience?: string;
  advancements: DaggerheartAdvancementChoice[];
  domainCard: CharacterDomainCard;
  companionChoices?: DaggerheartCompanionAdvancementChoice[];
};

export type DaggerheartLevelUpPlan = DaggerheartLevelUpChoice[];

export type PreparedDaggerheartLevelUp = {
  fromLevel: number;
  targetLevel: number;
  tier: DaggerheartTier;
  advancementPoints: 2;
  reason: string;
};

export type PendingDaggerheartLevelUp = PreparedDaggerheartLevelUp & {
  milestoneId: string;
  createdAt: string;
  campaignMinute: number;
};

export type CampaignMilestone = {
  id: string;
  kind: "level-up";
  title?: string;
  reason: string;
  fromLevel: number;
  targetLevel: number;
  tier: DaggerheartTier;
  campaignMinute: number;
  createdAt: string;
  status: "pending" | "completed";
  completedAt?: string;
};

export type DaggerheartAdvancementOption = {
  kind: DaggerheartAdvancementKind;
  sourceTier: DaggerheartAdvancementTier;
  cost: 1 | 2;
  slotLimit: number;
  usedSlots: number;
  remainingSlots: number;
  available: boolean;
  unavailableReason?: string;
};

export type DaggerheartLevelUpValidation = {
  ok: boolean;
  errors: string[];
};

export type DaggerheartLevelUpApplyResult =
  | { ok: true; character: CharacterState }
  | { ok: false; character: CharacterState; errors: string[] };

export type DaggerheartLevelUpPlanResult =
  | { ok: true; character: CharacterState }
  | { ok: false; character: CharacterState; failedAtIndex: number; errors: string[] };

export const DAGGERHEART_MAX_HP_SLOTS = 12;
export const DAGGERHEART_MAX_STRESS_SLOTS = 12;

const ADVANCEMENT_KINDS: DaggerheartAdvancementKind[] = [
  "trait",
  "hp",
  "stress",
  "experience",
  "domain",
  "evasion",
  "subclass",
  "proficiency",
  "multiclass",
  "classSpecific",
];

const TRAITS: CharacterTraitName[] = ["agility", "strength", "finesse", "instinct", "presence", "knowledge"];

export const DAGGERHEART_ADVANCEMENT_SLOT_LIMITS: Record<DaggerheartAdvancementTier, Record<DaggerheartAdvancementKind, number>> = {
  2: { trait: 3, hp: 2, stress: 2, experience: 1, domain: 1, evasion: 1, subclass: 0, proficiency: 0, multiclass: 0, classSpecific: 1 },
  3: { trait: 3, hp: 2, stress: 2, experience: 1, domain: 1, evasion: 1, subclass: 1, proficiency: 1, multiclass: 1, classSpecific: 1 },
  4: { trait: 3, hp: 2, stress: 2, experience: 1, domain: 1, evasion: 1, subclass: 1, proficiency: 1, multiclass: 1, classSpecific: 1 },
};

const COMPANION_TRAINING_LIMITS: Record<DaggerheartCompanionAdvancementKind, number> = {
  intelligent: 3,
  lightInTheDark: 1,
  creatureComfort: 1,
  armored: 1,
  vicious: 3,
  resilient: 3,
  bonded: 1,
  aware: 3,
};

const COMPANION_TRAINING_LABELS: Record<DaggerheartCompanionAdvancementKind, string> = {
  intelligent: "Intelligent",
  lightInTheDark: "Light in the Dark",
  creatureComfort: "Creature Comfort",
  armored: "Armored",
  vicious: "Vicious",
  resilient: "Resilient",
  bonded: "Bonded",
  aware: "Aware",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function isBrawler(character: CharacterState) {
  const classKey = normalizeText(`${character.daggerheart?.class?.id || ""} ${character.daggerheart?.class?.name || ""}`);
  return classKey.includes("brawler") || classKey.includes("pugilista");
}

function isBeastbound(character: CharacterState) {
  const subclassKey = normalizeText(`${character.daggerheart?.subclass?.id || ""} ${character.daggerheart?.subclass?.name || ""}`);
  return subclassKey.includes("beastbound") || subclassKey.includes("treinador");
}

function hasSubclassFeature(character: CharacterState, ...needles: string[]) {
  const normalizedNeedles = needles.map(normalizeText);
  return (character.daggerheart?.subclassFeatures ?? []).some((feature) => {
    const haystack = normalizeText(`${feature.id} ${feature.name}`);
    return normalizedNeedles.some((needle) => haystack.includes(needle));
  });
}

export function companionAdvancementChoiceCount(character: CharacterState) {
  if (!isBeastbound(character)) return 0;
  let count = 1;
  if (hasSubclassFeature(character, "Expert Training", "Treinamento Especializado")) count += 1;
  if (hasSubclassFeature(character, "Advanced Training", "Treinamento Avançado")) count += 2;
  return count;
}

function companionTrainingKind(label: string): DaggerheartCompanionAdvancementKind | undefined {
  const key = normalizeText(label).replace(/[-_]+/g, " ");
  if (key.includes("intelligent") || key.includes("inteligente")) return "intelligent";
  if (key.includes("light in the dark") || key.includes("luz na escuridao")) return "lightInTheDark";
  if (key.includes("creature comfort") || key.includes("conforto")) return "creatureComfort";
  if (key === "armored" || key.includes("armadur")) return "armored";
  if (key.includes("vicious") || key.includes("feroz")) return "vicious";
  if (key.includes("resilient") || key.includes("resiliente")) return "resilient";
  if (key.includes("bonded") || key.includes("vinculad")) return "bonded";
  if (key === "aware" || key.includes("atent")) return "aware";
  return undefined;
}

function companionTrainingCount(character: CharacterState, kind: DaggerheartCompanionAdvancementKind) {
  return (character.daggerheart?.animalCompanion?.training ?? []).filter((label) => companionTrainingKind(label) === kind).length;
}

function safeFeature(value: CharacterFeatureRef | undefined): CharacterFeatureRef | undefined {
  if (!value || !String(value.id || "").trim() || !String(value.name || "").trim()) return undefined;
  return { id: String(value.id).trim(), name: String(value.name).trim() };
}

function safeFeatureList(values: CharacterFeatureRef[] | undefined) {
  if (!Array.isArray(values)) return [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: CharacterFeatureRef[] = [];
  for (const value of values) {
    const feature = safeFeature(value);
    if (!feature) continue;
    const id = normalizeText(feature.id);
    const name = normalizeText(feature.name);
    if (seenIds.has(id) || seenNames.has(name)) continue;
    seenIds.add(id);
    seenNames.add(name);
    result.push(feature);
  }
  return result;
}

function safeTier(value: unknown): DaggerheartAdvancementTier | undefined {
  return value === 2 || value === 3 || value === 4 ? value : undefined;
}

function emptyProgression(): DaggerheartProgressionState {
  return { version: 1, advancementMarks: {}, traitMarks: [] };
}

export function ensureDaggerheartProgressionState(value: DaggerheartProgressionState | undefined): DaggerheartProgressionState {
  if (!value || typeof value !== "object") return emptyProgression();
  const advancementMarks: DaggerheartProgressionState["advancementMarks"] = {};
  for (const tier of [2, 3, 4] as const) {
    const source = value.advancementMarks?.[tier];
    if (!source || typeof source !== "object") continue;
    const marks: Partial<Record<DaggerheartAdvancementKind, number>> = {};
    for (const kind of ADVANCEMENT_KINDS) {
      const limit = DAGGERHEART_ADVANCEMENT_SLOT_LIMITS[tier][kind];
      const raw = Number(source[kind] ?? 0);
      if (!Number.isFinite(raw) || raw <= 0 || limit <= 0) continue;
      marks[kind] = Math.min(limit, Math.max(0, Math.trunc(raw)));
    }
    if (Object.keys(marks).length) advancementMarks[tier] = marks;
  }
  const traitMarks = Array.from(new Set(
    (Array.isArray(value.traitMarks) ? value.traitMarks : []).filter((trait): trait is CharacterTraitName => TRAITS.includes(trait)),
  ));
  const rawMulticlass = value.multiclass;
  const multiclassTier = safeTier(rawMulticlass?.takenAtTier);
  const multiclassClass = safeFeature(rawMulticlass?.class);
  const multiclassSubclass = safeFeature(rawMulticlass?.subclass);
  const multiclassDomain = String(rawMulticlass?.domain || "").trim();
  const takenAtLevel = Math.max(1, Math.min(10, Math.trunc(Number(rawMulticlass?.takenAtLevel) || 1)));
  const multiclass = multiclassTier && multiclassClass && multiclassSubclass && multiclassDomain
    ? {
        class: multiclassClass,
        domain: multiclassDomain,
        subclass: multiclassSubclass,
        classFeatures: safeFeatureList(rawMulticlass?.classFeatures),
        foundationFeatures: safeFeatureList(rawMulticlass?.foundationFeatures),
        takenAtTier: multiclassTier,
        takenAtLevel,
      }
    : undefined;
  const normalized: DaggerheartProgressionState = {
    version: 1,
    advancementMarks,
    traitMarks,
    ...(multiclass ? { multiclass } : {}),
  };
  return JSON.stringify(value) === JSON.stringify(normalized) ? value : normalized;
}

export function prepareDaggerheartLevelUp(character: CharacterState, targetLevel = character.level + 1, reason = "Milestone narrativo"): PreparedDaggerheartLevelUp {
  const fromLevel = Math.max(1, Math.min(10, Math.trunc(character.level || 1)));
  const safeTarget = Math.trunc(targetLevel);
  return {
    fromLevel,
    targetLevel: safeTarget,
    tier: daggerheartTierForLevel(safeTarget),
    advancementPoints: 2,
    reason: reason.trim() || "Milestone narrativo",
  };
}

function choiceCost(choice: DaggerheartAdvancementChoice): 1 | 2 {
  return choice.kind === "proficiency" || choice.kind === "multiclass" ? 2 : 1;
}

function marksFor(progression: DaggerheartProgressionState, tier: DaggerheartAdvancementTier, kind: DaggerheartAdvancementKind) {
  return progression.advancementMarks[tier]?.[kind] ?? 0;
}

function markAdvancement(progression: DaggerheartProgressionState, tier: DaggerheartAdvancementTier, kind: DaggerheartAdvancementKind) {
  const marks = { ...(progression.advancementMarks[tier] ?? {}) };
  marks[kind] = (marks[kind] ?? 0) + 1;
  progression.advancementMarks = { ...progression.advancementMarks, [tier]: marks };
}

function featureExists(list: CharacterFeatureRef[] | undefined, candidate: CharacterFeatureRef) {
  const candidateId = normalizeText(candidate.id);
  const candidateName = normalizeText(candidate.name);
  return (list ?? []).some((entry) => normalizeText(entry.id) === candidateId || normalizeText(entry.name) === candidateName);
}

function subclassFeaturesForAdvancement(choice: Extract<DaggerheartAdvancementChoice, { kind: "subclass" }>) {
  const payload = choice as Extract<DaggerheartAdvancementChoice, { kind: "subclass" }> & {
    feature?: CharacterFeatureRef;
  };
  if (Array.isArray(payload.features)) return payload.features;
  // Temporary legacy compatibility for in-flight callers that still submit one feature.
  return payload.feature ? [payload.feature] : [];
}

function cardExists(list: CharacterDomainCard[] | undefined, candidate: CharacterDomainCard) {
  const id = normalizeText(candidate.id);
  const name = normalizeText(candidate.name);
  const domain = normalizeText(candidate.domain);
  return (list ?? []).some((entry) => normalizeText(entry.id) === id || (normalizeText(entry.name) === name && normalizeText(entry.domain) === domain));
}

function accessibleDomainMaxLevel(character: CharacterState, targetLevel: number, domain: string, progression: DaggerheartProgressionState) {
  const normalizedDomain = normalizeText(domain);
  const primary = character.daggerheart?.domains?.some((entry) => normalizeText(entry) === normalizedDomain);
  if (primary) return targetLevel;
  if (progression.multiclass && normalizeText(progression.multiclass.domain) === normalizedDomain) {
    return Math.ceil(targetLevel / 2);
  }
  return 0;
}

function validateDomainCard(
  character: CharacterState,
  targetLevel: number,
  progression: DaggerheartProgressionState,
  card: CharacterDomainCard,
  acquired: CharacterDomainCard[],
) {
  if (!card || !String(card.id || "").trim() || !String(card.name || "").trim() || !String(card.domain || "").trim()) {
    return "Carta de domínio inválida.";
  }
  if (!Number.isInteger(card.level) || card.level < 1) return "A carta de domínio precisa ter um nível válido.";
  const maxLevel = accessibleDomainMaxLevel(character, targetLevel, card.domain, progression);
  if (maxLevel <= 0) return `O domínio ${card.domain} não está disponível para este personagem.`;
  if (card.level > maxLevel) return `A carta ${card.name} excede o nível máximo ${maxLevel} permitido para o domínio ${card.domain}.`;
  if (cardExists(acquired, card)) return `A carta de domínio ${card.name} já foi adquirida.`;
  return undefined;
}

export function domainCardsForAdvancement(
  character: CharacterState,
  targetLevel: number,
  cards: CharacterDomainCard[],
) {
  const progression = ensureDaggerheartProgressionState(character.progression);
  return cards.filter((card) => !validateDomainCard(character, targetLevel, progression, card, character.daggerheart?.domainCards ?? []));
}

function effectiveTraitMarks(progression: DaggerheartProgressionState, targetLevel: number) {
  return targetLevel === 5 || targetLevel === 8 ? [] : [...progression.traitMarks];
}

function tierAchievementRequired(targetLevel: number) {
  return targetLevel === 2 || targetLevel === 5 || targetLevel === 8;
}

export function advancementOptionsForCharacter(character: CharacterState, targetLevel = character.level + 1): DaggerheartAdvancementOption[] {
  const progression = ensureDaggerheartProgressionState(character.progression);
  const targetTier = daggerheartTierForLevel(targetLevel);
  const traitMarks = new Set(effectiveTraitMarks(progression, targetLevel));
  const options: DaggerheartAdvancementOption[] = [];
  for (const sourceTier of [2, 3, 4] as const) {
    if (sourceTier > targetTier) continue;
    for (const kind of ADVANCEMENT_KINDS) {
      if (kind === "classSpecific" && !isBrawler(character)) continue;
      const slotLimit = DAGGERHEART_ADVANCEMENT_SLOT_LIMITS[sourceTier][kind];
      if (slotLimit <= 0) continue;
      const usedSlots = marksFor(progression, sourceTier, kind);
      const remainingSlots = Math.max(0, slotLimit - usedSlots);
      let unavailableReason: string | undefined;
      if (remainingSlots <= 0) unavailableReason = "Todos os slots deste avanço neste tier já foram usados.";
      else if (kind === "trait" && TRAITS.filter((trait) => !traitMarks.has(trait)).length < 2) unavailableReason = "Não há dois traços desmarcados disponíveis.";
      else if (kind === "hp" && character.maxHp >= DAGGERHEART_MAX_HP_SLOTS) unavailableReason = "O personagem já possui o máximo de 12 slots de PV.";
      else if (kind === "stress" && character.maxStress >= DAGGERHEART_MAX_STRESS_SLOTS) unavailableReason = "O personagem já possui o máximo de 12 slots de Fadiga.";
      else if (kind === "experience" && (character.daggerheart?.experiences?.length ?? 0) < 2) unavailableReason = "São necessárias duas Experiências para este avanço.";
      else if (kind === "domain" && !(character.daggerheart?.domains?.length || progression.multiclass?.domain)) unavailableReason = "O personagem não possui domínio disponível.";
      else if (kind === "subclass" && marksFor(progression, sourceTier, "multiclass") > 0) unavailableReason = "Multiclasse e avanço de subclasse são excludentes no mesmo tier.";
      else if (kind === "multiclass" && progression.multiclass) unavailableReason = "O personagem já escolheu uma multiclasse.";
      else if (kind === "multiclass" && marksFor(progression, sourceTier, "subclass") > 0) unavailableReason = "Avanço de subclasse e multiclasse são excludentes no mesmo tier.";
      options.push({
        kind,
        sourceTier,
        cost: kind === "proficiency" || kind === "multiclass" ? 2 : 1,
        slotLimit,
        usedSlots,
        remainingSlots,
        available: !unavailableReason,
        ...(unavailableReason ? { unavailableReason } : {}),
      });
    }
  }
  return options;
}

function validateFeaturePayload(feature: CharacterFeatureRef | undefined, label: string, errors: string[]) {
  if (!safeFeature(feature)) errors.push(`${label} inválida.`);
}

function validateMulticlassPayload(character: CharacterState, choice: Extract<DaggerheartAdvancementChoice, { kind: "multiclass" }>, errors: string[]) {
  validateFeaturePayload(choice.class, "Classe da multiclasse", errors);
  validateFeaturePayload(choice.subclass, "Subclasse da multiclasse", errors);
  if (!String(choice.domain || "").trim()) errors.push("A multiclasse precisa escolher um domínio.");
  if (!safeFeatureList(choice.classFeatures).length) errors.push("A multiclasse precisa registrar ao menos uma característica de classe adquirida.");
  if (!safeFeatureList(choice.foundationFeatures).length) errors.push("A multiclasse precisa registrar ao menos uma característica de fundação adquirida.");
  if (normalizeText(choice.class?.name || "") === normalizeText(character.daggerheart?.class?.name || "")) {
    errors.push("A multiclasse precisa usar uma classe diferente da classe principal.");
  }
}

function findExperienceIndex(character: CharacterState, name: string) {
  const target = normalizeText(name);
  return character.daggerheart?.experiences?.findIndex((entry) => normalizeText(entry.name) === target) ?? -1;
}

function findCompanionExperienceIndex(character: CharacterState, name: string) {
  const target = normalizeText(name);
  return character.daggerheart?.animalCompanion?.experiences?.findIndex((entry) => normalizeText(entry.name) === target) ?? -1;
}

const COMPANION_DAMAGE_STEPS = ["d4", "d6", "d8", "d10", "d12"] as const;
const COMPANION_RANGE_STEPS = ["Corpo a Corpo", "Muito Próximo", "Próximo", "Distante", "Muito Distante"] as const;

function companionRangeIndex(range: string) {
  const key = normalizeText(range);
  const aliases = [
    ["corpo a corpo", "melee"],
    ["muito proximo", "very close"],
    ["proximo", "close"],
    ["distante", "far"],
    ["muito distante", "very far"],
  ];
  return aliases.findIndex((group) => group.some((alias) => key === normalizeText(alias)));
}

function applyCompanionAdvancementChoices(
  character: CharacterState,
  choices: DaggerheartCompanionAdvancementChoice[],
  errors: string[],
) {
  const companion = character.daggerheart?.animalCompanion;
  if (!companion) {
    if (choices.length) errors.push("As escolhas do companheiro exigem um companheiro animal na ficha.");
    return;
  }
  companion.training = companion.training ?? [];
  for (const choice of choices) {
    const limit = COMPANION_TRAINING_LIMITS[choice.kind];
    if (companionTrainingCount(character, choice.kind) >= limit) {
      errors.push(`A opção de companheiro ${COMPANION_TRAINING_LABELS[choice.kind]} já atingiu seu limite de ${limit}.`);
      continue;
    }
    let applied = true;
    if (choice.kind === "intelligent") {
      const index = findCompanionExperienceIndex(character, String(choice.experience || ""));
      if (index < 0) {
        errors.push("Intelligent exige escolher uma Experiência existente do companheiro.");
        applied = false;
      } else {
        companion.experiences[index].bonus += 1;
      }
    } else if (choice.kind === "lightInTheDark") {
      character.maxHope += 1;
    } else if (choice.kind === "vicious") {
      if (choice.improvement === "damageDie") {
        const index = COMPANION_DAMAGE_STEPS.indexOf(companion.damageDie as typeof COMPANION_DAMAGE_STEPS[number]);
        if (index < 0 || index >= COMPANION_DAMAGE_STEPS.length - 1) {
          errors.push("Vicious não pode aumentar mais o dado de dano do companheiro.");
          applied = false;
        } else {
          companion.damageDie = COMPANION_DAMAGE_STEPS[index + 1];
        }
      } else if (choice.improvement === "range") {
        const index = companionRangeIndex(companion.range);
        if (index < 0 || index >= COMPANION_RANGE_STEPS.length - 1) {
          errors.push("Vicious não pode aumentar mais o alcance do companheiro.");
          applied = false;
        } else {
          companion.range = COMPANION_RANGE_STEPS[index + 1];
        }
      } else {
        errors.push("Vicious precisa aumentar o dado de dano ou o alcance.");
        applied = false;
      }
    } else if (choice.kind === "resilient") {
      companion.maxStress += 1;
    } else if (choice.kind === "aware") {
      companion.evasion += 2;
    }
    if (applied) companion.training.push(COMPANION_TRAINING_LABELS[choice.kind]);
  }
}

function validationCharacterForTierAchievement(character: CharacterState, choice: DaggerheartLevelUpChoice, progression: DaggerheartProgressionState, errors: string[]) {
  const next = structuredClone(character) as CharacterState;
  if (!next.daggerheart) return next;
  next.progression = progression;
  if (tierAchievementRequired(choice.targetLevel)) {
    const experienceName = String(choice.tierAchievementExperience || "").trim();
    if (!experienceName) {
      errors.push(`O nível ${choice.targetLevel} exige uma nova Experiência de tier em +2.`);
    } else if (findExperienceIndex(next, experienceName) >= 0) {
      errors.push(`A Experiência de tier ${experienceName} já existe na ficha.`);
    } else {
      next.daggerheart.experiences.push({ name: experienceName, bonus: 2 });
    }
    if (isBeastbound(next)) {
      const companion = next.daggerheart.animalCompanion;
      const companionExperience = String(choice.companionTierExperience || "").trim();
      if (!companion) {
        errors.push("A subclasse Treinador exige dados do companheiro animal para concluir o nível.");
      } else if (!companionExperience) {
        errors.push(`No nível ${choice.targetLevel}, o companheiro também precisa ganhar uma nova Experiência em +2.`);
      } else if (findCompanionExperienceIndex(next, companionExperience) >= 0) {
        errors.push(`A Experiência de tier do companheiro ${companionExperience} já existe.`);
      } else {
        companion.experiences.push({ name: companionExperience, bonus: 2 });
      }
    } else if (String(choice.companionTierExperience || "").trim()) {
      errors.push("A nova Experiência de tier do companheiro só se aplica à subclasse Treinador.");
    }
    if (choice.targetLevel === 5 || choice.targetLevel === 8) progression.traitMarks = [];
  } else {
    if (String(choice.tierAchievementExperience || "").trim()) errors.push(`O nível ${choice.targetLevel} não concede uma nova Experiência de tier.`);
    if (String(choice.companionTierExperience || "").trim()) errors.push(`O nível ${choice.targetLevel} não concede uma nova Experiência de tier ao companheiro.`);
  }
  return next;
}

export function validateAdvancementLevelChoice(character: CharacterState, choice: DaggerheartLevelUpChoice): DaggerheartLevelUpValidation {
  const errors: string[] = [];
  if (!character.daggerheart) return { ok: false, errors: ["O personagem não possui dados de Daggerheart."] };
  if (!Number.isInteger(choice.targetLevel) || choice.targetLevel < 2 || choice.targetLevel > 10) {
    return { ok: false, errors: ["O nível-alvo deve estar entre 2 e 10."] };
  }
  if (choice.targetLevel !== character.level + 1) {
    errors.push(`O avanço deve levar do nível ${character.level} diretamente ao nível ${character.level + 1}.`);
  }
  const targetTier = daggerheartTierForLevel(choice.targetLevel);
  const progression = structuredClone(ensureDaggerheartProgressionState(character.progression)) as DaggerheartProgressionState;
  const working = validationCharacterForTierAchievement(character, choice, progression, errors);
  const advancementPoints = choice.advancements.reduce((total, advancement) => total + choiceCost(advancement), 0);
  if (advancementPoints !== 2) errors.push(`Cada nível exige exatamente 2 pontos de avanço; foram selecionados ${advancementPoints}.`);
  const acquiredCards = [...(working.daggerheart?.domainCards ?? [])];

  for (const advancement of choice.advancements) {
    const sourceTier = safeTier(advancement.sourceTier);
    if (!sourceTier || sourceTier > targetTier) {
      errors.push(`O avanço ${advancement.kind} usa um tier indisponível para o nível ${choice.targetLevel}.`);
      continue;
    }
    const slotLimit = DAGGERHEART_ADVANCEMENT_SLOT_LIMITS[sourceTier][advancement.kind];
    const used = marksFor(progression, sourceTier, advancement.kind);
    if (slotLimit <= 0 || used >= slotLimit) {
      errors.push(`Não há slot disponível para ${advancement.kind} no Tier ${sourceTier}.`);
      continue;
    }

    if (advancement.kind === "trait") {
      const [first, second] = advancement.traits;
      if (!TRAITS.includes(first) || !TRAITS.includes(second) || first === second) {
        errors.push("O avanço de Traço exige dois traços diferentes.");
      } else if (progression.traitMarks.includes(first) || progression.traitMarks.includes(second)) {
        errors.push("O avanço de Traço só pode usar traços ainda não marcados neste tier.");
      } else {
        progression.traitMarks.push(first, second);
        working.daggerheart!.traits[first] += 1;
        working.daggerheart!.traits[second] += 1;
      }
    } else if (advancement.kind === "hp") {
      if (working.maxHp >= DAGGERHEART_MAX_HP_SLOTS) errors.push("Os slots de PV não podem ultrapassar 12.");
      else working.maxHp += 1;
    } else if (advancement.kind === "stress") {
      if (working.maxStress >= DAGGERHEART_MAX_STRESS_SLOTS) errors.push("Os slots de Fadiga não podem ultrapassar 12.");
      else working.maxStress += 1;
    } else if (advancement.kind === "experience") {
      const [firstName, secondName] = advancement.experiences.map((name) => String(name || "").trim()) as [string, string];
      const first = findExperienceIndex(working, firstName);
      const second = findExperienceIndex(working, secondName);
      if (!firstName || !secondName || normalizeText(firstName) === normalizeText(secondName) || first < 0 || second < 0 || first === second) {
        errors.push("O avanço de Experiência exige duas Experiências existentes e diferentes.");
      } else {
        working.daggerheart!.experiences[first].bonus += 1;
        working.daggerheart!.experiences[second].bonus += 1;
      }
    } else if (advancement.kind === "domain") {
      const error = validateDomainCard(working, choice.targetLevel, progression, advancement.card, acquiredCards);
      if (error) errors.push(error);
      else acquiredCards.push(advancement.card);
    } else if (advancement.kind === "evasion") {
      working.evasion += 1;
    } else if (advancement.kind === "subclass") {
      const features = subclassFeaturesForAdvancement(advancement);
      const validFeatures = features.map((feature) => safeFeature(feature)).filter((feature): feature is CharacterFeatureRef => Boolean(feature));
      const uniqueFeatures = safeFeatureList(features);
      const localErrors: string[] = [];
      if (!features.length) localErrors.push("O avanço de subclasse exige ao menos uma característica da carta.");
      if (validFeatures.length !== features.length) localErrors.push("O avanço de subclasse contém uma característica inválida.");
      if (uniqueFeatures.length !== validFeatures.length) localErrors.push("O avanço de subclasse não pode repetir características na mesma carta.");
      if (marksFor(progression, sourceTier, "multiclass") > 0) {
        localErrors.push(`O Tier ${sourceTier} já foi usado para multiclasse e não pode receber avanço de subclasse.`);
      }
      for (const feature of uniqueFeatures) {
        if (featureExists(working.daggerheart!.subclassFeatures, feature)) {
          localErrors.push(`A característica de subclasse ${feature.name} já foi adquirida.`);
        }
      }
      errors.push(...localErrors);
      if (!localErrors.length) working.daggerheart!.subclassFeatures.push(...uniqueFeatures);
    } else if (advancement.kind === "proficiency") {
      working.proficiency += 1;
    } else if (advancement.kind === "classSpecific") {
      if (advancement.id !== "brawler-combo-die" || !isBrawler(working)) {
        errors.push("Este avanço específico de classe não está disponível para o personagem.");
      }
    } else if (advancement.kind === "multiclass") {
      validateMulticlassPayload(working, advancement, errors);
      if (progression.multiclass) errors.push("O personagem já possui uma multiclasse.");
      if (marksFor(progression, sourceTier, "subclass") > 0) {
        errors.push(`O Tier ${sourceTier} já foi usado para avanço de subclasse e não pode receber multiclasse.`);
      }
      if (!progression.multiclass && !errors.some((error) => error.includes("multiclasse precisa") || error.includes("Classe da multiclasse") || error.includes("Subclasse da multiclasse"))) {
        progression.multiclass = {
          class: advancement.class,
          domain: advancement.domain.trim(),
          subclass: advancement.subclass,
          classFeatures: safeFeatureList(advancement.classFeatures),
          foundationFeatures: safeFeatureList(advancement.foundationFeatures),
          takenAtTier: sourceTier,
          takenAtLevel: choice.targetLevel,
        };
      }
    }
    markAdvancement(progression, sourceTier, advancement.kind);
  }

  const requiredCardError = validateDomainCard(working, choice.targetLevel, progression, choice.domainCard, acquiredCards);
  if (requiredCardError) errors.push(`Carta obrigatória do nível: ${requiredCardError}`);
  const companionRequired = companionAdvancementChoiceCount(working);
  const companionChoices = Array.isArray(choice.companionChoices) ? choice.companionChoices : [];
  if (companionChoices.length !== companionRequired) {
    if (companionRequired > 0) {
      errors.push(`Este nível exige ${companionRequired} escolha(s) de avanço do companheiro; foram fornecidas ${companionChoices.length}.`);
    } else if (companionChoices.length) {
      errors.push("Este personagem não possui escolhas de avanço de companheiro neste nível.");
    }
  }
  if (companionRequired > 0 && companionChoices.length === companionRequired) {
    applyCompanionAdvancementChoices(working, companionChoices, errors);
  }
  return { ok: errors.length === 0, errors };
}

function mergeTrackers(existing: CharacterTracker[] | undefined, groups: CharacterTracker[][]) {
  const seen = new Set<string>();
  const result: CharacterTracker[] = [];
  for (const group of groups) {
    for (const tracker of group) {
      if (seen.has(tracker.id)) continue;
      seen.add(tracker.id);
      result.push(tracker);
    }
  }
  for (const tracker of existing ?? []) {
    if (seen.has(tracker.id)) continue;
    seen.add(tracker.id);
    result.push(tracker);
  }
  return result;
}

export function reconcileDaggerheartAdvancementTrackers(character: CharacterState) {
  if (!character.daggerheart) return undefined;
  const existing = character.daggerheart.trackers;
  const primary = reconcileCharacterTrackers(
    existing,
    character.daggerheart.class.name,
    character.level,
    character.daggerheart.subclass.name,
  );
  const progression = ensureDaggerheartProgressionState(character.progression);
  const groups = [primary];
  let preservedExisting = existing;
  if (progression.multiclass) {
    groups.push(reconcileCharacterTrackers(
      existing,
      progression.multiclass.class.name,
      character.level,
      progression.multiclass.subclass.name,
    ));
  }
  if (isBrawler(character)) {
    const increases = ([2, 3, 4] as const).reduce((total, tier) => total + marksFor(progression, tier, "classSpecific"), 0);
    const sides = [4, 6, 8, 10, 12][Math.min(4, increases)];
    const comboTrackerIds = new Set(["brawler-combo-strike", "brawler-combo-die"]);
    const current = existing?.find((tracker) => comboTrackerIds.has(tracker.id));
    const value = Math.max(0, Math.min(sides, current?.value ?? 0));
    groups.push([{
      id: "brawler-combo-die",
      name: "Dado de Combo",
      kind: "die",
      value,
      min: 0,
      max: sides,
      dieSides: sides,
      active: Boolean(current?.active) && value > 0,
      description: "Dado de Golpe Combinado. Começa em d4 e pode subir um passo uma vez por Patamar usando um avanço.",
      source: { type: "classFeature", id: "Combo Strike" },
    }]);
    preservedExisting = existing?.filter((tracker) => !comboTrackerIds.has(tracker.id));
  }
  const merged = mergeTrackers(preservedExisting, groups);
  return existing && JSON.stringify(existing) === JSON.stringify(merged) ? existing : merged;
}

function applyTierAchievement(character: CharacterState, choice: DaggerheartLevelUpChoice, progression: DaggerheartProgressionState) {
  if (!character.daggerheart || !tierAchievementRequired(choice.targetLevel)) return;
  character.daggerheart.experiences.push({ name: String(choice.tierAchievementExperience).trim(), bonus: 2 });
  if (isBeastbound(character) && character.daggerheart.animalCompanion) {
    character.daggerheart.animalCompanion.experiences.push({ name: String(choice.companionTierExperience).trim(), bonus: 2 });
  }
  character.proficiency += 1;
  if (choice.targetLevel === 5 || choice.targetLevel === 8) progression.traitMarks = [];
}

export function applyDaggerheartLevelUp(
  character: CharacterState,
  inventory: InventoryItem[],
  choice: DaggerheartLevelUpChoice,
): DaggerheartLevelUpApplyResult {
  const validation = validateAdvancementLevelChoice(character, choice);
  if (!validation.ok) return { ok: false, character, errors: validation.errors };
  const next = structuredClone(character) as CharacterState;
  const progression = structuredClone(ensureDaggerheartProgressionState(next.progression)) as DaggerheartProgressionState;
  next.progression = progression;
  applyTierAchievement(next, choice, progression);
  const acquiredCards = [...(next.daggerheart?.domainCards ?? [])];

  for (const advancement of choice.advancements) {
    if (advancement.kind === "trait") {
      for (const trait of advancement.traits) {
        next.daggerheart!.traits[trait] += 1;
        progression.traitMarks.push(trait);
      }
    } else if (advancement.kind === "hp") {
      next.maxHp = Math.min(DAGGERHEART_MAX_HP_SLOTS, next.maxHp + 1);
    } else if (advancement.kind === "stress") {
      next.maxStress = Math.min(DAGGERHEART_MAX_STRESS_SLOTS, next.maxStress + 1);
    } else if (advancement.kind === "experience") {
      for (const name of advancement.experiences) {
        const index = findExperienceIndex(next, name);
        if (index >= 0) next.daggerheart!.experiences[index].bonus += 1;
      }
    } else if (advancement.kind === "domain") {
      next.daggerheart!.domainCards.push(structuredClone(advancement.card));
      acquiredCards.push(advancement.card);
    } else if (advancement.kind === "evasion") {
      next.evasion += 1;
    } else if (advancement.kind === "subclass") {
      next.daggerheart!.subclassFeatures.push(...structuredClone(safeFeatureList(subclassFeaturesForAdvancement(advancement))));
    } else if (advancement.kind === "proficiency") {
      next.proficiency += 1;
    } else if (advancement.kind === "classSpecific") {
      // The persistent mark drives the Brawler Combo Die tracker reconciliation below.
    } else if (advancement.kind === "multiclass") {
      for (const feature of safeFeatureList(advancement.classFeatures)) {
        if (!featureExists(next.daggerheart!.classFeatures, feature)) next.daggerheart!.classFeatures.push(feature);
      }
      for (const feature of safeFeatureList(advancement.foundationFeatures)) {
        if (!featureExists(next.daggerheart!.subclassFeatures, feature)) next.daggerheart!.subclassFeatures.push(feature);
      }
      progression.multiclass = {
        class: structuredClone(advancement.class),
        domain: advancement.domain.trim(),
        subclass: structuredClone(advancement.subclass),
        classFeatures: safeFeatureList(advancement.classFeatures),
        foundationFeatures: safeFeatureList(advancement.foundationFeatures),
        takenAtTier: advancement.sourceTier,
        takenAtLevel: choice.targetLevel,
      };
    }
    markAdvancement(progression, advancement.sourceTier, advancement.kind);
  }

  next.daggerheart!.domainCards.push(structuredClone(choice.domainCard));
  const companionErrors: string[] = [];
  applyCompanionAdvancementChoices(next, choice.companionChoices ?? [], companionErrors);
  if (companionErrors.length) return { ok: false, character, errors: companionErrors };
  next.level = choice.targetLevel;
  next.tier = daggerheartTierForLevel(choice.targetLevel);
  next.damageThresholds = next.damageThresholds
    && Number.isFinite(next.damageThresholds.major)
    && Number.isFinite(next.damageThresholds.severe)
    ? { major: next.damageThresholds.major + 1, severe: next.damageThresholds.severe + 1 }
    : thresholdsFromEquipment(inventory, choice.targetLevel);
  next.archetype = /n[ií]vel\s+\d+/i.test(next.archetype)
    ? next.archetype.replace(/n[ií]vel\s+\d+/i, `Nível ${choice.targetLevel}`)
    : next.archetype;
  next.daggerheart!.trackers = reconcileDaggerheartAdvancementTrackers(next);
  return { ok: true, character: next };
}

export function applyDaggerheartLevelUpPlan(
  character: CharacterState,
  inventory: InventoryItem[],
  plan: readonly DaggerheartLevelUpChoice[],
): DaggerheartLevelUpPlanResult {
  let current = structuredClone(character) as CharacterState;
  for (let index = 0; index < plan.length; index += 1) {
    const applied = applyDaggerheartLevelUp(current, inventory, plan[index]);
    if (!applied.ok) return { ok: false, character: current, failedAtIndex: index, errors: applied.errors };
    current = applied.character;
  }
  return { ok: true, character: reconcileExpansionCharacter(current) };
}

function randomId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function triggerCampaignMilestoneLevelUp(
  state: GameState,
  reason: string,
  title?: string,
): { state: GameState; result: Record<string, unknown> } {
  if (!state.campaign.system.toLocaleLowerCase("pt-BR").includes("daggerheart")) {
    return { state, result: { ok: false, error: "Milestone level-up is only available for Daggerheart campaigns." } };
  }
  if (!state.character.daggerheart) {
    return { state, result: { ok: false, error: "The current character has no Daggerheart character data." } };
  }
  if (state.pendingLevelUp) {
    return { state, result: { ok: false, error: "A level-up is already pending.", pendingLevelUp: state.pendingLevelUp } };
  }
  if (state.character.level >= 10) {
    return { state, result: { ok: false, error: "The character is already at Daggerheart's maximum level." } };
  }
  const cleanReason = reason.trim();
  if (!cleanReason) return { state, result: { ok: false, error: "A narrative milestone requires a reason." } };
  const prepared = prepareDaggerheartLevelUp(state.character, state.character.level + 1, cleanReason);
  const milestoneId = randomId("milestone");
  const createdAt = new Date().toISOString();
  const campaignMinute = state.time?.campaignMinute ?? 0;
  const milestone: CampaignMilestone = {
    id: milestoneId,
    kind: "level-up",
    ...(title?.trim() ? { title: title.trim().slice(0, 120) } : {}),
    reason: prepared.reason,
    fromLevel: prepared.fromLevel,
    targetLevel: prepared.targetLevel,
    tier: prepared.tier,
    campaignMinute,
    createdAt,
    status: "pending",
  };
  const pendingLevelUp: PendingDaggerheartLevelUp = {
    ...prepared,
    milestoneId,
    createdAt,
    campaignMinute,
  };
  const next: GameState = {
    ...state,
    milestones: [...(state.milestones ?? []), milestone],
    pendingLevelUp,
  };
  return { state: next, result: { ok: true, milestone, pendingLevelUp } };
}

export function completePendingDaggerheartLevelUp(
  state: GameState,
  choice: DaggerheartLevelUpChoice,
): { state: GameState; result: Record<string, unknown> } {
  const pending = state.pendingLevelUp;
  if (!pending) return { state, result: { ok: false, error: "No Daggerheart level-up is pending." } };
  if (choice.targetLevel !== pending.targetLevel || state.character.level !== pending.fromLevel) {
    return { state, result: { ok: false, error: "The pending milestone no longer matches the character level." } };
  }
  const applied = applyDaggerheartLevelUp(state.character, state.inventory, choice);
  if (!applied.ok) return { state, result: { ok: false, errors: applied.errors } };
  const completedAt = new Date().toISOString();
  const milestones = (state.milestones ?? []).map((milestone) =>
    milestone.id === pending.milestoneId
      ? { ...milestone, status: "completed" as const, completedAt }
      : milestone,
  );
  return {
    state: {
      ...state,
      character: applied.character,
      milestones,
      pendingLevelUp: undefined,
    },
    result: { ok: true, character: applied.character, milestoneId: pending.milestoneId },
  };
}
