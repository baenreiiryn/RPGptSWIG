import {
  executeCommand,
  requestPlayerRoll,
  type DiceType,
  type GameState,
  type RollKind,
  type TimelineEntry,
  type TimelineKind,
} from "@/lib/game";
import {
  addCalendarEvent,
  advanceCampaignTime,
  deriveCampaignDateTime,
  formatCampaignDateTime,
  removeCalendarEvent,
  setCampaignWeather,
  updateCalendarEvent,
  type CampaignCalendarEvent,
  type CalendarEventKind,
  type WeatherCondition,
} from "@/lib/campaignTime";
import { parseDiceFormula, type ParsedDiceFormula } from "@/lib/dice";
import { formatTimelineEntryDate, timelineEntrySortValue, worldDateOrdinalMinute } from "@/lib/timeline";
import { oracleTools } from "@/lib/tools";
import compendium from "./compendium/daggerheart.generated.json" with { type: "json" };
import type { CompendiumEntry } from "@/lib/compendium/daggerheart";
import { triggerCampaignMilestoneLevelUp } from "@/lib/daggerheartAdvancement";
import { changeLongRest, refreshRestAbility, restAbilityAvailability, restCycleFor, useRestAbility } from "@/lib/longRest";
import {
  attachCraftPendingRoll,
  awardCraftXp,
  buildCraftRollPlan,
  craftLevelForXp,
  ensureCraftingState,
  findMatchingRecipe,
  learnCraftRecipe,
  rejectCraftAttempt,
  rarityCapForLevel,
  type CraftDiscipline,
  type CraftIngredient,
  type CraftLearnedFrom,
  type CraftRecipe,
  type CraftRecipeLayout,
  type CraftRarity,
} from "@/lib/crafting";

