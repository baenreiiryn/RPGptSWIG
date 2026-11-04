import {
  MINUTES_PER_DAY,
  createCampaignTimeState,
  createDemoCampaignTimeState,
} from "@/lib/campaignTime";
import type { CampaignTimeState } from "@/lib/campaignTime";
import { trackRestAbilityActivation, type RestCycle } from "@/lib/longRest";
import { sessionRuleText } from "@/lib/sessionRestRules";
import { afterExpansionResourceChange, expansionCanHeal, expansionState, finishExpansionRoll, permanentMarkedHp, prepareExpansionRoll, reconcileExpansionCharacter, type ExpansionTransformation } from "@/lib/expansionTransformations";
import {
  createInitialCraftingState,
  ensureCraftingState,
  type CraftingState,
  type CraftRarity,
} from "@/lib/crafting";
import {
  baseProficiencyForLevel,
  classStatsFor,
  daggerheartTierForLevel,
  equipmentEvasionBonus,
  initialTrackersForCharacter,
  markedHitPointsAfterLegacyMigration,
  thresholdsFromEquipment,
} from "@/lib/daggerheartCharacter";
import {
  ensureDaggerheartProgressionState,
  reconcileDaggerheartAdvancementTrackers,
  type CampaignMilestone,
  type DaggerheartProgressionState,
  type PendingDaggerheartLevelUp,
} from "@/lib/daggerheartAdvancement";

export type Actor = "player" | "gm-ai";

export type RollKind = "attack" | "damage" | "reaction" | "check" | "duality" | "custom";

export type RollSource = "tray" | "slash" | "pending";

export type DiceType = "d2" | "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

export type RollDieResult = {
  die: DiceType;
  value: number;
  label?: string;
};

export type PlayerRollRequest = {
  label: string;
  reason: string;
  formula?: string;
  allowedDice?: DiceType[];
  target?: number;
  rollKind?: RollKind;
  purpose?: "death-avoid" | "death-risk" | string;
  actionType?: "attack" | "damage" | "check" | "reaction";
  dualityFearSides?: 12 | 20;
  materialTarget?: boolean;
  advantage?: boolean;
  expansionApplied?: boolean;
};

export type PendingPlayerRoll = PlayerRollRequest & {
  id: string;
  rollKind: RollKind;
  requestedAt: string;
  campaignMinute: number;
};

export type RollResolution = {
  total: number;
  formula?: string;
  dice?: RollDieResult[];
  modifier?: number;
  result?: string;
  success?: boolean;
  source?: RollSource;
};

export type RollResultRecord = {
  id: string;
  pendingRollId: string;
  label: string;
  reason: string;
  rollKind: RollKind;
  purpose?: string;
  source: RollSource;
  requestedFormula?: string;
  formula?: string;
  allowedDice?: DiceType[];
  target?: number;
  dice?: RollDieResult[];
  modifier?: number;
  total: number;
  result?: string;
  success?: boolean;
  outcome?: "success" | "failure";
  requestedAt: string;
  requestedCampaignMinute: number;
  resolvedAt: string;
  campaignMinute: number;
};

export type GmAppliedTool = {
  name: string;
  arguments: string;
  result: unknown;
};

export type GmTurnRecovery = {
  text: string;
  allowTools: boolean;
  allowedToolNames?: string[];
  finalizeLastGlory?: boolean;
  appliedTools: GmAppliedTool[];
};

export type InventoryItem = {
  id: string;
  name: string;
  qty: number;
  detail: string;
  icon: string;
  sourceId?: string;
  rarity?: CraftRarity;
  art?: string;
  crafted?: boolean;
};

export type CharacterTraitName =
  | "agility"
  | "strength"
  | "finesse"
  | "instinct"
  | "presence"
  | "knowledge";

export type CharacterExperience = {
  name: string;
  bonus: number;
};

export type CharacterFeatureRef = {
  id: string;
  name: string;
};

export type CharacterAncestry = {
  mixed: boolean;
  primary: CharacterFeatureRef;
  secondary?: CharacterFeatureRef;
  features: CharacterFeatureRef[];
};

export type CharacterCommunity = CharacterFeatureRef & {
  features: CharacterFeatureRef[];
};

export type CharacterDomainCard = CharacterFeatureRef & {
  domain: string;
  level: number;
};

export type CharacterConnection = {
  npcId: string;
  text: string;
};

export type DaggerheartTier = 1 | 2 | 3 | 4;

export type CharacterTracker = {
  id: string;
  name: string;
  kind: "counter" | "die" | "dicePool";
  value: number;
  min: number;
  max: number;
  dieSides?: number;
  dice?: number[];
  active?: boolean;
  description?: string;
  source: {
    type: "classFeature" | "subclassFeature" | "domainCard" | "custom";
    id: string;
  };
};

export type CharacterTransformation = {
  kind: "beastform" | "other";
  name: string;
  evasionBonus?: number;
  traitOverrides?: Partial<Record<CharacterTraitName, number>>;
  notes?: string;
};

export type CharacterDeathState = {
  status: "choice" | "avoiding" | "risking" | "risk-recovery" | "reanimated-choice" | "last-glory" | "resolved" | "dead";
  move?: "avoid" | "glory" | "risk";
  recoveryPoints?: number;
  resolvedAt?: string;
};

export type AnimalCompanion = {
  name: string;
  kind?: string;
  image?: string;
  appearance?: string;
  evasion: number;
  stress: number;
  maxStress: number;
  damageDie: DiceType;
  range: string;
  damageType: "physical" | "magic";
  experiences: CharacterExperience[];
  training?: string[];
};

