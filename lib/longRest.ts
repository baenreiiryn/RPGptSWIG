import type { CharacterTracker, GameState } from "@/lib/game";
import raw from "./compendium/daggerheart.generated.json" with { type: "json" };
import { applySessionRestRule, sessionRuleText, type SessionRestRule } from "./sessionRestRules";

export type RestCycle = {
  completed: number;
  used: Record<string, number>;
  active?: { id: string; startedAtCampaignMinute: number };
  lastCompletedId?: string;
  recoveryRollIds?: string[];
  priorRollIds?: Record<string, string[]>;
};
type RuleEntry = { id: string; sourceId?: string; name: string; type: string; description: string; sessionRest?: SessionRestRule };
const entries: RuleEntry[] = raw.entries.map(applySessionRestRule);
const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const matches = (entry: RuleEntry, id: string) => [entry.id, entry.sourceId, entry.name].some(value => value && normalize(value) === normalize(id));

export function ownedRestAbilities(state: GameState): RuleEntry[] {
  const data = state.character.daggerheart;
  if (!data || state.campaign.system !== "Daggerheart") return [];
  const groups = [data.classFeatures, data.subclassFeatures, data.ancestry?.features, data.community?.features, data.domainCards];
  const refs = groups.flatMap(group => group || []);
  const owned = entries.filter(entry => entry.sessionRest && refs.some(ref => matches(entry, ref.id) || normalize(entry.name) === normalize(ref.name)));
  for (const item of state.inventory.filter(item => item.qty > 0)) {
    const entry = entries.find(entry => entry.sessionRest && ["loot", "consumable", "weapon", "armor"].includes(entry.type)
      && (matches(entry, item.sourceId || item.id) || normalize(entry.name) === normalize(item.name)));
    if (entry && !owned.some(value => value.id === entry.id)) owned.push(entry);
  }
  return owned;
}

export function restCycleFor(state: GameState): RestCycle {
  const saved = state.character.daggerheart?.restCycle;
  if (saved) return saved;
  const inspired = state.character.daggerheart?.trackers?.some(tracker => tracker.id === "bard-rally" && tracker.value > 0);
  return { completed: 0, used: inspired ? { "core-classFeature-rally": 1 } : {} };
}

export function restAbilityAvailability(state: GameState) {
  const cycle = restCycleFor(state);
  const data = state.character.daggerheart;
  return ownedRestAbilities(state).filter(entry => entry.sessionRest?.useLimit).map(entry => {
    const improvedContacts = entry.sourceId === "Contacts Everywhere" && data?.subclassFeatures.some(ref =>
      entries.some(e => e.sourceId === "Reliable Backup" && (matches(e, ref.id) || normalize(e.name) === normalize(ref.name))));
    const limit = improvedContacts ? 3 : entry.sessionRest!.useLimit!;
    const used = Math.max(0, cycle.used[entry.id] || 0);
    return { id: entry.id, sourceId: entry.sourceId, name: entry.name, limit, used, remaining: Math.max(0, limit - used), refreshAt: "longRestEnd" as const };
  });
}

export function useRestAbility(state: GameState, abilityId: string) {
  const ability = restAbilityAvailability(state).find(entry => [entry.id, entry.sourceId].some(id => id && normalize(id) === normalize(abilityId)));
  const cycle = restCycleFor(state);
  if (!ability || !ability.remaining || cycle.active) return { state, result: { ok: false, error: "Habilidade não disponível. Os usos são renovados somente ao terminar um descanso longo." } };
  const next = structuredClone(state);
  next.character.daggerheart!.restCycle = {
    ...cycle, used: { ...cycle.used, [ability.id]: ability.used + 1 },
    priorRollIds: { ...cycle.priorRollIds, [ability.id]: (state.rollHistory || []).map(roll => roll.id) },
  };
  if (ability.sourceId === "Rally") {
    const tracker = next.character.daggerheart!.trackers?.find(tracker => tracker.id === "bard-rally");
    if (tracker) { tracker.value = 1; tracker.active = true; }
  }
  return { state: next, result: { ok: true, ability: { ...ability, used: ability.used + 1, remaining: ability.remaining - 1 } } };
}

/** Called by the command bus, so manual edits cannot accidentally refresh Inspiration. */
export function trackRestAbilityActivation(state: GameState, tracker: CharacterTracker, requested: number) {
  if (state.campaign.system !== "Daggerheart") return { state, result: { ok: true } };
  if (requested > 0 && restCycleFor(state).active && trackerRule(tracker)?.expiresAt === "longRestStart") return { state, result: { ok: false } };
  if (tracker.id !== "bard-rally") return { state, result: { ok: true } };
  if (requested > 0 && restCycleFor(state).active) return { state, result: { ok: false } };
  if (requested > 0 && tracker.value <= 0) return useRestAbility(state, "Rally");
  if (state.character.daggerheart?.restCycle) return { state, result: { ok: true } };
  const next = structuredClone(state);
  next.character.daggerheart!.restCycle = structuredClone(restCycleFor(state));
  return { state: next, result: { ok: true } };
}