const WEATHER_CONDITIONS: WeatherCondition[] = [
  "clear",
  "partly-cloudy",
  "cloudy",
  "rain",
  "storm",
  "snow",
  "fog",
  "wind",
  "custom",
];
const WEATHER_INTENSITIES = ["light", "moderate", "heavy"] as const;
const CALENDAR_EVENT_KINDS: CalendarEventKind[] = ["quest", "effect", "appointment", "world", "custom"];
const DICE_TYPES: DiceType[] = ["d2", "d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const ROLL_KINDS: RollKind[] = ["attack", "damage", "reaction", "check", "duality", "custom"];
const TIMELINE_KINDS: TimelineKind[] = ["discovery", "quest", "combat", "travel", "relationship", "world", "milestone", "other"];

function normalizeTimelineText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export const responseTools = oracleTools.map((tool) => ({
  type: "function",
  name: tool.name,
  description: tool.description,
  parameters: tool.inputSchema,
}));

export function gmInstructions(system: string) {
  return [
    "Você é o Mestre de RPG do OracleRPG.",
    `O sistema atual é ${system}.`,
    "Narre em português brasileiro com clareza e atmosfera, sem controlar as decisões do personagem do jogador.",
    "Texto do jogador entre **asteriscos duplos** descreve explicitamente uma ação do personagem; interprete **texto** como algo que o personagem faz. Texto fora desses marcadores pode ser fala, intenção ou comentário e deve ser interpretado pelo contexto.",
    "O OracleRPG é a fonte da verdade para estado mecânico, inventário, missões e memória.",
    "Use ferramentas sempre que uma ação alterar dados persistentes ou quando precisar consultar memória.",
    "Quando a narração indicar passagem de tempo, avance o relógio da campanha pelo tempo transcorrido descrito, inclusive minutos, horas ou dias.",
    "CENA ATUAL: quando o grupo entrar em uma sala diferente, sair para uma rua, viajar para outra área, chegar a uma cidade, floresta, ruína ou qualquer ambiente fisicamente distinto, use scene_set com um rótulo curto e visual do novo local. Não use scene_set para pequenas ações ou mudanças de enquadramento dentro do mesmo ambiente.",
    "O campo de cena alimenta o painel visual fixo da Sessão: uma mudança via scene_set invalida a imagem anterior e o OracleRPG buscará automaticamente uma nova referência de ambiente na web.",
    "Se advance_time retornar reachedEvents, esses prazos ou efeitos chegaram ao fim durante a passagem de tempo e devem ser considerados na narração e no estado.",
    "Quando a narração mudar o clima, atualize o clima persistido da campanha para refletir a nova condição.",
    "Use eventos do calendário para prazos de missões, buffs, efeitos temporários e acontecimentos futuros que dependam do tempo da campanha.",
    "Quando o grupo aceitar uma nova missão, registre-a com quest_add; se houver prazo, informe deadlineMinutes para que o Oracle crie o prazo no calendário automaticamente.",
    "Para eventos relativos ao momento atual, prefira startsInMinutes e durationMinutes em vez de calcular datas manualmente.",
    "Não invente valores mecânicos que já estejam no contexto.",
    "CARACTERÍSTICAS DO PERSONAGEM: characterAbilities contém as regras completas das habilidades que este personagem possui. Interprete a intenção e a fala do jogador à luz dessas regras, sem exigir o nome exato da habilidade. abilityIntentHints são apenas candidatos: confirme o contexto, a disponibilidade, os limites e os trackers antes de aplicar qualquer efeito.",
    "INSPIRAÇÃO DO BARDO (Rally): falar para inspirar, encorajar os companheiros ou fazer um discurso pode declarar o uso de Inspiração. Se o personagem possui essa característica, use a regra dela e registre a ativação do Dado de Inspiração com character_tracker_set. Não substitua automaticamente a característica por um teste social genérico nem exija um teste para ativá-la quando a regra não pede. Não conceda a habilidade a quem não a possui nem ignore o limite por descanso longo. Inspirar o grupo e gastar um dado já concedido são ações diferentes.",
    "REGRA DO ORACLERPG — CICLO DE DESCANSO LONGO: todas as referências mecânicas a sessão foram adaptadas. Usos antes limitados por sessão são renovados somente AO TERMINAR um descanso longo. Recursos/efeitos antes perdidos ao fim da sessão são perdidos AO INICIAR um descanso longo. Benefícios antes recebidos no início da sessão ocorrem AO TERMINAR o descanso longo. Fechar/reabrir o app, mudar de chat/cena, avançar o calendário ou fazer descanso curto não inicia nem renova esse ciclo.",
    "DESCANSO LONGO: quando o descanso realmente começar na ficção, chame character_long_rest com phase=start. Só após o descanso ser concluído, avance o relógio pelo tempo narrado e chame phase=finish com o restId retornado. Se for interrompido, use phase=interrupt: os recursos expirados não voltam e os usos gastos não são renovados. Não confunda a intenção de descansar com descanso concluído. A ferramenta trata APENAS o ciclo adaptado; aplique separadamente as escolhas normais de repouso, cura e reparos conforme as regras.",
    "USOS LIMITADOS: sessionAbilityUses informa limite, usados e restantes. Ao ativar uma dessas habilidades ou itens, registre com character_ability_use antes de conceder efeitos; a ferramenta recusa usos esgotados. A ativação de Inspiração por character_tracker_set também registra seu uso automaticamente; não conte a concessão duas vezes. Recursos já concedidos podem ser gastos sem novo uso da habilidade. Revigorar pode recuperar um uso por character_ability_refresh somente após cumprir a condição e a rolagem da carta.",
    "EFEITOS DO CICLO: character_long_rest devolve refreshRequired para benefícios que exigem a regra de início do ciclo, como Dados de Oração, Fases Lunares e Liberar o Caos. Resolva cada um conforme sua descrição adaptada. Dados exigidos do jogador devem passar por request_player_roll; não invente resultados. Não repita os efeitos listados em automaticallyApplied. Ao iniciar o descanso, aplique também a expiração aos aliados/NPCs que receberam recursos como Inspiração e considere os efeitos devolvidos em expiredAbilities e groupEffects.",
    "PONTOS DE VIDA EM DAGGERHEART: character.hp representa espaços de PV MARCADOS, exatamente como Fadiga marcada. 0 PV marcados significa personagem intacto; maxHp PV marcados dispara o movimento de morte. Em character_adjust_resource, amount positivo em hp MARCA dano e amount negativo LIMPA dano. Nunca some PV para representar cura.",
    "TRACKERS: se uma característica, subclasse ou carta possuir contador/dado persistente, use character_tracker_set imediatamente quando a ação ou regra gastar, ganhar, ativar ou alterar esse recurso. O tracker do OracleRPG é a fonte da verdade; não deixe a alteração apenas na narração.",
    "AVANÇO EM DAGGERHEART: níveis são concedidos somente por milestone narrativo, nunca por XP. Quando decidir que o grupo alcançou um milestone que concede nível, use campaign_milestone_level_up uma única vez; a ferramenta cria o level-up pendente e a interface coleta os avanços do jogador antes de alterar o nível.",
    "FORMA DE FERA E OUTRAS TRANSFORMAÇÕES: ao Druida entrar em Forma de Fera, use character_transformation_set com os modificadores/atributos da forma. Ao sair da forma, chame a mesma ferramenta com active=false. Nunca sobrescreva permanentemente os atributos-base do personagem para representar uma forma temporária.",
    "COMPANHEIRO ANIMAL: quando o companheiro do Patrulheiro sofrer ou limpar Fadiga, atualize-a com animal_companion_adjust_stress.",
    "MORTE: quando todos os PV estiverem marcados, não escolha um movimento de morte pelo jogador e não contorne a interface do OracleRPG. O jogador escolhe Evitar a Morte, Glória Final ou Arriscar Tudo. Se o estado indicar Glória Final, trate a próxima ação declarada do personagem como um crítico automático, conclua sua consequência e então encerre a vida do personagem.",
    "Quando o desfecho depender de uma rolagem do jogador, use request_player_roll. Nunca role pelo jogador nem invente o resultado.",
    "Nunca peça uma rolagem apenas no texto: todo pedido de dados deve criar request_player_roll com a fórmula e os modificadores corretos para que o jogador possa rolar pela interface.",
    "Ao chamar request_player_roll, encerre a resolução naquele ponto e aguarde o jogador fornecer o resultado. Não narre sucesso, falha, dano ou consequência da rolagem no mesmo turno.",
    "Se pendingRoll estiver preenchido no estado, a cena está aguardando essa rolagem: não solicite outra e não avance suas consequências até receber o resultado.",
    "Quando pendingRoll desaparecer e o resultado aparecer em rollHistory, continue a cena a partir daquele resultado. Você pode narrar brevemente a consequência e então pedir outra rolagem quando a sequência exigir, por exemplo ataque acertou e agora requer dano.",
    "Em Daggerheart, pedidos de Dualidade devem usar rollKind duality e uma fórmula com exatamente 2d12 para Esperança e Medo; dados auxiliares e modificadores podem ser acrescentados à mesma fórmula.",
    "CRAFTING: quando crafting.pendingAttempt estiver em stage=review, o jogador acabou de colocar itens no grid. Avalie a combinação exata por slot e a disciplina escolhida.",
    "Se crafting.pendingAttempt.intent existir, trate esse texto como a intenção declarada pelo jogador: use-o para entender o objetivo pretendido, sem transformar automaticamente uma combinação incoerente em receita válida.",
    "Se uma combinação de crafting desconhecida não fizer sentido, use craft_reject_attempt e explique brevemente por quê. Não consuma materiais.",
    "Se a combinação desconhecida fizer sentido como receita, primeiro registre a receita com craft_recipe_learn usando learnedFrom=discovery e fromPendingAttempt=true; escolha shaped quando a posição importar e shapeless quando só a composição importar. Depois use craft_request_roll para a receita criada.",
    "Em receitas de Encantamento, informe baseSlot apontando o item exato que será encantado e use result.patch para descrever as alterações aplicadas a esse item-base; os demais ingredientes são reagentes.",
    "Se a tentativa corresponder a uma receita já conhecida, use diretamente craft_request_roll com o recipeId conhecido.",
    "Nunca invente fórmula, CD ou chance de crafting: craft_request_roll calcula tudo pelo nível, raridade e sistema. Não use request_player_roll genérico para crafting.",
    "Não narre sucesso/falha do crafting antes da rolagem. Em falha, os materiais não são consumidos automaticamente. Em crítico, o motor eleva o produto em uma categoria de raridade.",
    "Receitas-base Lendárias não existem: Lendário só pode surgir por crítico de uma receita Muito rara.",
    "Quando um professor, livro ou pergaminho ensinar uma receita, use craft_recipe_learn com ingredients explícitos e learnedFrom apropriado. Um professor também pode conceder craft_award_xp quando houver treino real; livro/pergaminho não concede XP técnico automaticamente.",
    "Para treinamento de crafting, use craft_award_xp de forma parcimoniosa: 25–50 XP para dica/técnica curta, 50–100 para aula relevante, 100–150 para instrução intensiva e até 200 apenas para treinamento excepcional.",
    "Faça alterações mecânicas antes de narrar seus efeitos quando isso for necessário.",
    "Registre em memória apenas fatos relevantes que precisem sobreviver ao contexto recente.",
    "O timeline da aba Memória é a cronologia curta e visível do jogador. Quando algo importante acontecer ou for descoberto — uma pista, encontro decisivo, missão, viagem marcante, mudança de relação ou marco da campanha — registre o acontecimento com timeline_entry_add após ele estar estabelecido.",
    "Cada entrada do timeline deve conter apenas UM acontecimento ou fato histórico. Se o mesmo trecho revelar vários fatos (por exemplo: alguém salvou um reino e depois fundou uma academia), faça chamadas separadas, mesmo que você atribua a mesma data aos dois.",
    "Nunca cole o texto inteiro de uma memória, do gancho da aventura ou da história do personagem no timeline. Extraia o acontecimento, dê um título curto e descreva-o em no máximo duas frases objetivas.",
    "Ao registrar retroativamente um fato histórico sem data exata, estipule uma data plausível e coerente com a cronologia. Use year/monthIndex/day/hour/minute em timeline_entry_add. É permitido estipular anos antigos e usar a mesma data em acontecimentos distintos.",
    "Um fato histórico descoberto agora deve aparecer na data histórica estimada em que ocorreu; uma descoberta que só existe no presente usa a data atual.",
    "Não transforme cada batida da narração em timeline. Registre apenas acontecimentos que ajudam o jogador a entender a história depois.",
    "Aceitar, concluir ou falhar uma missão normalmente merece uma entrada de timeline quando isso for relevante ao histórico da campanha.",
    "Timeline e memória têm papéis diferentes: timeline é player-facing e cronológico; memory_record é para fatos persistentes, segredos e detalhes úteis ao Mestre. Não duplique o mesmo texto nos dois sem necessidade.",
    "Não coloque segredos ainda desconhecidos no timeline público. Se precisar pré-registrar algo oculto, use visibility hidden e revele depois com timeline_entry_set_visibility.",
    "Eventos futuros pertencem ao calendário. timeline_entry_add só registra algo que já aconteceu ou foi descoberto; avance o tempo primeiro quando a ficção tiver passado tempo.",
    "Quando uma característica visual estável de um personagem for estabelecida pela primeira vez, registre-a como memória visual.",
    "Não revele segredos que o personagem não teria como saber.",
    "Formate a resposta em parágrafos curtos. Separe sempre narração e fala em parágrafos distintos.",
    "Quando um NPC falar, coloque a fala em um parágrafo próprio, preferencialmente iniciada por travessão.",
    "Nunca entregue narração e várias falas como um único bloco corrido.",
    "Depois das ferramentas, produza a narração final e, quando apropriado, pergunte o que o jogador faz. A exceção é request_player_roll: após essa ferramenta, pare e aguarde a rolagem sem continuar a narração.",
  ].join("\n");
}

export function buildCampaignOpeningPrompt(state: GameState, source: "creation" | "restart") {
  const companionNames = state.npcs.map((npc) => npc.name).filter(Boolean);
  return [
    "ABERTURA AUTOMÁTICA DA CAMPANHA.",
    source === "restart"
      ? "Esta é uma nova abertura a partir do estado inicial da criação. Trate como um novo início e não mencione que a campanha foi reiniciada, recomeçada ou que existiu uma versão anterior."
      : "O jogador acabou de concluir a criação do personagem e ainda não realizou nenhuma ação na ficção.",
    "Inicie a aventura agora, sem esperar o jogador escrever a primeira ação.",
    "Use como base a história do personagem, ancestralidade, classe/subclasse, comunidade, experiências, equipamentos, gancho da aventura, tom da campanha, memórias de criação e companheiros presentes.",
    companionNames.length
      ? `Companheiros inicialmente disponíveis no contexto: ${companionNames.join(", ")}. Inclua apenas quem fizer sentido estar presente na abertura.`
      : "Não há companheiros NPC registrados para esta abertura.",
    "Antes da narração final, use obrigatoriamente scene_set para registrar um local físico curto e concreto que represente a primeira cena (sala, rua, floresta, cidade, ruína etc.). Esse local será usado para buscar automaticamente a imagem da cena.",
    "Narre a primeira cena em alguns parágrafos curtos: estabeleça o ambiente, a atmosfera, a situação imediata e um elemento que convide o personagem a agir.",
    "Não escolha ações pelo personagem, não resolva decisões por ele e não peça nenhuma rolagem nesta abertura, pois o jogador ainda não declarou uma ação.",
    "Não diga apenas que a jornada está pronta. A ficção já deve estar acontecendo quando a resposta terminar.",
  ].join("\n");
}

export function ownedCharacterAbilities(state: GameState) {
  const character = state.character.daggerheart;
  if (!character) return [];
  const groups = [
    ["classFeature", character.classFeatures || []],
    ["subclassFeature", character.subclassFeatures || []],
    ["ancestryFeature", character.ancestry?.features || []],
    ["communityFeature", character.community?.features || []],
    ["domainCard", character.domainCards || []],
  ] as const;
  const owned = new Map<string, CompendiumEntry>();
  for (const [type, references] of groups) {
    for (const reference of references) {
      const candidates = (compendium.entries as CompendiumEntry[]).filter((entry) => entry.type === type);
      const exact = candidates.find((entry) => entry.id === reference.id || entry.sourceId === reference.id);
      const named = candidates.filter((entry) => normalizeTimelineText(entry.name) === normalizeTimelineText(reference.name));
      const entry = exact || (named.length === 1 ? named[0] : undefined);
      if (entry) owned.set(entry.id, entry);
    }
  }
  return [...owned.values()].map((entry) => ({
    id: entry.id, sourceId: entry.sourceId, name: entry.name, type: entry.type,
    description: entry.description, mechanics: entry.mechanics,
    trackers: (character.trackers || []).filter((tracker) =>
      tracker.source.type === entry.type && (tracker.source.id === entry.id || tracker.source.id === entry.sourceId)),
  }));
}

export function buildTurnInput(state: GameState, playerText: string) {
  const characterAbilities = ownedCharacterAbilities(state);
  const abilityIntentHints = characterAbilities.filter((ability) =>
    ability.sourceId === "Rally" && /\b(inspir\w*|encoraj\w*|discurso)\b/.test(normalizeTimelineText(playerText)),
  ).map((ability) => ({id: ability.id, sourceId: ability.sourceId, name: ability.name}));
  const recent = state.messages.slice(-12).map((message) => ({
    role: message.role,
    text: message.text,
  }));
  const campaignTime = "time" in state ? state.time : undefined;
  const currentDate = campaignTime ? deriveCampaignDateTime(campaignTime) : undefined;
  return [{
    role: "user",
    content: [
      "ESTADO ATUAL DO ORACLE:",
      JSON.stringify({
        campaign: state.campaign,
        character: state.character,
        characterAbilities,
        restCycle: state.character.daggerheart ? restCycleFor(state) : undefined,
        sessionAbilityUses: restAbilityAvailability(state),
        abilityIntentHints,
        inventory: state.inventory,
        crafting: ensureCraftingState(state.crafting),
        activeQuests: state.quests.filter((quest) => quest.status === "active"),
        npcs: state.npcs,
        memories: state.memories.slice(0, 20),
        timeline: (state.timeline ?? []).slice(-20),
        time: campaignTime ? {
          ...campaignTime,
          currentDate,
          currentDateLabel: formatCampaignDateTime(campaignTime),
        } : undefined,
        recentDialogue: recent,
        pendingRoll: state.pendingRoll ?? null,
        rollHistory: (state.rollHistory ?? []).slice(-12),
        milestones: (state.milestones ?? []).slice(-12),
        pendingLevelUp: state.pendingLevelUp ?? null,
      }),
      "",
      `MENSAGEM DO JOGADOR: ${playerText}`,
    ].join("\n"),
  }];
}

export function executeGmTool(
  state: GameState,
  name: string,
  rawArguments: string,
): { state: GameState; result: unknown } {
  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(rawArguments || "{}");
  } catch {
    return { state, result: { ok: false, error: "Invalid JSON arguments." } };
  }

  if (name === "scene_set") {
    const scene = String(args.scene || "").trim().slice(0, 140);
    const reason = String(args.reason || "").trim().slice(0, 240);
    if (scene.length < 2 || !reason) {
      return { state, result: { ok: false, error: "Scene update requires a scene label and reason." } };
    }
    if (normalizeTimelineText(scene) === normalizeTimelineText(state.campaign.scene)) {
      return { state, result: { ok: true, unchanged: true, scene: state.campaign.scene, reason } };
    }
    const next: GameState = {
      ...state,
      campaign: { ...state.campaign, scene },
      sceneVisual: undefined,
    };
    return { state: next, result: { ok: true, scene, reason, imageRefreshRequired: true } };
  }

  if (name === "campaign_milestone_level_up") {
    const reason = String(args.reason || "").trim();
    const title = String(args.title || "").trim();
    return triggerCampaignMilestoneLevelUp(state, reason, title || undefined);
  }

  if (name === "craft_reject_attempt") {
    const reason = String(args.reason || "").trim();
    const crafting = ensureCraftingState(state.crafting);
    if (!reason || !crafting.pendingAttempt) {
      return { state, result: { ok: false, error: "Craft rejection requires a reason and an active attempt." } };
    }
    const attemptId = crafting.pendingAttempt.id;
    return {
      state: { ...state, crafting: rejectCraftAttempt(crafting, attemptId) },
      result: { ok: true, attemptId, reason },
    };
  }

  if (name === "craft_award_xp") {
    const discipline = String(args.discipline || "") as CraftDiscipline;
    const amount = Number(args.amount);
    const reason = String(args.reason || "").trim();
    if (!reason || !["mundane", "enchantment", "alchemy"].includes(discipline) || !Number.isInteger(amount)) {
      return { state, result: { ok: false, error: "Craft XP requires a valid discipline, whole-number amount, and reason." } };
    }
    try {
      const crafting = awardCraftXp(ensureCraftingState(state.crafting), discipline, amount);
      const xp = crafting.progress[discipline].xp;
      return {
        state: { ...state, crafting },
        result: { ok: true, discipline, amount, xp, level: craftLevelForXp(xp), rarityCap: rarityCapForLevel(craftLevelForXp(xp)), reason },
      };
    } catch (error) {
      return { state, result: { ok: false, error: error instanceof Error ? error.message : "Invalid craft XP award." } };
    }
  }

  if (name === "craft_recipe_learn") {
    const crafting = ensureCraftingState(state.crafting);
    const discipline = String(args.discipline || "") as CraftDiscipline;
    const layout = String(args.layout || "") as CraftRecipeLayout;
    const learnedFrom = String(args.learnedFrom || "") as CraftLearnedFrom;
    const nameValue = String(args.name || "").trim();
    const resultArg = args.result && typeof args.result === "object" ? args.result as Record<string, unknown> : null;
    const fromPendingAttempt = args.fromPendingAttempt === true;
    if (!nameValue || !["mundane", "enchantment", "alchemy"].includes(discipline)
      || !["shaped", "shapeless"].includes(layout)
      || !["discovery", "teacher", "book", "scroll", "other"].includes(learnedFrom)
      || !resultArg) {
      return { state, result: { ok: false, error: "Invalid crafting recipe metadata." } };
    }
    if (fromPendingAttempt && learnedFrom !== "discovery") {
      return { state, result: { ok: false, error: "Recipes learned from the pending grid must use learnedFrom=discovery." } };
    }
    if (learnedFrom === "discovery" && !fromPendingAttempt) {
      return { state, result: { ok: false, error: "Discovery recipes require fromPendingAttempt=true so the exact grid is preserved." } };
    }
    const rarity = String(resultArg.rarity || "") as CraftRarity;
    if (!["common", "uncommon", "rare", "very-rare"].includes(rarity)) {
      return { state, result: { ok: false, error: "Craft recipes must use Common through Very Rare rarity. Legendary is critical-only." } };
    }
    const resultName = String(resultArg.name || "").trim();
    const resultDetail = String(resultArg.detail || "").trim();
    const resultIcon = String(resultArg.icon || "✦").trim() || "✦";
    const resultQuantity = Math.max(1, Math.trunc(Number(resultArg.quantity) || 1));
    if (!resultName) return { state, result: { ok: false, error: "Craft recipe result requires a name." } };

    let ingredients: CraftIngredient[] = [];
    if (fromPendingAttempt) {
      const pending = crafting.pendingAttempt;
      if (!pending || pending.discipline !== discipline || pending.stage !== "review") {
        return { state, result: { ok: false, error: "No matching craft attempt is waiting for discovery." } };
      }
      ingredients = structuredClone(pending.ingredients);
    } else if (Array.isArray(args.ingredients)) {
      ingredients = args.ingredients.map((raw) => {
        const ingredient = raw as Record<string, unknown>;
        return {
          slot: Math.max(0, Math.min(8, Math.trunc(Number(ingredient.slot) || 0))),
          ...(typeof ingredient.sourceId === "string" && ingredient.sourceId.trim() ? { sourceId: ingredient.sourceId.trim() } : {}),
          ...(typeof ingredient.itemId === "string" && ingredient.itemId.trim() ? { itemId: ingredient.itemId.trim() } : {}),
          itemName: String(ingredient.itemName || "").trim(),
          quantity: Math.max(1, Math.trunc(Number(ingredient.quantity) || 1)),
        };
      }).filter((ingredient) => ingredient.itemName);
    }
    if (!ingredients.length) {
      return { state, result: { ok: false, error: "Craft recipe requires ingredients or fromPendingAttempt=true." } };
    }
    const existing = crafting.recipes.find((recipe) =>
      recipe.discipline === discipline
      && normalizeTimelineText(recipe.name) === normalizeTimelineText(nameValue)
      && normalizeTimelineText(recipe.result.name) === normalizeTimelineText(resultName)
      && Boolean(findMatchingRecipe([recipe], discipline, ingredients))
    );
    if (existing) {
      const nextCrafting = structuredClone(crafting);
      if (fromPendingAttempt && nextCrafting.pendingAttempt) nextCrafting.pendingAttempt.recipeId = existing.id;
      return { state: { ...state, crafting: nextCrafting }, result: { ok: true, duplicate: true, recipe: existing } };
    }
    const recipe: CraftRecipe = {
      id: globalThis.crypto?.randomUUID?.() || `craft-recipe-${Math.random().toString(36).slice(2, 10)}`,
      name: nameValue,
      discipline,
      layout,
      ingredients,
      ...(args.baseSlot !== undefined ? { baseSlot: Math.max(0, Math.min(8, Math.trunc(Number(args.baseSlot)))) } : {}),
      result: {
        ...(typeof resultArg.sourceId === "string" && resultArg.sourceId.trim() ? { sourceId: resultArg.sourceId.trim() } : {}),
        name: resultName,
        detail: resultDetail,
        icon: resultIcon,
        ...(typeof resultArg.art === "string" && resultArg.art.trim() ? { art: resultArg.art.trim() } : {}),
        rarity: rarity as Exclude<CraftRarity, "legendary">,
        quantity: resultQuantity,
        ...(resultArg.patch && typeof resultArg.patch === "object" ? { patch: structuredClone(resultArg.patch as Record<string, unknown>) } : {}),
      },
      learnedFrom,
      learnedAt: new Date().toISOString(),
    };
    try {
      const learned = learnCraftRecipe(crafting, recipe);
      if (fromPendingAttempt && learned.crafting.pendingAttempt) learned.crafting.pendingAttempt.recipeId = recipe.id;
      return {
        state: { ...state, crafting: learned.crafting },
        result: { ok: true, recipe, learned: learned.learned, xpAwarded: learned.xpAwarded },
      };
    } catch (error) {
      return { state, result: { ok: false, error: error instanceof Error ? error.message : "Invalid crafting recipe." } };
    }
  }

  if (name === "craft_request_roll") {
    const recipeId = String(args.recipeId || "").trim();
    if (!recipeId) return { state, result: { ok: false, error: "Craft roll requires recipeId." } };
    if (state.pendingRoll) {
      return { state, result: { ok: false, waitingForPlayerRoll: true, error: "A player roll is already pending.", pendingRoll: state.pendingRoll } };
    }
    try {
      const system = state.campaign.system.toLocaleLowerCase("pt-BR").includes("daggerheart") ? "daggerheart" as const : "d20" as const;
      const planned = buildCraftRollPlan(ensureCraftingState(state.crafting), state.inventory, recipeId, system);
      const requested = requestPlayerRoll(state, {
        label: planned.request.label,
        reason: planned.request.reason,
        formula: planned.request.formula,
        ...(planned.request.allowedDice ? { allowedDice: [...planned.request.allowedDice] as DiceType[] } : {}),
        target: planned.request.target,
        rollKind: planned.request.rollKind,
      });
      if (!requested.pendingRoll) throw new Error("Não foi possível criar a rolagem de craft.");
      const crafting = attachCraftPendingRoll(planned.crafting, requested.pendingRoll.id);
      const next = { ...requested, crafting };
      return {
        state: next,
        result: {
          ok: true,
          waitingForPlayerRoll: true,
          recipeId,
          level: planned.plan.level,
          rarity: planned.plan.rarity,
          dc: planned.plan.dc,
          successChance: planned.plan.successChance,
          formula: planned.plan.formula,
          pendingRoll: next.pendingRoll,
        },
      };
    } catch (error) {
      return { state, result: { ok: false, error: error instanceof Error ? error.message : "Could not prepare craft roll." } };
    }
  }

  if (name === "request_player_roll") {
    const label = String(args.label || "").trim();
    const reason = String(args.reason || "").trim();
    const formula = typeof args.formula === "string" ? args.formula.trim() : "";
    const allowedDice = Array.isArray(args.allowedDice)
      ? args.allowedDice.map((die) => String(die) as DiceType)
      : [];
    const rollKind = args.rollKind === undefined ? "custom" : String(args.rollKind) as RollKind;
    const targetArg = args.target === undefined ? undefined : Number(args.target);
    const dcArg = args.dc === undefined ? undefined : Number(args.dc);
    let parsedFormula: ParsedDiceFormula | undefined;
    if (!label || !reason || (!formula && !allowedDice.length)) {
      return { state, result: { ok: false, error: "Roll request requires label, reason, and a formula or allowed dice." } };
    }
    if (allowedDice.some((die) => !DICE_TYPES.includes(die))) {
      return { state, result: { ok: false, error: "Roll request contains an unsupported die type." } };
    }
    if (!ROLL_KINDS.includes(rollKind)) {
      return { state, result: { ok: false, error: "Invalid roll kind." } };
    }
    if (formula) {
      try {
        parsedFormula = parseDiceFormula(formula);
      } catch (error) {
        return {
          state,
          result: {
            ok: false,
            error: error instanceof Error ? error.message : "Invalid dice formula.",
          },
        };
      }
    }
    if (parsedFormula && allowedDice.length) {
      const allowed = new Set(allowedDice);
      const invalidTerm = parsedFormula.terms.find((term) => !allowed.has(`d${term.sides}` as DiceType));
      if (invalidTerm) {
        return { state, result: { ok: false, error: "Roll formula uses a die that is not present in allowedDice." } };
      }
    }
    if (rollKind === "duality") {
      if (!parsedFormula) {
        return { state, result: { ok: false, error: "Duality rolls require a formula with exactly two positive d12 dice." } };
      }
      const positiveD12Count = parsedFormula.terms
        .filter((term) => term.sign > 0 && term.sides === 12)
        .reduce((total, term) => total + term.count, 0);
      if (positiveD12Count !== 2) {
        return { state, result: { ok: false, error: "Duality rolls require exactly two positive d12 dice for Hope and Fear." } };
      }
    }
    if (targetArg !== undefined && !Number.isFinite(targetArg)) {
      return { state, result: { ok: false, error: "Invalid roll target." } };
    }
    if (dcArg !== undefined && !Number.isFinite(dcArg)) {
      return { state, result: { ok: false, error: "Invalid roll DC." } };
    }
    if (targetArg !== undefined && dcArg !== undefined && targetArg !== dcArg) {
      return { state, result: { ok: false, error: "Roll target and DC cannot disagree." } };
    }
    if (state.pendingRoll) {
      return {
        state,
        result: {
          ok: false,
          waitingForPlayerRoll: true,
          error: "A player roll is already pending and must be resolved first.",
          pendingRoll: state.pendingRoll,
        },
      };
    }
    const next = requestPlayerRoll(state, {
      label,
      reason,
      ...(parsedFormula ? { formula: parsedFormula.normalized } : {}),
      ...(allowedDice.length ? { allowedDice } : {}),
      ...(targetArg !== undefined || dcArg !== undefined ? { target: targetArg ?? dcArg } : {}),
      rollKind,
    });
    return {
      state: next,
      result: {
        ok: true,
        waitingForPlayerRoll: true,
        pendingRoll: next.pendingRoll,
      },
    };
  }

  if (name === "character_adjust_resource") {
    const resource = args.resource;
    const amount = Number(args.amount);
    if (!["hp", "hope", "stress", "armor"].includes(String(resource)) || !Number.isFinite(amount)) {
      return { state, result: { ok: false, error: "Invalid resource adjustment." } };
    }
    const next = executeCommand(
      state,
      { type: "adjust", resource: resource as "hp" | "hope" | "stress" | "armor", amount },
      "gm-ai",
    );
    return { state: next, result: { ok: true, character: next.character } };
  }

  if (name === "character_long_rest") {
    return changeLongRest(state, String(args.phase || ""), typeof args.restId === "string" ? args.restId : undefined);
  }

  if (name === "character_ability_use") {
    return useRestAbility(state, String(args.abilityId || ""));
  }

  if (name === "character_ability_refresh") {
    return refreshRestAbility(state, String(args.abilityId || ""), String(args.rollId || ""));
  }

  if (name === "character_tracker_set") {
    const trackerId = String(args.trackerId || "").trim();
    const value = Number(args.value);
    const mode = args.mode === "adjust" ? "adjust" : "set";
    const dieIndex = args.dieIndex === undefined ? undefined : Number(args.dieIndex);
    const tracker = state.character.daggerheart?.trackers?.find((entry) => entry.id === trackerId);
    if (!tracker || !Number.isInteger(value) || (dieIndex !== undefined && (!Number.isInteger(dieIndex) || dieIndex < 0))) {
      return { state, result: { ok: false, error: "Unknown tracker or invalid tracker value." } };
    }
    const next = executeCommand(
      state,
      { type: "tracker", trackerId, value, mode, ...(dieIndex !== undefined ? { dieIndex } : {}) },
      "gm-ai",
    );
    if (next === state) return { state, result: { ok: false, error: "O uso desta habilidade não está disponível até terminar um descanso longo." } };
    return {
      state: next,
      result: { ok: true, tracker: next.character.daggerheart?.trackers?.find((entry) => entry.id === trackerId) },
    };
  }

  if (name === "character_transformation_set") {
    const active = Boolean(args.active);
    if (!active) {
      const next = executeCommand(state, { type: "transformation", transformation: undefined }, "gm-ai");
      return { state: next, result: { ok: true, active: false } };
    }
    const nameValue = String(args.name || "Forma temporária").trim().slice(0, 100) || "Forma temporária";
    const traitOverrides: Record<string, number> = {};
    for (const trait of ["agility", "strength", "finesse", "instinct", "presence", "knowledge"] as const) {
      const raw = args[trait];
      if (raw !== undefined && Number.isFinite(Number(raw))) traitOverrides[trait] = Number(raw);
    }
    const evasionBonus = args.evasionBonus === undefined ? undefined : Number(args.evasionBonus);
    const next = executeCommand(state, {
      type: "transformation",
      transformation: {
        kind: args.kind === "beastform" ? "beastform" : "other",
        name: nameValue,
        ...(Number.isFinite(evasionBonus) ? { evasionBonus } : {}),
        ...(Object.keys(traitOverrides).length ? { traitOverrides } : {}),
        ...(String(args.notes || "").trim() ? { notes: String(args.notes).trim().slice(0, 400) } : {}),
      },
    }, "gm-ai");
    return { state: next, result: { ok: true, transformation: next.character.daggerheart?.transformation } };
  }

  if (name === "animal_companion_adjust_stress") {
    const amount = Number(args.amount);
    const companion = state.character.daggerheart?.animalCompanion;
    if (!companion || !Number.isInteger(amount)) {
      return { state, result: { ok: false, error: "No animal companion or invalid stress adjustment." } };
    }
    const next = structuredClone(state) as GameState;
    const current = next.character.daggerheart!.animalCompanion!;
    current.stress = Math.max(0, Math.min(current.maxStress, current.stress + amount));
    return { state: next, result: { ok: true, animalCompanion: current } };
  }

  if (name === "inventory_adjust") {
    const itemId = String(args.itemId || "");
    const amount = Number(args.amount);
    const item = state.inventory.find((entry) => entry.id === itemId);
    if (!item || !Number.isFinite(amount)) {
      return { state, result: { ok: false, error: "Unknown item or invalid amount." } };
    }
    const next = executeCommand(state, { type: "inventory", itemId, amount }, "gm-ai");
    return {
      state: next,
      result: { ok: true, item: next.inventory.find((entry) => entry.id === itemId) },
    };
  }

  if (name === "quest_add") {
    const title = String(args.title || "").trim();
    const stage = String(args.stage || "").trim();
    const deadlineMinutes = args.deadlineMinutes === undefined ? undefined : Number(args.deadlineMinutes);
    if (!title || !stage) {
      return { state, result: { ok: false, error: "Quest title and stage are required." } };
    }
    if (deadlineMinutes !== undefined && (!Number.isInteger(deadlineMinutes) || deadlineMinutes <= 0)) {
      return { state, result: { ok: false, error: "Quest deadline must be a positive whole number of minutes." } };
    }
    const questId = globalThis.crypto?.randomUUID?.() || `quest-${Math.random().toString(36).slice(2, 10)}`;
    const acceptedAtCampaignMinute = state.time.campaignMinute;
    const deadlineCampaignMinute = deadlineMinutes === undefined ? undefined : acceptedAtCampaignMinute + deadlineMinutes;
    const quest = {
      id: questId,
      title,
      status: "active" as const,
      stage,
      acceptedAtCampaignMinute,
      ...(deadlineCampaignMinute !== undefined ? { deadlineCampaignMinute } : {}),
    };
    let time = state.time;
    let calendarEvent: CampaignCalendarEvent | undefined;
    if (deadlineCampaignMinute !== undefined) {
      const existingIds = new Set(time.events.map((entry) => entry.id));
      time = addCalendarEvent(time, {
        title,
        startCampaignMinute: acceptedAtCampaignMinute,
        endCampaignMinute: deadlineCampaignMinute,
        kind: "quest",
        sourceId: questId,
        description: typeof args.deadlineDescription === "string" && args.deadlineDescription.trim()
          ? args.deadlineDescription.trim()
          : `Prazo da missão: ${stage}`,
      });
      calendarEvent = time.events.find((entry) => !existingIds.has(entry.id));
    }
    return {
      state: { ...state, time, quests: [...state.quests, quest] },
      result: { ok: true, quest, calendarEvent },
    };
  }

  if (name === "quest_set_status") {
    const questId = String(args.questId || "");
    const status = String(args.status || "");
    if (!state.quests.some((quest) => quest.id === questId) || !["active", "completed"].includes(status)) {
      return { state, result: { ok: false, error: "Unknown quest or invalid status." } };
    }
    let next = executeCommand(
      state,
      { type: "quest", questId, status: status as "active" | "completed" },
      "gm-ai",
    );
    const linkedEvent = next.time.events.find((entry) => entry.sourceId === questId);
    if (linkedEvent) {
      next = {
        ...next,
        time: updateCalendarEvent(next.time, linkedEvent.id, { completed: status === "completed" }),
      };
    }
    return { state: next, result: { ok: true, quest: next.quests.find((quest) => quest.id === questId) } };
  }

  if (name === "condition_set") {
    const condition = String(args.name || "").trim();
    const active = Boolean(args.active);
    if (!condition) return { state, result: { ok: false, error: "Condition name is required." } };
    const next = executeCommand(state, { type: "condition", name: condition, active }, "gm-ai");
    return { state: next, result: { ok: true, conditions: next.character.conditions } };
  }

  if (name === "advance_time") {
    const minutes = Number(args.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0) {
      return { state, result: { ok: false, error: "Time advance must be a positive whole number of minutes." } };
    }
    const before = state.time.campaignMinute;
    const time = advanceCampaignTime(state.time, minutes);
    const reachedEvents = time.events.filter((event) => {
      if (event.completed) return false;
      const target = event.endCampaignMinute ?? event.startCampaignMinute;
      return target > before && target <= time.campaignMinute;
    });
    return {
      state: { ...state, time },
      result: {
        ok: true,
        campaignMinute: time.campaignMinute,
        elapsedMinutes: minutes,
        reachedEvents,
      },
    };
  }

  if (name === "set_weather") {
    const condition = String(args.condition || "") as WeatherCondition;
    const label = String(args.label || "").trim();
    if (!WEATHER_CONDITIONS.includes(condition) || !label) {
      return { state, result: { ok: false, error: "Invalid weather condition or label." } };
    }
    if (args.intensity !== undefined && !WEATHER_INTENSITIES.includes(String(args.intensity) as typeof WEATHER_INTENSITIES[number])) {
      return { state, result: { ok: false, error: "Invalid weather intensity." } };
    }
    const temperatureC = args.temperatureC === undefined ? undefined : Number(args.temperatureC);
    if (temperatureC !== undefined && !Number.isFinite(temperatureC)) {
      return { state, result: { ok: false, error: "Invalid weather temperature." } };
    }
    const time = setCampaignWeather(state.time, {
      condition,
      label,
      ...(typeof args.description === "string" ? { description: args.description.trim() } : {}),
      ...(temperatureC !== undefined ? { temperatureC } : {}),
      ...(args.intensity !== undefined ? { intensity: args.intensity as "light" | "moderate" | "heavy" } : {}),
    });
    return { state: { ...state, time }, result: { ok: true, weather: time.weather } };
  }

  if (name === "calendar_event_add") {
    const title = String(args.title || "").trim();
    const explicitStart = args.startCampaignMinute === undefined ? undefined : Number(args.startCampaignMinute);
    const startsInMinutes = args.startsInMinutes === undefined ? 0 : Number(args.startsInMinutes);
    const durationMinutes = args.durationMinutes === undefined ? undefined : Number(args.durationMinutes);
    const startCampaignMinute = explicitStart === undefined ? state.time.campaignMinute + startsInMinutes : explicitStart;
    const explicitEnd = args.endCampaignMinute === undefined ? undefined : Number(args.endCampaignMinute);
    const endCampaignMinute = explicitEnd === undefined && durationMinutes !== undefined
      ? startCampaignMinute + durationMinutes
      : explicitEnd;
    const kind = args.kind === undefined ? undefined : String(args.kind) as CalendarEventKind;
    if (!title || !Number.isInteger(startCampaignMinute) || startCampaignMinute < 0 || !Number.isInteger(startsInMinutes) || startsInMinutes < 0) {
      return { state, result: { ok: false, error: "Calendar event requires a title and valid start campaign minute." } };
    }
    if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes <= 0)) {
      return { state, result: { ok: false, error: "Invalid calendar event duration." } };
    }
    if (endCampaignMinute !== undefined && (!Number.isInteger(endCampaignMinute) || endCampaignMinute < 0)) {
      return { state, result: { ok: false, error: "Invalid calendar event end campaign minute." } };
    }
    if (kind !== undefined && !CALENDAR_EVENT_KINDS.includes(kind)) {
      return { state, result: { ok: false, error: "Invalid calendar event kind." } };
    }
    if (args.completed !== undefined && typeof args.completed !== "boolean") {
      return { state, result: { ok: false, error: "Invalid calendar event completion flag." } };
    }
    const event: Omit<CampaignCalendarEvent, "id"> = {
      title,
      startCampaignMinute,
      ...(endCampaignMinute !== undefined ? { endCampaignMinute } : {}),
      ...(kind !== undefined ? { kind } : {}),
      ...(typeof args.sourceId === "string" && args.sourceId.trim() ? { sourceId: args.sourceId.trim() } : {}),
      ...(typeof args.description === "string" ? { description: args.description.trim() } : {}),
      ...(typeof args.completed === "boolean" ? { completed: args.completed } : {}),
    };
    try {
      const existingIds = new Set(state.time.events.map((entry) => entry.id));
      const time = addCalendarEvent(state.time, event);
      const added = time.events.find((entry) => !existingIds.has(entry.id));
      return { state: { ...state, time }, result: { ok: true, event: added } };
    } catch (error) {
      return { state, result: { ok: false, error: error instanceof Error ? error.message : "Invalid calendar event." } };
    }
  }

  if (name === "calendar_event_update") {
    const eventId = String(args.eventId || "").trim();
    if (!eventId || !state.time.events.some((entry) => entry.id === eventId)) {
      return { state, result: { ok: false, error: "Unknown calendar event." } };
    }
    const changes: Partial<Omit<CampaignCalendarEvent, "id">> = {};
    if (args.title !== undefined) {
      const title = String(args.title).trim();
      if (!title) return { state, result: { ok: false, error: "Calendar event title cannot be empty." } };
      changes.title = title;
    }
    if (args.startCampaignMinute !== undefined) {
      const startCampaignMinute = Number(args.startCampaignMinute);
      if (!Number.isInteger(startCampaignMinute) || startCampaignMinute < 0) {
        return { state, result: { ok: false, error: "Invalid calendar event start campaign minute." } };
      }
      changes.startCampaignMinute = startCampaignMinute;
    }
    if (args.endCampaignMinute !== undefined) {
      const endCampaignMinute = Number(args.endCampaignMinute);
      if (!Number.isInteger(endCampaignMinute) || endCampaignMinute < 0) {
        return { state, result: { ok: false, error: "Invalid calendar event end campaign minute." } };
      }
      changes.endCampaignMinute = endCampaignMinute;
    }
    if (args.kind !== undefined) {
      const kind = String(args.kind) as CalendarEventKind;
      if (!CALENDAR_EVENT_KINDS.includes(kind)) {
        return { state, result: { ok: false, error: "Invalid calendar event kind." } };
      }
      changes.kind = kind;
    }
    if (args.sourceId !== undefined) {
      changes.sourceId = String(args.sourceId).trim() || undefined;
    }
    if (args.description !== undefined) {
      changes.description = String(args.description).trim();
    }
    if (args.completed !== undefined) {
      if (typeof args.completed !== "boolean") {
        return { state, result: { ok: false, error: "Invalid calendar event completion flag." } };
      }
      changes.completed = args.completed;
    }
    if (!Object.keys(changes).length) {
      return { state, result: { ok: false, error: "Calendar event update requires at least one change." } };
    }
    try {
      const time = updateCalendarEvent(state.time, eventId, changes);
      return {
        state: { ...state, time },
        result: { ok: true, event: time.events.find((entry) => entry.id === eventId) },
      };
    } catch (error) {
      return { state, result: { ok: false, error: error instanceof Error ? error.message : "Invalid calendar event update." } };
    }
  }

  if (name === "calendar_event_remove") {
    const eventId = String(args.eventId || "").trim();
    if (!eventId || !state.time.events.some((entry) => entry.id === eventId)) {
      return { state, result: { ok: false, error: "Unknown calendar event." } };
    }
    const time = removeCalendarEvent(state.time, eventId);
    return { state: { ...state, time }, result: { ok: true, eventId } };
  }

  if (name === "timeline_entry_add") {
    const title = String(args.title || "").trim();
    const description = String(args.description || "").trim();
    const kind = String(args.kind || "other") as TimelineKind;
    const importance = args.importance === "major" ? "major" as const : "normal" as const;
    const visibility = args.visibility === "hidden" ? "hidden" as const : "public" as const;
    const hasWorldDate = args.year !== undefined || args.monthIndex !== undefined || args.day !== undefined;
    const currentDate = deriveCampaignDateTime(state.time);
    let worldDate: TimelineEntry["worldDate"] | undefined;
    if (hasWorldDate) {
      const monthIndex = Number.isInteger(Number(args.monthIndex))
        ? Math.min(state.time.calendar.months.length - 1, Math.max(0, Number(args.monthIndex)))
        : currentDate.monthIndex;
      const month = state.time.calendar.months[monthIndex];
      worldDate = {
        year: Number.isInteger(Number(args.year)) ? Number(args.year) : currentDate.year,
        monthIndex,
        day: Number.isInteger(Number(args.day)) ? Math.min(month.days, Math.max(1, Number(args.day))) : currentDate.day,
        hour: Number.isInteger(Number(args.hour)) ? Math.min(23, Math.max(0, Number(args.hour))) : 12,
        minute: Number.isInteger(Number(args.minute)) ? Math.min(59, Math.max(0, Number(args.minute))) : 0,
      };
      const currentOrdinal = worldDateOrdinalMinute(state.time.calendar, {
        year: currentDate.year,
        monthIndex: currentDate.monthIndex,
        day: currentDate.day,
        hour: currentDate.hour,
        minute: currentDate.minute,
      });
      if (worldDateOrdinalMinute(state.time.calendar, worldDate) > currentOrdinal) {
        return { state, result: { ok: false, error: "Timeline entries cannot use a future world date. Future events belong to the calendar." } };
      }
    }
    const minute = args.campaignMinute === undefined
      ? state.time.campaignMinute
      : Number(args.campaignMinute);
    if (!title || !description || !TIMELINE_KINDS.includes(kind)) {
      return { state, result: { ok: false, error: "Invalid timeline entry." } };
    }
    if (title.length > 100 || description.length > 420) {
      return { state, result: { ok: false, error: "Timeline entries must be atomic: use a title up to 100 characters and a description up to 420 characters. Split multiple facts into separate entries." } };
    }
    if (!Number.isInteger(minute) || minute < 0 || minute > state.time.campaignMinute) {
      return { state, result: { ok: false, error: "Timeline entries must use the current or a past campaign minute. Future events belong to the calendar." } };
    }
    const tags = Array.from(new Set(
      (Array.isArray(args.tags) ? args.tags : [])
        .map((value) => String(value).trim())
        .filter(Boolean)
        .slice(0, 8),
    ));
    const image = typeof args.image === "string" && args.image.trim() ? args.image.trim() : undefined;
    const signature = normalizeTimelineText(title + " " + description);
    const duplicate = (state.timeline ?? []).find((entry) => {
      const sameText = normalizeTimelineText(entry.title + " " + entry.description) === signature;
      if (!sameText) return false;
      if (worldDate && entry.worldDate) {
        return entry.worldDate.year === worldDate.year
          && entry.worldDate.monthIndex === worldDate.monthIndex
          && entry.worldDate.day === worldDate.day
          && entry.worldDate.hour === worldDate.hour
          && entry.worldDate.minute === worldDate.minute;
      }
      return !worldDate && !entry.worldDate && entry.campaignMinute === minute;
    });
    if (duplicate) {
      return {
        state,
        result: { ok: true, duplicate: true, entry: duplicate, dateLabel: formatTimelineEntryDate(state.time, duplicate, true) },
      };
    }
    const entry = {
      id: globalThis.crypto?.randomUUID?.() || `timeline-${Math.random().toString(36).slice(2, 10)}`,
      title,
      description,
      campaignMinute: minute,
      ...(worldDate ? { worldDate } : {}),
      createdAt: new Date().toISOString(),
      kind,
      tags,
      visibility,
      importance,
      ...(image ? { image } : {}),
    };
    const timeline = [...(state.timeline ?? []), entry]
      .sort((a, b) => timelineEntrySortValue(state.time, a) - timelineEntrySortValue(state.time, b) || Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return {
      state: { ...state, timeline },
      result: { ok: true, entry, dateLabel: formatTimelineEntryDate(state.time, entry, true) },
    };
  }

  if (name === "timeline_entry_set_visibility") {
    const entryId = String(args.entryId || "").trim();
    const visibility = String(args.visibility || "");
    if (!entryId || !["public", "hidden"].includes(visibility)) {
      return { state, result: { ok: false, error: "Invalid timeline visibility update." } };
    }
    const current = (state.timeline ?? []).find((entry) => entry.id === entryId);
    if (!current) return { state, result: { ok: false, error: "Unknown timeline entry." } };
    if (current.visibility === visibility) {
      return { state, result: { ok: true, unchanged: true, entry: current } };
    }
    const timeline = (state.timeline ?? []).map((entry) =>
      entry.id === entryId ? { ...entry, visibility: visibility as "public" | "hidden" } : entry,
    );
    return { state: { ...state, timeline }, result: { ok: true, entry: timeline.find((entry) => entry.id === entryId) } };
  }

  if (name === "memory_record") {
    const kind = String(args.kind || "");
    const text = String(args.text || "").trim();
    if (!["fact", "event", "secret", "visual"].includes(kind) || !text) {
      return { state, result: { ok: false, error: "Invalid memory." } };
    }
    const normalizedMemory = normalizeTimelineText(text);
    const existingMemory = state.memories.find((memory) =>
      memory.kind === kind && normalizeTimelineText(memory.text) === normalizedMemory
    );
    if (existingMemory) {
      return { state, result: { ok: true, duplicate: true, memory: existingMemory } };
    }
    const next = executeCommand(
      state,
      { type: "memory", kind: kind as "fact" | "event" | "secret" | "visual", text },
      "gm-ai",
    );
    return { state: next, result: { ok: true, memory: next.memories[0] } };
  }

  if (name === "memory_search") {
    const query = String(args.query || "").trim().toLocaleLowerCase("pt-BR");
    const limit = Math.max(1, Math.min(20, Number(args.limit) || 8));
    const words = query.split(/\s+/).filter((word) => word.length > 2);
    const matches = state.memories
      .map((memory) => {
        const haystack = memory.text.toLocaleLowerCase("pt-BR");
        const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0);
        return { memory, score };
      })
      .filter((entry) => entry.score > 0 || !words.length)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.memory);
    return { state, result: { ok: true, memories: matches } };
  }

  return { state, result: { ok: false, error: `Unknown tool: ${name}` } };
}

export function extractNarration(response: { output?: unknown[]; output_text?: unknown }) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }
  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      } else if (typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export function extractRefusal(response: { output?: unknown[] }) {
  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === "refusal" && typeof content.refusal === "string") {
        parts.push(content.refusal);
      }
    }
  }
  return parts.join("\n").trim();
}