export type DaggerheartCharacterData = {
  class: CharacterFeatureRef;
  subclass: CharacterFeatureRef;
  classFeatures: CharacterFeatureRef[];
  subclassFeatures: CharacterFeatureRef[];
  ancestry: CharacterAncestry;
  community: CharacterCommunity;
  traits: Record<CharacterTraitName, number>;
  experiences: CharacterExperience[];
  domains: string[];
  domainCards: CharacterDomainCard[];
  connections: CharacterConnection[];
  history: string;
  pronouns?: string;
  image?: string;
  animalCompanion?: AnimalCompanion;
  trackers?: CharacterTracker[];
  transformation?: CharacterTransformation;
  restCycle?: RestCycle;
  expansionTransformations?: ExpansionTransformation[];
};

export type Quest = {
  id: string;
  title: string;
  status: "active" | "completed";
  stage: string;
  acceptedAtCampaignMinute?: number;
  deadlineCampaignMinute?: number;
  completedAtCampaignMinute?: number;
};

export type Npc = {
  id: string;
  name: string;
  role: string;
  relation: "friendly" | "neutral" | "hostile";
  location: string;
  secret?: string;
  appearance?: string;
};

export type Memory = {
  id: string;
  kind: "fact" | "event" | "secret" | "visual";
  text: string;
  createdAt: string;
  campaignMinute?: number;
};

export type TimelineKind =
  | "discovery"
  | "quest"
  | "combat"
  | "travel"
  | "relationship"
  | "world"
  | "milestone"
  | "other";

export type TimelineEntry = {
  id: string;
  title: string;
  description: string;
  campaignMinute: number;
  worldDate?: {
    year: number;
    monthIndex: number;
    day: number;
    hour: number;
    minute: number;
  };
  createdAt: string;
  kind: TimelineKind;
  tags: string[];
  visibility: "public" | "hidden";
  importance: "normal" | "major";
  image?: string;
  memoryId?: string;
};

export type SceneParticipant = {
  id: string;
  name: string;
  role: string;
  appearance?: string;
  visualMemories: string[];
};

export type SceneSnapshot = {
  scene: string;
  location: string;
  narration: string;
  participants: SceneParticipant[];
  visibleObjects: string[];
  recentContext: string[];
  createdAt: string;
};

export type SceneImageDraft = {
  prompt: string;
  status: "ready" | "unavailable";
  provider?: string;
  createdAt: string;
};

export type SceneWebImage = {
  scene: string;
  query: string;
  imageUrl: string;
  thumbnailUrl?: string;
  sourceUrl: string;
  caption?: string;
  searchedAt: string;
};

export type Message = {
  id: string;
  role: "gm" | "player" | "system";
  text: string;
  createdAt: string;
  campaignMinute?: number;
  sceneSnapshot?: SceneSnapshot;
  imageDraft?: SceneImageDraft;
};

export type EventRecord = {
  id: string;
  actor: Actor;
  label: string;
  createdAt: string;
  campaignMinute?: number;
  reverse?: GameCommand;
};

export type CampaignCore = {
  name: string;
  system: string;
  tone?: string;
  adventureHook?: string;
  session: number;
  scene: string;
};

export type CharacterState = {
  id: string;
  name: string;
  archetype: string;
  level: number;
  tier: DaggerheartTier;
  evasion: number;
  damageThresholds: {
    major: number;
    severe: number;
  };
  proficiency: number;
  hp: number;
  maxHp: number;
  hope: number;
  maxHope: number;
  stress: number;
  maxStress: number;
  armor: number;
  maxArmor: number;
  conditions: string[];
  scars?: number;
  permanentHp?: number;
  death?: CharacterDeathState;
  appearance?: string;
  daggerheart?: DaggerheartCharacterData;
  progression?: DaggerheartProgressionState;
};

export type CampaignRestartSnapshot = {
  createdAt: string;
  campaign: CampaignCore;
  time: CampaignTimeState;
  character: CharacterState;
  inventory: InventoryItem[];
  crafting: CraftingState;
  quests: Quest[];
  npcs: Npc[];
  memories: Memory[];
  timeline: TimelineEntry[];
  timelineVersion?: number;
  messages: Message[];
  sceneVisual?: SceneWebImage;
};

export type GameState = {
  resourceModelVersion?: number;
  campaign: CampaignCore & {
    restartSnapshot?: CampaignRestartSnapshot;
  };
  time: CampaignTimeState;
  character: CharacterState;
  inventory: InventoryItem[];
  crafting: CraftingState;
  quests: Quest[];
  npcs: Npc[];
  memories: Memory[];
  timeline: TimelineEntry[];
  timelineVersion?: number;
  messages: Message[];
  sceneVisual?: SceneWebImage;
  events: EventRecord[];
  pendingRoll?: PendingPlayerRoll;
  gmRecovery?: GmTurnRecovery;
  rollHistory?: RollResultRecord[];
  milestones?: CampaignMilestone[];
  pendingLevelUp?: PendingDaggerheartLevelUp;
};

function cloneWithoutEmbeddedImages(character: CharacterState): CharacterState {
  const next = structuredClone(character) as CharacterState;
  if (next.daggerheart) {
    next.daggerheart.image = undefined;
    if (next.daggerheart.animalCompanion) {
      next.daggerheart.animalCompanion.image = undefined;
    }
  }
  return next;
}

