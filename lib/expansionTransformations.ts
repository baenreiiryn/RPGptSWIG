import type { CharacterState, GameState, PlayerRollRequest, RollResolution } from "@/lib/game";
import raw from "./compendium/daggerheart.generated.json" with { type: "json" };
import { parseDiceFormula } from "./dice";

export const EXPANSION_TRANSFORMATIONS = [
  { key: "werewolf", sourceId: "Werewolf", name: "Lobisomem", glyph: "☾" },
  { key: "vampire", sourceId: "Vampire", name: "Vampiro", glyph: "◆" },
  { key: "ghost", sourceId: "Ghost", name: "Fantasma", glyph: "◌" },
  { key: "reanimated", sourceId: "Reanimated", name: "Reanimado", glyph: "✚" },
  { key: "shapeshifter", sourceId: "Shapeshifter", name: "Metamorfo", glyph: "◭" },
  { key: "demigod", sourceId: "Demigod", name: "Semi-Deus", glyph: "☀" },
] as const;
export type ExpansionTransformationKey = typeof EXPANSION_TRANSFORMATIONS[number]["key"];
export type ExpansionTransformation = {
  key: ExpansionTransformationKey;
  acquiredTier: number;
  ghostTier?: number;
  spiritActive?: boolean;
  materialAttackReady?: boolean;
  wolfActive?: boolean;
  wolfEligible?: boolean;
  frenzyPending?: boolean;
  blood?: number;
  empoweredAttack?: boolean;
  fedAttackIds?: string[];
  divinityPendingRollIds?: string[];
  divinityResolvedRollIds?: string[];
  /** Cumulative extra Fear granted by this card; not the GM's current Fear pool. */
  fearGranted?: number;
};
const tierFor = (level: number) => level >= 8 ? 4 : level >= 5 ? 3 : level >= 2 ? 2 : 1;
export const expansionState = (character: CharacterState, key: ExpansionTransformationKey) => character.daggerheart?.expansionTransformations?.find(item => item.key === key);
export const permanentMarkedHp = (character: CharacterState) => Math.max(0, Math.min(character.maxHp, character.permanentHp || 0));
function acquireTransformation(character: CharacterState, key: ExpansionTransformationKey) {
  const tier = tierFor(character.level);
  character.daggerheart!.expansionTransformations = [...(character.daggerheart!.expansionTransformations || []), { key, acquiredTier: tier, ...(key === "ghost" ? { ghostTier: tier } : {}), ...(key === "vampire" ? { blood: 0 } : {}) }];
  if (key === "ghost") {
    character.permanentHp = Math.min(character.maxHp, permanentMarkedHp(character) + 1);
    character.hp = Math.min(character.maxHp, character.hp + 1);
    if (character.hp >= character.maxHp) character.death = { status: "last-glory", move: "glory" };
  }
}
export function withStartingTransformation(character: CharacterState, key?: ExpansionTransformationKey): CharacterState {
  if (!key) return character;
  if (!character.daggerheart || !EXPANSION_TRANSFORMATIONS.some(item => item.key === key)) throw new Error("Escolha uma transformação válida da expansão.");
  const owned = character.daggerheart.expansionTransformations || [];
  if (owned.length) {
    if (owned.length === 1 && owned[0].key === key) return character;
    throw new Error("Escolha apenas uma transformação inicial.");
  }
  const next = structuredClone(character);
  acquireTransformation(next, key);
  return next;
}
export function clearWolfOpportunity(state: GameState) {
  if (!expansionState(state.character, "werewolf")?.wolfEligible) return state;
  const next = structuredClone(state);
  expansionState(next.character, "werewolf")!.wolfEligible = false;
  return next;
}
export function expansionCanHeal(character: CharacterState, source?: string, freshRemains?: boolean) {
  return !expansionState(character, "reanimated") || source === "risk" || (source === "rest" && freshRemains === true);
}
export function gainExpansionHope(character: CharacterState, amount: number) {
  if (expansionState(character, "werewolf")?.wolfActive) character.stress = Math.min(character.maxStress, character.stress + amount);
  else character.hope = Math.min(character.maxHope, character.hope + amount);
}
export function expansionContext(state: GameState) {
  const forms = state.character.daggerheart?.expansionTransformations || [];
  const sources = forms.map(form => EXPANSION_TRANSFORMATIONS.find(item => item.key === form.key)?.sourceId);
  return {
    forms, permanentMarkedHp: permanentMarkedHp(state.character),
    features: raw.entries.filter(entry => entry.type === "transformationFeature" && sources.includes(entry.parent as typeof sources[number])),
    wolfDie: expansionState(state.character, "werewolf")?.wolfActive ? "1d10 extra em ataque e dano" : undefined,
    advantageDie: expansionState(state.character, "demigod") ? "d10" : "d6",
    starving: Boolean(expansionState(state.character, "vampire")) && (expansionState(state.character, "vampire")?.blood || 0) === 0,
    spiritDefense: expansionState(state.character, "ghost")?.spiritActive ? "Imune a dano físico; dano mágico dobrado" : undefined,
  };
}
export function reconcileExpansionCharacter(character: CharacterState): CharacterState {
  const ghost = expansionState(character, "ghost");
  if (!ghost || (ghost.ghostTier || ghost.acquiredTier) >= tierFor(character.level)) return character;
  const next = structuredClone(character);
  const count = tierFor(character.level) - (ghost.ghostTier || ghost.acquiredTier);
  next.permanentHp = Math.min(next.maxHp, permanentMarkedHp(next) + count);
  next.hp = Math.min(next.maxHp, next.hp + count);
  expansionState(next, "ghost")!.ghostTier = tierFor(next.level);
  if (next.hp >= next.maxHp && next.death?.status !== "dead") next.death = { status: "last-glory", move: "glory" };
  return next;
}
function log(state: GameState, text: string) {
  state.messages.push({ id: globalThis.crypto.randomUUID(), role: "system", text, createdAt: new Date().toISOString(), campaignMinute: state.time.campaignMinute });
}
export function setExpansionTransformation(state: GameState, key: string, active: boolean) {
  const definition = EXPANSION_TRANSFORMATIONS.find(item => item.key === key || item.sourceId === key);
  if (!definition || !state.character.daggerheart || state.campaign.system !== "Daggerheart") return { state, result: { ok: false, error: "Transformação da expansão inválida." } };
  const existing = expansionState(state.character, definition.key);
  if (!active && existing?.divinityPendingRollIds?.length) return { state, result: { ok: false, error: "Resolva O Peso da Divindade antes de remover esta transformação." } };
  if (Boolean(existing) === active) return { state, result: { ok: true, unchanged: true } };
  if (state.pendingRoll) return { state, result: { ok: false, error: "Conclua a rolagem pendente antes de alterar as transformações adquiridas." } };
  const next = structuredClone(state);
  const data = next.character.daggerheart!;
  data.expansionTransformations = (data.expansionTransformations || []).filter(item => item.key !== definition.key);
  if (active) acquireTransformation(next.character, definition.key);
  log(next, `${active ? "Transformação adquirida" : "Transformação removida"}: ${definition.name}.${!active ? " Marcas permanentes de PV são preservadas." : ""}`);
  return { state: next, result: { ok: true, transformation: definition.name, active, rules: expansionContext(next) } };
}
export function prepareExpansionRoll(state: GameState, request: PlayerRollRequest): { state: GameState; request: PlayerRollRequest } {
  if (state.campaign.system !== "Daggerheart" || request.expansionApplied || request.purpose?.startsWith("death-")) return { state, request };
  if (expansionState(state.character, "demigod")?.divinityPendingRollIds?.length) throw new Error("Escolha o custo de O Peso da Divindade antes da próxima rolagem.");
  const next = structuredClone(state);
  const prepared = { ...request, expansionApplied: true };
  const wolf = expansionState(next.character, "werewolf");
  if (wolf && !wolf.wolfActive) wolf.wolfEligible = false;
  const attack = request.actionType === "attack" || request.rollKind === "attack";
  const damage = request.actionType === "damage" || request.rollKind === "damage";
  const actionTest = !damage && (attack || ["duality", "check", "reaction"].includes(request.rollKind || ""));
  const ghost = expansionState(next.character, "ghost");
  if (attack && ghost?.spiritActive && request.materialTarget !== false) {
    if (!ghost.materialAttackReady) throw new Error("Forma Espiritual: gaste 2 Esperança para interagir/atacar o mundo material antes deste ataque.");
    ghost.materialAttackReady = false;
  }
  const vampire = expansionState(next.character, "vampire");
  if (attack && vampire?.empoweredAttack && prepared.formula) {
    const parsed = parseDiceFormula(prepared.formula);
    if (parsed.terms.filter(term => term.sign > 0 && term.sides === 12).reduce((sum, term) => sum + term.count, 0) !== 2) throw new Error("O ataque potencializado exige os dois d12 de Dualidade na fórmula-base.");
    let removed = 0;
    const terms = parsed.terms.flatMap(term => {
      let count = term.count;
      if (term.sign > 0 && term.sides === 12 && removed < 2) { const take = Math.min(count, 2 - removed); count -= take; removed += take; }
      return count ? [`${term.sign < 0 ? "-" : "+"}${count}d${term.sides}`] : [];
    });
    prepared.formula = "1d12+1d20" + terms.join("") + (parsed.modifier ? `${parsed.modifier > 0 ? "+" : ""}${parsed.modifier}` : "");
    prepared.dualityFearSides = 20;
    prepared.rollKind = "duality";
    vampire.empoweredAttack = false;
  }
  if ((attack || damage) && expansionState(next.character, "werewolf")?.wolfActive) {
    if (!prepared.formula) throw new Error("Informe a fórmula-base do ataque/dano para adicionar o Dado do Lobo.");
    prepared.formula += "+1d10";
  }
  const hungry = actionTest && vampire && (vampire.blood || 0) === 0;
  if (request.advantage && !hungry) {
    if (!prepared.formula) throw new Error("Informe a fórmula-base para aplicar a vantagem.");
    prepared.formula += expansionState(next.character, "demigod") ? "+1d10" : "+1d6";
  }
  if (hungry && !request.advantage) {
    if (!prepared.formula) throw new Error("Informe a fórmula-base para aplicar a desvantagem da fome do Vampiro.");
    prepared.formula += "-1d6";
  }
  if (prepared.formula && prepared.allowedDice?.length) prepared.allowedDice = [...new Set(parseDiceFormula(prepared.formula).terms.map(term => `d${term.sides}` as const))];
  return { state: next, request: prepared };
}
function queueRoll(state: GameState, request: PlayerRollRequest) {
  if (state.pendingRoll) throw new Error("Conclua a rolagem pendente antes de usar esta característica.");
  const prepared = prepareExpansionRoll(state, request);
  prepared.state.pendingRoll = { ...prepared.request, id: globalThis.crypto.randomUUID(), rollKind: prepared.request.rollKind || "custom", requestedAt: new Date().toISOString(), campaignMinute: state.time.campaignMinute };
  return prepared.state;
}
export function ensureWolfFrenzyRoll(state: GameState) {
  const wolf = expansionState(state.character, "werewolf");
  if (wolf?.frenzyPending && !state.pendingRoll) {
    state.pendingRoll = { id: globalThis.crypto.randomUUID(), label: "Frenesi do Lobisomem", reason: "O dano físico da rolagem atinge automaticamente todas as criaturas em alcance Muito Próximo. Depois, a Forma Lupina termina.", formula: `${tierFor(state.character.level)}d20`, rollKind: "damage", purpose: "werewolf-frenzy", requestedAt: new Date().toISOString(), campaignMinute: state.time.campaignMinute };
  }
  return state;
}
export function afterExpansionResourceChange(state: GameState, resource: string, before: number) {
  const wolf = expansionState(state.character, "werewolf");
  if (resource === "hp" && state.character.hp > before && wolf) wolf.wolfEligible = true;
  if (wolf?.wolfActive && state.character.stress >= state.character.maxStress) wolf.frenzyPending = true;
  if (expansionState(state.character, "ghost") && state.character.hp >= state.character.maxHp && state.character.death?.status !== "dead") state.character.death = { status: "last-glory", move: "glory" };
  return ensureWolfFrenzyRoll(state);
}
export function finishExpansionRoll(state: GameState, purpose: string | undefined, resolution: RollResolution) {
  const roll = state.rollHistory?.at(-1);
  if (!purpose?.startsWith("death-") && roll?.outcome === "failure") registerDivinityFailure(state, roll.id);
  if (purpose === "werewolf-frenzy") {
    const wolf = expansionState(state.character, "werewolf");
    if (wolf) { wolf.wolfActive = false; wolf.frenzyPending = false; wolf.wolfEligible = false; }
    log(state, `Frenesi: ${resolution.total} de dano físico automático a todas as criaturas em alcance Muito Próximo. A Forma Lupina terminou.`);
  }
  return ensureWolfFrenzyRoll(state);
}
function registerDivinityFailure(state: GameState, rollId: string) {
  const form = expansionState(state.character, "demigod");
  const roll = state.rollHistory?.find(item => item.id === rollId);
  const hope = roll?.dice?.find(die => die.label === "Esperança")?.value;
  const fear = roll?.dice?.find(die => die.label === "Medo")?.value;
  if (!form || !roll || roll.purpose?.startsWith("death-") || roll.outcome === "success" || hope === undefined || fear === undefined || fear <= hope) return false;
  if (form.divinityResolvedRollIds?.includes(rollId) || form.divinityPendingRollIds?.includes(rollId)) return true;
  form.divinityPendingRollIds = [...(form.divinityPendingRollIds || []), rollId];
  log(state, "O Peso da Divindade: fracasso com Medo. Escolha marcar 1 Fadiga ou conceder 1 Medo adicional ao mestre.");
  return true;
}
export function onExpansionLongRestCompleted(state: GameState) {
  const vampire = expansionState(state.character, "vampire");
  if (vampire) { vampire.blood = Math.max(0, (vampire.blood || 0) - 1); vampire.empoweredAttack = false; }
  const wolf = expansionState(state.character, "werewolf");
  if (wolf) wolf.wolfEligible = false;
}
export function expansionDamage(character: CharacterState, amount: number, damageType: string, useArmor: boolean) {
  const spirit = expansionState(character, "ghost")?.spiritActive;
  const adjustedDamage = spirit ? (damageType === "physical" ? 0 : amount * 2) : amount;
  let hpMarked = adjustedDamage <= 0 ? 0 : adjustedDamage >= character.damageThresholds.severe ? 3 : adjustedDamage >= character.damageThresholds.major ? 2 : 1;
  const armorSpent = useArmor && hpMarked > 0 && character.armor < character.maxArmor ? 1 : 0;
  hpMarked = Math.max(0, hpMarked - armorSpent);
  return { adjustedDamage, hpMarked, armorSpent };
}