function trackerRule(tracker: CharacterTracker) {
  return entries.find(entry => matches(entry, tracker.source.id))?.sessionRest;
}

export function refreshRestAbility(state: GameState, abilityId: string, rollId: string) {
  const abilities = ownedRestAbilities(state);
  const ability = restAbilityAvailability(state).find(entry => [entry.id, entry.sourceId].some(id => id && normalize(id) === normalize(abilityId)));
  const cycle = restCycleFor(state);
  const roll = state.rollHistory?.find(roll => roll.id === rollId);
  if (!abilities.some(entry => entry.sourceId === "Invigoration") || !ability || ability.used < 1 || cycle.active
    || !roll?.dice?.some(die => die.die === "d6" && die.value === 6) || cycle.recoveryRollIds?.includes(rollId)
    || cycle.priorRollIds?.[ability.id]?.includes(rollId)) {
    return { state, result: { ok: false, error: "Revigorar exige a carta, um uso gasto e uma nova rolagem registrada com resultado 6 em d6." } };
  }
  const next = structuredClone(state);
  next.character.daggerheart!.restCycle = { ...cycle, used: { ...cycle.used, [ability.id]: ability.used - 1 }, recoveryRollIds: [...(cycle.recoveryRollIds || []), rollId] };
  return { state: next, result: { ok: true, ability: { ...ability, used: ability.used - 1, remaining: ability.remaining + 1 } } };
}

export function changeLongRest(state: GameState, phase: string, restId?: string) {
  if (state.campaign.system !== "Daggerheart" || !state.character.daggerheart || !["start", "finish", "interrupt"].includes(phase)) {
    return { state, result: { ok: false, error: "Descanso longo inválido para este personagem." } };
  }
  const cycle = restCycleFor(state);
  if (phase === "start" && cycle.active) return { state, result: { ok: true, unchanged: true, restId: cycle.active.id } };
  if (phase === "finish" && restId && restId === cycle.lastCompletedId) return { state, result: { ok: true, unchanged: true, restId } };
  if (phase !== "start" && (!restId || cycle.active?.id !== restId)) return { state, result: { ok: false, error: "Informe o restId do descanso longo em andamento." } };
  const next = structuredClone(state);
  const data = next.character.daggerheart!;
  data.restCycle = structuredClone(cycle);
  const expired: string[] = [];
  if (phase === "start") {
    data.restCycle.active = { id: globalThis.crypto.randomUUID(), startedAtCampaignMinute: next.time.campaignMinute };
    for (const tracker of data.trackers || []) {
      const rule = trackerRule(tracker);
      const expires = tracker.id === "bard-rally" || rule?.expiresAt === "longRestStart"
        || /ao iniciar um descanso longo/i.test(sessionRuleText(tracker.description || ""));
      if (!expires) continue;
      if (trackerRule(tracker) && entries.find(entry => matches(entry, tracker.source.id))?.sourceId === "Slayer") {
        const count = tracker.kind === "dicePool" ? (tracker.dice || []).filter(value => value > 0).length : tracker.value;
        next.character.hope = Math.min(next.character.maxHope, next.character.hope + count);
      }
      tracker.value = 0; tracker.active = false;
      if (tracker.kind === "dicePool") tracker.dice = [];
      expired.push(tracker.name);
    }
  } else if (phase === "finish") {
    data.restCycle.completed += 1;
    data.restCycle.used = {};
    data.restCycle.priorRollIds = {};
    data.restCycle.lastCompletedId = restId;
    delete data.restCycle.active;
    const luck = ownedRestAbilities(next).some(entry => entry.sourceId === "Luckbringer");
    if (luck) next.character.hope = Math.min(next.character.maxHope, next.character.hope + 1);
  } else delete data.restCycle.active;
  const refreshRequired = phase === "finish" ? ownedRestAbilities(next).filter(entry => entry.sessionRest?.initializesAt === "longRestEnd" && entry.sourceId !== "Luckbringer") : [];
  return { state: next, result: {
    ok: true, phase, restId: phase === "start" ? data.restCycle.active!.id : restId,
    expired, abilityUses: restAbilityAvailability(next), refreshRequired,
    automaticallyApplied: [
      ...(phase === "start" ? ["Recursos dos trackers em expired foram descartados; Dados de Matança já concederam a Esperança correspondente."] : []),
      ...(phase === "finish" && ownedRestAbilities(next).some(entry => entry.sourceId === "Luckbringer") ? ["Talismã da Sorte já concedeu 1 Esperança ao personagem do jogador."] : []),
    ],
    expiredAbilities: phase === "start" ? ownedRestAbilities(next).filter(entry => entry.sessionRest?.expiresAt === "longRestStart") : [],
    groupEffects: phase === "finish" && ownedRestAbilities(next).some(entry => entry.sourceId === "Luckbringer") ? ["Talismã da Sorte: os demais membros do grupo recebem 1 Esperança."] : [],
  } };
}