export function createCampaignRestartSnapshot(state: GameState): CampaignRestartSnapshot {
  const { restartSnapshot: _restartSnapshot, ...campaign } = state.campaign;
  return {
    createdAt: new Date().toISOString(),
    campaign: structuredClone(campaign),
    time: structuredClone(state.time ?? createCampaignTimeState({ seed: `campaign:${state.campaign.name}` })),
    character: cloneWithoutEmbeddedImages(state.character),
    inventory: structuredClone(state.inventory),
    crafting: structuredClone(ensureCraftingState(state.crafting)),
    quests: structuredClone(state.quests),
    npcs: structuredClone(state.npcs),
    memories: structuredClone(state.memories),
    timeline: structuredClone(state.timeline ?? []),
    timelineVersion: state.timelineVersion,
    messages: structuredClone(state.messages),
    ...(state.sceneVisual ? { sceneVisual: structuredClone(state.sceneVisual) } : {}),
  };
}

export function ensureGameStateCrafting(state: GameState): GameState {
  const current = (state as GameState & { crafting?: CraftingState }).crafting;
  const crafting = ensureCraftingState(current);
  if (current === crafting) return state;
  return { ...state, crafting };
}

const RESOURCE_MODEL_VERSION = 2;

export function ensureGameStateCharacterModel(state: GameState): GameState {
  const sourceClass = state.character.daggerheart?.class?.name || state.character.archetype.split("·")[0]?.trim() || "";
  const level = Math.max(1, Math.min(10, Math.trunc(state.character.level || 1)));
  const stats = classStatsFor(sourceClass);
  const legacyHp = (state.resourceModelVersion ?? 0) < RESOURCE_MODEL_VERSION;
  const legacyRestartSnapshot = state.campaign.restartSnapshot;
  const migratedRestartSnapshot = legacyHp && legacyRestartSnapshot
    ? {
        ...legacyRestartSnapshot,
        character: {
          ...legacyRestartSnapshot.character,
          hp: markedHitPointsAfterLegacyMigration(
            legacyRestartSnapshot.character.hp,
            legacyRestartSnapshot.character.maxHp,
          ),
        },
      }
    : legacyRestartSnapshot;
  const campaign = migratedRestartSnapshot !== legacyRestartSnapshot
    ? { ...state.campaign, restartSnapshot: migratedRestartSnapshot }
    : state.campaign;
  const currentTrackers = state.character.daggerheart?.trackers;
  const progression = state.character.daggerheart
    ? ensureDaggerheartProgressionState(state.character.progression)
    : state.character.progression;
  let character: CharacterState = {
    ...state.character,
    level,
    tier: daggerheartTierForLevel(level),
    evasion: Number.isFinite(state.character.evasion) ? state.character.evasion : stats.evasion + equipmentEvasionBonus(state.inventory),
    damageThresholds: state.character.damageThresholds && Number.isFinite(state.character.damageThresholds.major) && Number.isFinite(state.character.damageThresholds.severe)
      ? state.character.damageThresholds
      : thresholdsFromEquipment(state.inventory, level),
    proficiency: Number.isFinite(state.character.proficiency) && state.character.proficiency > 0 ? state.character.proficiency : baseProficiencyForLevel(level),
    hp: legacyHp
      ? markedHitPointsAfterLegacyMigration(state.character.hp, state.character.maxHp)
      : Math.max(0, Math.min(state.character.maxHp, state.character.hp)),
    maxHp: Number.isFinite(state.character.maxHp) && state.character.maxHp > 0 ? state.character.maxHp : stats.hitPoints,
    daggerheart: state.character.daggerheart,
    progression,
  };
  if (character.daggerheart?.animalCompanion) {
    const companion = character.daggerheart.animalCompanion;
    const nextCompanion: AnimalCompanion = {
      ...companion,
      evasion: Number.isFinite(companion.evasion) ? companion.evasion : 10,
      stress: Number.isFinite(companion.stress) ? companion.stress : 0,
      maxStress: Number.isFinite(companion.maxStress) && companion.maxStress > 0 ? companion.maxStress : 3,
      damageDie: companion.damageDie || "d6",
      range: companion.range || "Corpo a Corpo",
      damageType: companion.damageType || "physical",
      experiences: Array.isArray(companion.experiences) ? companion.experiences : [],
      training: Array.isArray(companion.training) ? companion.training : [],
    };
    const companionChanged = companion.evasion !== nextCompanion.evasion
      || companion.stress !== nextCompanion.stress
      || companion.maxStress !== nextCompanion.maxStress
      || companion.damageDie !== nextCompanion.damageDie
      || companion.range !== nextCompanion.range
      || companion.damageType !== nextCompanion.damageType
      || companion.experiences !== nextCompanion.experiences
      || companion.training !== nextCompanion.training;
    if (companionChanged) {
      character.daggerheart = { ...character.daggerheart, animalCompanion: nextCompanion };
    }
  }
  const reconciledTrackers = character.daggerheart
    ? reconcileDaggerheartAdvancementTrackers(character)
    : currentTrackers;
  const adaptedTrackers = state.campaign.system === "Daggerheart" ? reconciledTrackers?.map(tracker => {
    const description = tracker.description === undefined ? undefined : sessionRuleText(tracker.description);
    return description === tracker.description ? tracker : { ...tracker, description };
  }) : reconciledTrackers;
  const trackers = adaptedTrackers?.some((tracker, index) => tracker !== reconciledTrackers?.[index]) ? adaptedTrackers : reconciledTrackers;
  const adaptedInventory = state.campaign.system === "Daggerheart" ? state.inventory.map(item => {
    const detail = sessionRuleText(item.detail);
    return detail === item.detail ? item : { ...item, detail };
  }) : state.inventory;
  const inventory = adaptedInventory.some((item, index) => item !== state.inventory[index]) ? adaptedInventory : state.inventory;
  if (character.daggerheart && trackers !== currentTrackers) {
    character.daggerheart = { ...character.daggerheart, trackers };
  }
  character = reconcileExpansionCharacter(character);
  character.hp = Math.max(permanentMarkedHp(character), character.hp);
  const death = character.hp >= character.maxHp && character.death?.status !== "dead" && character.death?.status !== "resolved"
    ? character.death || { status: "choice" as const }
    : character.death;
  if (death !== character.death) character.death = death;
  const changed = legacyHp
    || state.resourceModelVersion !== RESOURCE_MODEL_VERSION
    || level !== state.character.level
    || character.tier !== state.character.tier
    || character.hp !== state.character.hp
    || character.evasion !== state.character.evasion
    || character.damageThresholds !== state.character.damageThresholds
    || character.proficiency !== state.character.proficiency
    || character.progression !== state.character.progression
    || trackers !== currentTrackers
    || inventory !== state.inventory
    || character.daggerheart !== state.character.daggerheart
    || character.death !== state.character.death
    || character.permanentHp !== state.character.permanentHp
    || campaign !== state.campaign;
  return changed ? { ...state, resourceModelVersion: RESOURCE_MODEL_VERSION, campaign, character, inventory } : state;
}