export function expansionTransformationAction(state: GameState, key: string, action: string, args: Record<string, unknown> = {}) {
  const owned = state.character.daggerheart?.expansionTransformations?.find(item => item.key === key);
  if (!owned) return { state, result: { ok: false, error: "O personagem não possui esta transformação." } };
  const next = structuredClone(state);
  const character = next.character;
  const form = expansionState(character, owned.key)!;
  const fail = (error: string) => ({ state, result: { ok: false, error } });
  const deathChoice = key === "reanimated" && ["survive", "accept-death"].includes(action);
  const divineConsequence = key === "demigod" && ["fear-failure", "divinity-stress", "divinity-fear"].includes(action);
  if (!deathChoice && !divineConsequence && (state.pendingRoll || character.conditions.includes("Inconsciente") || (character.death && !["resolved"].includes(character.death.status)))) return fail("Resolva a rolagem ou o movimento de morte antes de agir.");
  const stress = () => { if (character.stress >= character.maxStress) throw new Error("Não há espaço de Fadiga disponível para este custo."); character.stress += 1; };
  try {
    if (key === "ghost" && action === "spirit-form") { stress(); form.spiritActive = !form.spiritActive; form.materialAttackReady = false; }
    else if (key === "ghost" && action === "interact") {
      if (!form.spiritActive || character.hope < 2) return fail("Forma Espiritual e 2 Esperança são necessários.");
      character.hope -= 2; form.materialAttackReady = args.forAttack === true;
    } else if (key === "werewolf" && action === "wolf-form") {
      if (form.wolfActive || !form.wolfEligible) return fail("A Forma Lupina só pode ser assumida ao marcar um ou mais PV.");
      stress(); form.wolfActive = true; form.wolfEligible = false;
    } else if (key === "vampire" && action === "fangs") {
      return { state: queueRoll(next, { label: "Presas do Vampiro", reason: "Teste de Força para morder um alvo Corpo-a-Corpo. Em um sucesso, role o dano de Presas.", formula: `2d12${character.daggerheart!.traits.strength >= 0 ? "+" : ""}${character.daggerheart!.traits.strength}`, ...(Number.isFinite(args.target) ? { target: Number(args.target) } : {}), rollKind: "duality", actionType: "attack", purpose: "vampire-fangs" }), result: { ok: true, damageFormula: `${character.proficiency}d8`, damageType: "physical" } };
    } else if (key === "vampire" && action === "feed") {
      const rollId = String(args.attackRollId || "");
      const roll = next.rollHistory?.find(roll => roll.id === rollId);
      const marked = Number(args.targetHitPointsMarked);
      if (!roll || roll.purpose !== "vampire-fangs" || roll.outcome === "failure" || (roll.outcome !== "success" && args.attackSucceeded !== true) || args.targetLiving !== true || !Number.isInteger(marked) || marked < 1 || form.fedAttackIds?.includes(rollId)) return fail("Alimentar-se exige um sucesso registrado de Presas contra uma criatura viva que marcou PV; cada ataque só pode alimentar uma vez.");
      stress(); form.blood = Math.min(5, (form.blood || 0) + marked); form.fedAttackIds = [...(form.fedAttackIds || []), rollId];
    } else if (key === "vampire" && action === "empower") {
      if (!(form.blood || 0) || form.empoweredAttack || next.pendingRoll) return fail("Gaste um marcador antes de solicitar o próximo ataque.");
      form.blood = (form.blood || 0) - 1; form.empoweredAttack = true;
    } else if (key === "demigod" && action === "fear-failure") {
      const rollId = String(args.rollId || "");
      if (!registerDivinityFailure(next, rollId)) return fail("Informe uma falha com Medo registrada; sucessos, críticos e movimentos de morte não ativam esta característica.");
      const roll = next.rollHistory!.find(item => item.id === rollId)!;
      roll.success = false; roll.outcome = "failure";
    } else if (key === "demigod" && ["divinity-stress", "divinity-fear"].includes(action)) {
      const rollId = String(args.rollId || "");
      if (!form.divinityPendingRollIds?.includes(rollId)) return fail("Não há escolha de O Peso da Divindade pendente para esta rolagem.");
      if (action === "divinity-stress") stress();
      else form.fearGranted = (form.fearGranted || 0) + 1;
      form.divinityPendingRollIds = form.divinityPendingRollIds.filter(id => id !== rollId);
      form.divinityResolvedRollIds = [...(form.divinityResolvedRollIds || []), rollId];
    } else if (key === "reanimated" && ["survive", "accept-death"].includes(action)) {
      if (character.death?.status !== "reanimated-choice") return fail("Cadáver só pode ser usado após falhar em Arriscar Tudo.");
      if (action === "accept-death") character.death = { status: "dead", move: "risk", resolvedAt: new Date().toISOString() };
      else {
        if (permanentMarkedHp(character) >= character.maxHp - 1) return fail("Não resta um espaço de PV sacrificável que permita retornar à vida.");
        character.permanentHp = permanentMarkedHp(character) + 1;
        character.death = { status: "risk-recovery", move: "risk", recoveryPoints: character.death.recoveryPoints };
      }
    } else if (key === "shapeshifter" && ["change-shape", "change-benefit"].includes(action)) {
      const rest = character.daggerheart!.restCycle?.active;
      if (!rest && !(action === "change-benefit" && args.shortRest === true)) return fail("Alterar Forma exige uma ação de repouso durante um descanso longo; trocar apenas o benefício também pode ocorrer num descanso curto.");
      const ancestryId = action === "change-benefit" ? character.daggerheart!.ancestry.primary.id : String(args.ancestryId || "");
      const ancestry = raw.entries.find(entry => entry.type === "ancestry" && (entry.id === ancestryId || entry.sourceId === ancestryId));
      const feature = raw.entries.find(entry => entry.type === "ancestryFeature" && (entry.id === String(args.featureId) || entry.sourceId === String(args.featureId)) && entry.parent === ancestry?.sourceId);
      if (!ancestry || !feature) return fail("Escolha uma ancestralidade e exatamente uma característica pertencente a ela.");
      if (rest && (rest.restMovesSpent || 0) >= (rest.availableRestMoves ?? 2)) return fail("Não há ação de repouso disponível neste descanso longo.");
      if (action === "change-shape" && character.daggerheart!.ancestry.primary.id === ancestry.id) return fail("Escolha outra ancestralidade ou use a troca de benefício.");
      if (action === "change-benefit" && character.daggerheart!.ancestry.features.some(item => item.id === feature.id)) return fail("Escolha um benefício diferente do atual.");
      if (rest) rest.restMovesSpent = (rest.restMovesSpent || 0) + 1;
      character.daggerheart!.ancestry = { mixed: false, primary: { id: ancestry.id, name: ancestry.name }, features: [{ id: feature.id, name: feature.name }] };
      if (typeof args.appearance === "string" && args.appearance.trim()) character.appearance = args.appearance.trim().slice(0, 2000);
    } else return fail("Ação inválida para esta transformação.");
    afterExpansionResourceChange(next, "stress", state.character.stress);
    const descriptions: Record<string, string> = {
      "wolf-form": "Forma Lupina assumida; Dado do Lobo ativo",
      "spirit-form": form.spiritActive ? "Forma Espiritual assumida" : "Forma corpórea retomada",
      interact: args.forAttack === true ? "Próximo ataque contra o mundo material preparado" : "Interação com o mundo material",
      feed: `Alimentou-se; ${form.blood || 0}/5 marcadores`,
      empower: "Próximo ataque potencializado: Dado de Medo em d20",
      "fear-failure": "O Peso da Divindade aguarda a escolha do jogador",
      "divinity-stress": "O Peso da Divindade: 1 Fadiga marcada",
      "divinity-fear": "O Peso da Divindade: mestre recebeu 1 Medo adicional",
      survive: "Cadáver usado: 1 PV marcado permanentemente para sobreviver",
      "accept-death": "A jornada chegou ao fim",
      "change-shape": `Forma alterada para ${character.daggerheart!.ancestry.primary.name}; uma ação de repouso usada`,
      "change-benefit": `Benefício ancestral alterado para ${character.daggerheart!.ancestry.features[0]?.name}; uma ação de repouso usada`,
    };
    log(next, `${EXPANSION_TRANSFORMATIONS.find(item => item.key === key)!.name}: ${descriptions[action] || "característica utilizada"}.`);
    return { state: next, result: { ok: true, transformation: form, permanentMarkedHp: permanentMarkedHp(character) } };
  } catch (error) { return fail(error instanceof Error ? error.message : "Não foi possível aplicar a transformação."); }
}