const TIMELINE_SCHEMA_VERSION = 2;

function normalizeTimelineSource(value: string | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isLegacyGeneratedTimelineEntry(state: GameState, entry: TimelineEntry) {
  const title = normalizeTimelineSource(entry.title);
  if (title.startsWith("gancho inicial da aventura") || title.startsWith("historia de ")) {
    return true;
  }
  const description = normalizeTimelineSource(entry.description);
  const hook = normalizeTimelineSource(state.campaign.adventureHook);
  const history = normalizeTimelineSource(state.character.daggerheart?.history);
  if (description && ((hook && description === hook) || (history && description === history))) return true;
  // The first migration copied memory text verbatim. Keep short/atomic migrated
  // entries because they may represent real session history, but hide clearly
  // unprocessed narrative blobs until synthesis replaces them.
  if (entry.memoryId && entry.description.trim().length > 360) return true;
  return title === "inicio da jornada"
    && entry.campaignMinute === state.time.campaignMinute
    && entry.description.trim().length > 180;
}

export function timelineWithoutLegacyGeneratedEntries(state: GameState) {
  return (Array.isArray(state.timeline) ? state.timeline : []).filter((entry) => !isLegacyGeneratedTimelineEntry(state, entry));
}

export function timelineNeedsNarrativeSynthesis(state: GameState) {
  if ((state.timelineVersion ?? 0) >= TIMELINE_SCHEMA_VERSION) return false;
  const hasNarrativeSource = Boolean(
    state.campaign.adventureHook?.trim()
    || state.character.daggerheart?.history?.trim()
    || state.memories.some((memory) => (memory.kind === "event" || memory.kind === "fact") && memory.text.trim()),
  );
  return hasNarrativeSource;
}

export function ensureGameStateTimeline(state: GameState): GameState {
  const rawTimeline = Array.isArray((state as GameState & { timeline?: TimelineEntry[] }).timeline)
    ? (state as GameState & { timeline: TimelineEntry[] }).timeline
    : [];
  const needsSynthesis = Boolean(
    state.campaign.adventureHook?.trim()
    || state.character.daggerheart?.history?.trim()
    || state.memories.some((memory) => (memory.kind === "event" || memory.kind === "fact") && memory.text.trim()),
  );
  const timelineVersion = (state.timelineVersion ?? 0) >= TIMELINE_SCHEMA_VERSION
    ? state.timelineVersion
    : needsSynthesis ? 1 : TIMELINE_SCHEMA_VERSION;
  if (rawTimeline === state.timeline && state.timelineVersion === timelineVersion) return state;
  return {
    ...state,
    timeline: rawTimeline,
    timelineVersion,
  };
}

function creationMemoriesFromLegacy(state: GameState) {
  const timestamps = state.memories
    .map((memory) => Date.parse(memory.createdAt))
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return [] as Memory[];
  const first = Math.min(...timestamps);
  return state.memories.filter((memory) => Date.parse(memory.createdAt) === first);
}

function creationInventoryNames(memories: Memory[]) {
  const memory = memories.find((entry) => /Equipamento inicial de .+?:/i.test(entry.text));
  if (!memory) return [] as string[];
  const match = memory.text.match(/Equipamento inicial de .+?:\s*(.+?)\.?$/i);
  if (!match?.[1]) return [];
  return match[1].split(",").map((name) => name.trim()).filter(Boolean);
}

function creationCompanionNames(memories: Memory[]) {
  return memories.flatMap((memory) => {
    const match = memory.text.match(/^(.+?)\s+\([^)]*\)\s+acompanha o grupo/i);
    return match?.[1] ? [match[1].trim()] : [];
  });
}

export function inferLegacyRestartSnapshot(state: GameState): CampaignRestartSnapshot {
  const creationMemories = creationMemoriesFromLegacy(state);
  const initialNames = creationInventoryNames(creationMemories);
  const initialNameSet = new Set(initialNames.map((name) => name.toLocaleLowerCase("pt-BR")));
  const inventory = initialNames.length
    ? state.inventory
        .filter((item) => initialNameSet.has(item.name.toLocaleLowerCase("pt-BR")))
        .map((item) => ({ ...structuredClone(item), qty: 1 }))
    : structuredClone(state.inventory);
  const companionNames = new Set(
    creationCompanionNames(creationMemories).map((name) => name.toLocaleLowerCase("pt-BR")),
  );
  const npcs = companionNames.size
    ? state.npcs.filter((npc) => companionNames.has(npc.name.toLocaleLowerCase("pt-BR")))
    : [];
  const { restartSnapshot: _restartSnapshot, ...campaign } = state.campaign;
  const character = cloneWithoutEmbeddedImages(state.character);
  const sourceClass = character.daggerheart?.class?.name || character.archetype.split("·")[0]?.trim() || "";
  const sourceSubclass = character.daggerheart?.subclass?.name;
  const classStats = classStatsFor(sourceClass);
  character.level = 1;
  character.tier = 1;
  character.hp = 0;
  character.maxHp = classStats.hitPoints;
  character.evasion = classStats.evasion + equipmentEvasionBonus(inventory);
  character.damageThresholds = thresholdsFromEquipment(inventory, 1);
  character.proficiency = 1;
  character.hope = 2;
  character.maxHope = 6;
  character.stress = 0;
  character.maxStress = 6;
  character.armor = state.character.maxArmor;
  character.maxArmor = state.character.maxArmor;
  character.conditions = [];
  character.scars = 0;
  character.permanentHp = 0;
  character.death = undefined;
  character.progression = undefined;
  if (character.daggerheart) {
    character.daggerheart.transformation = undefined;
    character.daggerheart.restCycle = undefined;
    character.daggerheart.expansionTransformations = undefined;
    character.daggerheart.trackers = initialTrackersForCharacter(sourceClass, 1, sourceSubclass);
    if (character.daggerheart.animalCompanion) {
      character.daggerheart.animalCompanion.stress = 0;
    }
  }

  return {
    createdAt: new Date().toISOString(),
    campaign: {
      ...structuredClone(campaign),
      session: 1,
      scene: "Prólogo · Cena inicial",
    },
    time: structuredClone(state.time ?? createCampaignTimeState({ seed: `legacy:${state.campaign.name}` })),
    character,
    inventory,
    crafting: createInitialCraftingState(),
    quests: [],
    npcs: structuredClone(npcs),
    memories: structuredClone(creationMemories),
    timeline: [],
    timelineVersion: 1,
    messages: [],
  };
}

export function restartCampaignFromSnapshot(state: GameState): GameState {
  const snapshot = state.campaign.restartSnapshot || inferLegacyRestartSnapshot(state);
  const character = structuredClone(snapshot.character);
  if (character.daggerheart && state.character.daggerheart) {
    character.daggerheart.image = state.character.daggerheart.image;
    if (character.daggerheart.animalCompanion && state.character.daggerheart.animalCompanion) {
      character.daggerheart.animalCompanion.image = state.character.daggerheart.animalCompanion.image;
    }
  }
  return {
    resourceModelVersion: RESOURCE_MODEL_VERSION,
    campaign: {
      ...structuredClone(snapshot.campaign),
      restartSnapshot: structuredClone(snapshot),
    },
    time: structuredClone(snapshot.time ?? state.time ?? createCampaignTimeState({ seed: `legacy:${state.campaign.name}` })),
    character,
    inventory: structuredClone(snapshot.inventory),
    crafting: structuredClone(ensureCraftingState(snapshot.crafting)),
    quests: structuredClone(snapshot.quests),
    npcs: structuredClone(snapshot.npcs),
    memories: structuredClone(snapshot.memories),
    timeline: structuredClone(snapshot.timeline ?? []),
    timelineVersion: snapshot.timelineVersion ?? 1,
    messages: [],
    events: [],
    pendingRoll: undefined,
    rollHistory: [],
    milestones: [],
    pendingLevelUp: undefined,
  };
}

export type GameCommand =
  | { type: "adjust"; resource: "hp" | "hope" | "stress" | "armor"; amount: number; healingSource?: "rest" | "risk" | "other"; freshRemains?: boolean }
  | { type: "tracker"; trackerId: string; value: number; mode?: "set" | "adjust"; dieIndex?: number }
  | { type: "transformation"; transformation?: CharacterTransformation }
  | { type: "inventory"; itemId: string; amount: number }
  | { type: "quest"; questId: string; status: Quest["status"] }
  | { type: "condition"; name: string; active: boolean }
  | { type: "memory"; kind: Memory["kind"]; text: string }
  | { type: "resolve-roll"; pendingRollId: string; resolution: RollResolution };

const now = () => new Date().toISOString();
const id = () => Math.random().toString(36).slice(2, 10);
const demoTime = createDemoCampaignTimeState();
const demoMinute = demoTime.campaignMinute;

export const initialState: GameState = {
  campaign: {
    name: "As Cinzas de Vael'tharos",
    system: "Daggerheart",
    session: 12,
    scene: "Santuário soterrado · Câmara do Oráculo",
  },
  time: demoTime,
  character: {
    id: "fuyu",
    name: "Fuyu",
    archetype: "Ranger · Nível 5",
    level: 5,
    tier: 3,
    evasion: 12,
    damageThresholds: { major: 10, severe: 17 },
    proficiency: 3,
    hp: 2,
    maxHp: 7,
    hope: 3,
    maxHope: 6,
    stress: 2,
    maxStress: 6,
    armor: 2,
    maxArmor: 3,
    conditions: ["Oculta"],
  },
  inventory: [
    { id: "moon-key", name: "Chave Lunar", qty: 1, detail: "Abre selos antigos", icon: "✦" },
    { id: "healing", name: "Poção Rubra", qty: 2, detail: "Recuperação", icon: "◒" },
    { id: "rope", name: "Corda de seda", qty: 1, detail: "15 metros", icon: "⌁" },
  ],
  crafting: createInitialCraftingState(),
  quests: [
    { id: "heart", title: "O Coração de Cinzas", status: "active", stage: "Encontre a porta sob o santuário", acceptedAtCampaignMinute: demoMinute - 3 * MINUTES_PER_DAY },
    { id: "arven", title: "A Promessa de Arven", status: "active", stage: "Recupere o mapa antigo", acceptedAtCampaignMinute: demoMinute - MINUTES_PER_DAY },
  ],
  npcs: [
    { id: "arven", name: "Arven", role: "Cartógrafo exilado", relation: "friendly", location: "Vael'tharos" },
    { id: "ithran", name: "Ithran", role: "Sacerdote sem templo", relation: "neutral", location: "Santuário soterrado", secret: "Reconhece o selo da Ordem das Cinzas." },
    { id: "vesh", name: "Vesh", role: "Caçadora da Ordem", relation: "hostile", location: "Desconhecido" },
  ],
  memories: [
    { id: "m1", kind: "fact", text: "Arven deve ao grupo a vida da filha.", createdAt: now(), campaignMinute: demoMinute - 2 * MINUTES_PER_DAY },
    { id: "m2", kind: "secret", text: "Ithran reconheceu o selo, mas escondeu sua reação.", createdAt: now(), campaignMinute: demoMinute - 180 },
    { id: "m3", kind: "event", text: "A Chave Lunar foi encontrada dentro do observatório quebrado.", createdAt: now(), campaignMinute: demoMinute - 95 },
  ],
  timeline: [
    {
      id: "tl-1",
      title: "A dívida de Arven",
      description: "Arven deve ao grupo a vida da filha.",
      campaignMinute: demoMinute - 2 * MINUTES_PER_DAY,
      createdAt: now(),
      kind: "relationship",
      tags: ["Arven", "Relação"],
      visibility: "public",
      importance: "normal",
      memoryId: "m1",
    },
    {
      id: "tl-2",
      title: "A Chave Lunar foi encontrada",
      description: "A Chave Lunar foi encontrada dentro do observatório quebrado.",
      campaignMinute: demoMinute - 95,
      createdAt: now(),
      kind: "discovery",
      tags: ["Chave Lunar", "Descoberta"],
      visibility: "public",
      importance: "major",
      memoryId: "m3",
    },
  ],
  timelineVersion: 2,
  messages: [
    { id: "g1", role: "gm", text: "A porta de pedra não possui fechadura. No centro, um eclipse de prata pulsa no mesmo ritmo que a Chave Lunar em sua mochila.", createdAt: now(), campaignMinute: demoMinute - 8 },
    { id: "p1", role: "player", text: "Eu retiro a chave, mas antes verifico se Ithran reage de alguma forma.", createdAt: now(), campaignMinute: demoMinute - 4 },
    { id: "g2", role: "gm", text: "Ithran tenta parecer indiferente. Por um instante, porém, os olhos dele descem até a chave. Ele conhece aquele símbolo.", createdAt: now(), campaignMinute: demoMinute },
  ],
  events: [],
  rollHistory: [],
  resourceModelVersion: RESOURCE_MODEL_VERSION,
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function executeCommand(state: GameState, command: GameCommand, actor: Actor = "player", record = true): GameState {
  let source = state;
  if (command.type === "tracker") {
    const tracker = state.character.daggerheart?.trackers?.find(entry => entry.id === command.trackerId);
    if (tracker && command.dieIndex === undefined) {
      const requested = command.mode === "adjust" ? tracker.value + command.value : command.value;
      const activation = trackRestAbilityActivation(state, tracker, requested);
      if (!activation.result.ok) return state;
      source = activation.state;
    }
  }
  const next = structuredClone(source) as GameState;
  const campaignMinute = next.time?.campaignMinute ?? 0;
  let label = "";
  let reverse: GameCommand | undefined;

  if (command.type === "adjust") {
    if (command.resource === "hp" && command.amount < 0 && !expansionCanHeal(next.character, command.healingSource, command.freshRemains)) return state;
    const resource = command.resource === "hope" && command.amount > 0 && expansionState(next.character, "werewolf")?.wolfActive ? "stress" : command.resource;
    const maxKey = ({ hp: "maxHp", hope: "maxHope", stress: "maxStress", armor: "maxArmor" } as const)[resource];
    const current = next.character[resource];
    const maximum = next.character[maxKey];
    const updated = clamp(current + command.amount, resource === "hp" ? permanentMarkedHp(next.character) : 0, maximum);
    const actual = updated - current;
    next.character[resource] = updated;
    if (resource === "hp") {
      label = `PV marcados ${actual >= 0 ? "+" : ""}${actual}`;
      if (updated >= maximum && next.character.death?.status !== "dead" && next.character.death?.status !== "resolved") {
        next.character.death = next.character.death || { status: "choice" };
      } else if (updated < maximum && next.character.death && next.character.death.status !== "dead" && next.character.death.status !== "last-glory") {
        next.character.death = undefined;
      }
      if (actual < 0 && next.character.conditions.includes("Inconsciente")) {
        next.character.conditions = next.character.conditions.filter((condition) => condition !== "Inconsciente");
      }
    } else {
      label = `${resource.toUpperCase()} ${actual >= 0 ? "+" : ""}${actual}`;
    }
    afterExpansionResourceChange(next, resource, current);
    reverse = { ...command, resource, amount: -actual };
  }

  if (command.type === "tracker") {
    const trackers = next.character.daggerheart?.trackers;
    const tracker = trackers?.find((entry) => entry.id === command.trackerId);
    if (tracker) {
      if (tracker.kind === "dicePool" && command.dieIndex !== undefined) {
        tracker.dice = tracker.dice || [];
        const before = tracker.dice[command.dieIndex] ?? 0;
        const updated = clamp(command.mode === "adjust" ? before + command.value : command.value, 0, tracker.dieSides || tracker.max);
        tracker.dice[command.dieIndex] = updated;
        tracker.value = tracker.dice.filter((value) => value > 0).length;
        label = `${tracker.name}: dado ${command.dieIndex + 1} = ${updated}`;
        reverse = { ...command, value: before, mode: "set" };
      } else {
        const before = tracker.value;
        let requested = command.mode === "adjust" ? before + command.value : command.value;
        if (tracker.id.startsWith("summoner-circle-") && trackers) {
          const total = trackers.find((entry) => entry.id === "summoner-total");
          if (total) {
            const delta = requested - before;
            const allowedDelta = delta > 0 ? Math.min(delta, total.max - total.value) : delta;
            requested = before + allowedDelta;
            total.value = clamp(total.value + allowedDelta, total.min, total.max);
          }
        }
        const updated = clamp(requested, tracker.min, tracker.max);
        tracker.value = updated;
        if (tracker.kind === "die") tracker.active = updated > 0;
        label = `${tracker.name}: ${updated}`;
        reverse = { ...command, value: before, mode: "set" };
      }
    }
  }

  if (command.type === "transformation") {
    const previous = next.character.daggerheart?.transformation;
    if (next.character.daggerheart) {
      next.character.daggerheart.transformation = command.transformation
        ? structuredClone(command.transformation)
        : undefined;
      label = command.transformation ? `Transformação: ${command.transformation.name}` : "Transformação encerrada";
      reverse = { type: "transformation", transformation: previous ? structuredClone(previous) : undefined };
    }
  }

  if (command.type === "inventory") {
    const item = next.inventory.find((entry) => entry.id === command.itemId);
    if (item) {
      const before = item.qty;
      item.qty = Math.max(0, item.qty + command.amount);
      const actual = item.qty - before;
      label = `${item.name} ${actual >= 0 ? "+" : ""}${actual}`;
      reverse = { ...command, amount: -actual };
    }
  }

  if (command.type === "quest") {
    const quest = next.quests.find((entry) => entry.id === command.questId);
    if (quest) {
      const old = quest.status;
      quest.status = command.status;
      quest.completedAtCampaignMinute = command.status === "completed" ? campaignMinute : undefined;
      label = `${quest.title}: ${command.status === "completed" ? "concluída" : "reativada"}`;
      reverse = { ...command, status: old };
    }
  }

  if (command.type === "condition") {
    const had = next.character.conditions.includes(command.name);
    next.character.conditions = command.active
      ? Array.from(new Set([...next.character.conditions, command.name]))
      : next.character.conditions.filter((condition) => condition !== command.name);
    label = `${command.name}: ${command.active ? "aplicada" : "removida"}`;
    reverse = { ...command, active: had };
  }

  if (command.type === "memory") {
    const memoryId = id();
    next.memories.unshift({ id: memoryId, kind: command.kind, text: command.text, createdAt: now(), campaignMinute });
    label = "Memória registrada";
  }

  if (command.type === "resolve-roll") {
    const pending = next.pendingRoll;
    const total = Number(command.resolution.total);
    if (pending && pending.id === command.pendingRollId && Number.isFinite(total)) {
      const resolvedAt = now();
      const success = command.resolution.success
        ?? (pending.target === undefined ? undefined : total >= pending.target);
      const resultRecord: RollResultRecord = {
        id: id(),
        pendingRollId: pending.id,
        label: pending.label,
        reason: pending.reason,
        rollKind: pending.rollKind,
        purpose: pending.purpose,
        source: command.resolution.source ?? "pending",
        requestedFormula: pending.formula,
        formula: command.resolution.formula?.trim() || pending.formula,
        allowedDice: pending.allowedDice ? [...pending.allowedDice] : undefined,
        target: pending.target,
        dice: command.resolution.dice ? structuredClone(command.resolution.dice) : undefined,
        modifier: command.resolution.modifier,
        total,
        result: command.resolution.result?.trim() || undefined,
        success,
        outcome: success === undefined ? undefined : success ? "success" : "failure",
        requestedAt: pending.requestedAt,
        requestedCampaignMinute: pending.campaignMinute,
        resolvedAt,
        campaignMinute,
      };
      next.pendingRoll = undefined;
      next.rollHistory = [...(next.rollHistory ?? []), resultRecord];
      label = `Rolagem resolvida: ${pending.label} = ${total}`;
    }
  }

  if (record && label) {
    next.events.unshift({ id: id(), actor, label, createdAt: now(), campaignMinute, reverse });
  }

  return next;
}

export function requestPlayerRoll(state: GameState, request: PlayerRollRequest): GameState {
  if (state.pendingRoll) return state;
  const expansion = prepareExpansionRoll(state, request);
  state = expansion.state;
  request = expansion.request;
  const formula = request.formula?.trim() || undefined;
  const allowedDice = request.allowedDice?.length
    ? Array.from(new Set(request.allowedDice))
    : undefined;
  const pendingRoll: PendingPlayerRoll = {
    id: id(),
    label: request.label.trim(),
    reason: request.reason.trim(),
    formula,
    allowedDice,
    target: request.target,
    rollKind: request.rollKind ?? "custom",
    purpose: request.purpose,
    actionType: request.actionType,
    dualityFearSides: request.dualityFearSides,
    materialTarget: request.materialTarget,
    advantage: request.advantage,
    expansionApplied: request.expansionApplied,
    requestedAt: now(),
    campaignMinute: state.time?.campaignMinute ?? 0,
  };
  return {
    ...state,
    pendingRoll,
    rollHistory: state.rollHistory ?? [],
  };
}

export function chooseDeathMove(state: GameState, move: "avoid" | "glory" | "risk"): GameState {
  if (state.character.hp < state.character.maxHp || state.character.death?.status === "dead") return state;
  if (expansionState(state.character, "ghost") && move !== "glory") return state;
  const character = structuredClone(state.character);
  if (move === "glory") {
    character.death = { status: "last-glory", move: "glory" };
    return { ...state, character };
  }
  character.death = { status: move === "avoid" ? "avoiding" : "risking", move };
  const prepared = { ...state, character, pendingRoll: undefined };
  return requestPlayerRoll(prepared, move === "avoid" ? {
    label: "Evitar a Morte",
    reason: "Role seu Dado de Esperança. Se o resultado for igual ou inferior ao seu nível, você recebe uma Cicatriz.",
    formula: "1d12",
    allowedDice: ["d12"],
    rollKind: "custom",
    purpose: "death-avoid",
  } : {
    label: "Arriscar Tudo",
    reason: "Role os Dados de Dualidade para determinar se você retorna à luta ou atravessa o véu da morte.",
    formula: "2d12",
    allowedDice: ["d12"],
    rollKind: "duality",
    purpose: "death-risk",
  });
}

function resolveDeathRollState(state: GameState, pending: PendingPlayerRoll, resolution: RollResolution) {
  const next = structuredClone(state) as GameState;
  if (pending.purpose === "death-avoid") {
    const hope = resolution.dice?.find((die) => die.label === "Esperança")?.value
      ?? resolution.dice?.find((die) => die.die === "d12")?.value
      ?? resolution.total;
    if (hope <= next.character.level) {
      next.character.scars = (next.character.scars || 0) + 1;
      next.character.maxHope = Math.max(0, next.character.maxHope - 1);
      next.character.hope = Math.min(next.character.hope, next.character.maxHope);
      if (next.character.maxHope <= 0) {
        next.character.death = { status: "dead", move: "avoid", resolvedAt: now() };
        return next;
      }
    }
    next.character.conditions = Array.from(new Set([...next.character.conditions, "Inconsciente"]));
    next.character.death = { status: "resolved", move: "avoid", resolvedAt: now() };
  }
  if (pending.purpose === "death-risk") {
    const hope = resolution.dice?.find((die) => die.label === "Esperança")?.value;
    const fear = resolution.dice?.find((die) => die.label === "Medo")?.value;
    if (hope !== undefined && fear !== undefined) {
      if (hope === fear) {
        next.character.hp = permanentMarkedHp(next.character);
        next.character.stress = 0;
        next.character.death = { status: "resolved", move: "risk", resolvedAt: now() };
      } else if (hope > fear) {
        next.character.death = { status: "risk-recovery", move: "risk", recoveryPoints: hope };
      } else if (expansionState(next.character, "reanimated") && permanentMarkedHp(next.character) < next.character.maxHp - 1) {
        next.character.death = { status: "reanimated-choice", move: "risk", recoveryPoints: hope };
      } else {
        next.character.death = { status: "dead", move: "risk", resolvedAt: now() };
      }
    }
  }
  return next;
}

export function spendDeathRecoveryPoint(state: GameState, resource: "hp" | "stress") {
  const death = state.character.death;
  if (death?.status !== "risk-recovery" || !death.recoveryPoints || death.recoveryPoints <= 0) return state;
  const current = state.character[resource];
  const next = structuredClone(state) as GameState;
  const floor = resource === "hp" ? permanentMarkedHp(next.character) : 0;
  if (current > floor) next.character[resource] = current - 1;
  const actuallySpent = current > floor ? 1 : 0;
  const remaining = Math.max(0, death.recoveryPoints - actuallySpent);
  const noResourcesLeft = next.character.hp <= permanentMarkedHp(next.character) && next.character.stress <= 0;
  next.character.death = remaining <= 0 || noResourcesLeft
    ? { status: "resolved", move: "risk", recoveryPoints: 0, resolvedAt: now() }
    : { ...death, recoveryPoints: remaining };
  return next;
}

export function resolveLastGloryDeath(state: GameState) {
  if (state.character.death?.status !== "last-glory") return state;
  return {
    ...state,
    character: {
      ...state.character,
      death: { status: "dead", move: "glory", resolvedAt: now() },
    },
  } as GameState;
}

export function resolvePendingRoll(
  state: GameState,
  pendingRollId: string,
  resolution: RollResolution,
  actor: Actor = "player",
): GameState {
  const pending = state.pendingRoll;
  let next = executeCommand(state, { type: "resolve-roll", pendingRollId, resolution }, actor);
  if (pending?.id === pendingRollId) {
    if (pending.purpose?.startsWith("death-")) next = resolveDeathRollState(next, pending, resolution);
    next = finishExpansionRoll(next, pending.purpose, resolution);
  }
  return next;
}

export function undoLatest(state: GameState): GameState {
  const latest = state.events.find((event) => event.reverse);
  if (!latest?.reverse) return state;
  const next = executeCommand(state, latest.reverse, latest.actor, false);
  next.events = next.events.filter((event) => event.id !== latest.id);
  return next;
}

export function buildContextPacket(state: GameState) {
  const normalizedScene = state.campaign.scene.toLocaleLowerCase("pt-BR");
  const sceneRoot = normalizedScene.split("·")[0].trim();
  return {
    campaign: state.campaign,
    time: state.time,
    character: state.character,
    crafting: ensureCraftingState(state.crafting),
    activeQuests: state.quests.filter((quest) => quest.status === "active"),
    presentNpcs: state.npcs.filter((npc) => {
      const location = npc.location.toLocaleLowerCase("pt-BR").trim();
      return Boolean(location) && (normalizedScene.includes(location) || location.includes(sceneRoot));
    }),
    relevantMemories: state.memories.slice(0, 8),
    timeline: (state.timeline ?? []).slice(-20),
    recentDialogue: state.messages.slice(-12),
    pendingRoll: state.pendingRoll ?? null,
    rollHistory: (state.rollHistory ?? []).slice(-12),
  };
}
