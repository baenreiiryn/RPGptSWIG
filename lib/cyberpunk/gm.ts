import type { GameState } from "../game";
import type { CyberPendingRoll, Stat } from "./types";
import {
  applyCyberDamage,
  cyberDate,
  effectiveCyberStat,
  woundPenalty,
} from "./rules";
import {
  withCyberState,
  installCyberware,
  purchaseItem,
  requestCyberInstall,
  skillOptions,
  reloadCyberWeapon,
} from "./state";
import { findCyberEntry, entriesForEra } from "./catalog";
import { requestHack, QUICKHACKS, nextCyberTurn } from "./hacking";
const str = { type: "string" },
  num = { type: "number" },
  bool = { type: "boolean" };
const specs = [
  [
    "search_compendium",
    "Consulte regras e mecânicas da época.",
    { query: str },
    ["query"],
  ],
  [
    "request_roll",
    "Solicite dados ao jogador pela interface e aguarde o resultado.",
    {
      label: str,
      kind: {
        type: "string",
        enum: ["skill", "interface", "damage", "death", "custom"],
      },
      stat: str,
      skill: str,
      modifier: num,
      target: num,
      count: num,
      sides: { type: "number", enum: [6, 10] },
    },
    ["label", "kind"],
  ],
  [
    "advance_time",
    "Avance o relógio da ficção em minutos.",
    { minutes: num },
    ["minutes"],
  ],
  [
    "next_turn",
    "Próximo turno de combate: 3 segundos e novas ações físicas/NET.",
    {},
    [],
  ],
  [
    "remember",
    "Registre evento no local indicado ou atual, com data automática e vínculos.",
    {
      title: str,
      text: str,
      placeId: str,
      npcIds: { type: "array", items: str },
      questIds: { type: "array", items: str },
    },
    ["title", "text"],
  ],
  [
    "scene_set",
    "Mude a cena para um local já mapeado.",
    { placeId: str },
    ["placeId"],
  ],
  [
    "npc_upsert",
    "Registre ou atualize um contato conhecido pelo jogador.",
    {
      id: str,
      name: str,
      role: str,
      relation: { type: "string", enum: ["friendly", "neutral", "hostile"] },
      placeId: str,
    },
    ["name", "role"],
  ],
  [
    "quest_upsert",
    "Registre ou atualize um trabalho e seu objetivo.",
    {
      id: str,
      title: str,
      stage: str,
      status: { type: "string", enum: ["active", "completed", "failed"] },
    },
    ["title", "stage"],
  ],
  [
    "receive_damage",
    "Dano bruto ao jogador: motor aplica SP, ablação, cabeça e bônus crítico.",
    {
      raw: num,
      location: { type: "string", enum: ["body", "head"] },
      halfArmor: bool,
      ignoreArmor: bool,
      critical: bool,
      power: bool,
      ablation: num,
    },
    ["raw"],
  ],
  [
    "npc_damage",
    "Dano bruto a um NPC com ficha de combate importada.",
    {
      npcId: str,
      raw: num,
      location: { type: "string", enum: ["body", "head"] },
      halfArmor: bool,
      ignoreArmor: bool,
      critical: bool,
      power: bool,
    },
    ["npcId", "raw"],
  ],
  [
    "resource_change",
    "Ajuste recurso com delta justificado. HP positivo cura. Não duplique dano já aplicado.",
    {
      resource: {
        type: "string",
        enum: ["hp", "humanity", "luck", "eddies", "ip", "reputation"],
      },
      amount: num,
      reason: str,
    },
    ["resource", "amount", "reason"],
  ],
  [
    "inventory_grant",
    "Conceda saque identificado no compêndio, sem cobrar o preço.",
    { entryId: str, quantity: num },
    ["entryId"],
  ],
  [
    "inventory_consume",
    "Consuma unidades de item possuído, exceto implantes instalados.",
    { itemId: str, quantity: num },
    ["itemId", "quantity"],
  ],
  [
    "cyberware_install",
    "Instale cyberware possuído com base, slots e rolagem de Humanidade. Exige cirurgia na ficção.",
    { itemId: str, parentId: str },
    ["itemId"],
  ],
  [
    "weapon_reload",
    "Recarregue arma com munição compatível, consumindo a ação física.",
    { weaponId: str, ammoId: str },
    ["weaponId", "ammoId"],
  ],
  [
    "weapon_fire",
    "Prepare ataque com arma possuída: consome munição e cadência, calcula perícia. Informe DV de alcance/defesa.",
    { weaponId: str, target: num, label: str },
    ["weaponId", "target", "label"],
  ],
  [
    "net_action",
    "Solicite Jack In, Breach ou quickhack no alvo configurado. Apenas 2077.",
    {
      targetId: str,
      action: { type: "string", enum: ["jack", "breach", "quickhack"] },
      quickhackId: str,
    },
    ["targetId", "action"],
  ],
] as const;
export const cyberTools = specs.map(
  ([name, description, properties, required]) => ({
    type: "function",
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required: [...required],
      additionalProperties: false,
    },
  }),
);
const string = (v: unknown) => (typeof v === "string" ? v : "");
function finite(v: unknown) {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw Error("Número inválido.");
  return v;
}
export function executeCyberTool(
  g: GameState,
  name: string,
  a: Record<string, unknown>,
): { state: GameState; result: unknown } {
  const s = g.cyberpunk!;
  let cp = s,
    next = g;
  if (name === "search_compendium")
    return {
      state: g,
      result: entriesForEra(s.era)
        .filter((e) =>
          (e.name + " " + e.description)
            .toLowerCase()
            .includes(string(a.query).toLowerCase()),
        )
        .slice(0, 12),
    };
  if (name === "request_roll") {
    if (s.pending) throw Error("Uma rolagem já está pendente.");
    const kind = string(a.kind) as CyberPendingRoll["kind"];
    if (!["skill", "interface", "damage", "death", "custom"].includes(kind))
      throw Error("Tipo inválido.");
    let modifier = finite(Number(a.modifier ?? 0));
    if (kind === "skill") {
      const e = skillOptions().find((e) => e.name === a.skill),
        stat = (e?.data.stat ?? a.stat) as Stat;
      if (!Object.hasOwn(s.stats, stat) || (a.skill && !e))
        throw Error("Informe atributo/perícia válidos.");
      modifier +=
        effectiveCyberStat(s, stat) +
        (e ? (s.skills[e.name] ?? 0) : 0) +
        woundPenalty(s, g.time.campaignMinute);
    }
    if (kind === "interface") {
      if (s.role !== "Netrunner") throw Error("Interface exige Netrunner.");
      modifier += s.roleRank + woundPenalty(s, g.time.campaignMinute);
    }
    if (kind === "death" && s.hp > 0) throw Error("Teste de Morte exige 0 PV.");
    cp = {
      ...s,
      pending: {
        id: crypto.randomUUID(),
        label: string(a.label),
        kind,
        modifier,
        ...(a.target !== undefined ? { target: finite(a.target) } : {}),
        count: a.count === undefined ? 1 : finite(a.count),
        sides: a.sides === 10 ? 10 : 6,
      },
    };
  } else if (name === "next_turn") {
    cp = nextCyberTurn(s);
    next = {
      ...g,
      time: { ...g.time, campaignMinute: g.time.campaignMinute + 0.05 },
    };
  } else if (name === "advance_time") {
    const minutes = finite(a.minutes);
    if (minutes < 0 || minutes > 525600)
      throw Error("Passagem de tempo fora do limite.");
    next = {
      ...g,
      time: { ...g.time, campaignMinute: g.time.campaignMinute + minutes },
    };
  } else if (name === "scene_set") {
    const place = s.places.find((p) => p.id === a.placeId);
    if (!place) throw Error("Local desconhecido.");
    cp = { ...s, locationId: place.id };
    next = { ...g, campaign: { ...g.campaign, scene: place.name } };
  } else if (name === "remember") {
    const placeId = string(a.placeId) || s.locationId;
    if (!s.places.some((p) => p.id === placeId))
      throw Error("Local desconhecido.");
    const e = {
      id: crypto.randomUUID(),
      title: string(a.title),
      text: string(a.text),
      placeId,
      campaignMinute: g.time.campaignMinute,
      npcIds: Array.isArray(a.npcIds) ? a.npcIds.map(String) : [],
      questIds: Array.isArray(a.questIds) ? a.questIds.map(String) : [],
    };
    cp = { ...s, cityEvents: [...s.cityEvents, e] };
    next = {
      ...g,
      memories: [
        {
          id: e.id,
          kind: "event",
          text: e.title + ": " + e.text,
          createdAt: new Date().toISOString(),
          campaignMinute: e.campaignMinute,
        },
        ...g.memories,
      ],
    };
  } else if (name === "npc_upsert") {
    const id = string(a.id) || crypto.randomUUID(),
      place =
        s.places.find((p) => p.id === a.placeId) ||
        s.places.find((p) => p.id === s.locationId)!;
    const npc = {
      ...g.npcs.find((n) => n.id === id),
      id,
      name: string(a.name),
      role: string(a.role),
      relation: (["friendly", "hostile"].includes(string(a.relation))
        ? a.relation
        : "neutral") as "friendly" | "neutral" | "hostile",
      location: place.name,
    };
    next = { ...g, npcs: [...g.npcs.filter((n) => n.id !== id), npc] };
  } else if (name === "quest_upsert") {
    const id = string(a.id) || crypto.randomUUID(),
      quest = {
        ...g.quests.find((q) => q.id === id),
        id,
        title: string(a.title),
        stage: string(a.stage),
        status: (["completed", "failed"].includes(string(a.status))
          ? a.status
          : "active") as "active" | "completed" | "failed",
      };
    next = { ...g, quests: [...g.quests.filter((q) => q.id !== id), quest] };
  } else if (name === "receive_damage") {
    cp = applyCyberDamage(s, finite(a.raw), {
      location: a.location === "head" ? "head" : "body",
      halfArmor: a.halfArmor === true,
      ignoreArmor: a.ignoreArmor === true,
      critical: a.critical === true,
      power: a.power === true,
      ablation:
        a.ablation === undefined
          ? 1
          : Math.max(0, Math.trunc(finite(a.ablation))),
    });
  } else if (name === "npc_damage") {
    const npc = g.npcs.find((n) => n.id === a.npcId);
    if (!npc?.cyberpunk)
      throw Error("NPC sem ficha de combate. Importe uma ficha do compêndio.");
    const c = npc.cyberpunk,
      r = applyCyberDamage(
        {
          ...s,
          hp: c.hp,
          maxHp: c.maxHp,
          armor: c.armor,
          injuries: c.injuries,
          equippedArmor: undefined,
          inventory: [],
        },
        finite(a.raw),
        {
          location: a.location === "head" ? "head" : "body",
          halfArmor: a.halfArmor === true,
          ignoreArmor: a.ignoreArmor === true,
          critical: a.critical === true,
          power: a.power === true,
        },
      );
    next = {
      ...g,
      npcs: g.npcs.map((n) =>
        n.id === npc.id
          ? {
              ...n,
              cyberpunk: {
                ...c,
                hp: r.hp,
                armor: r.armor,
                injuries: r.injuries,
              },
            }
          : n,
      ),
    };
  } else if (name === "resource_change") {
    const resource = string(a.resource),
      amount = finite(a.amount);
    if (
      !["hp", "humanity", "luck", "eddies", "ip", "reputation"].includes(
        resource,
      )
    )
      throw Error("Recurso inválido.");
    const key = resource as
        | "hp"
        | "humanity"
        | "luck"
        | "eddies"
        | "ip"
        | "reputation",
      max =
        key === "hp"
          ? s.maxHp
          : key === "humanity"
            ? s.maxHumanity
            : key === "luck"
              ? s.stats.luck
              : Number.MAX_SAFE_INTEGER;
    cp = {
      ...s,
      [key]: Math.min(
        max,
        key === "humanity" ? s[key] + amount : Math.max(0, s[key] + amount),
      ),
    };
  } else if (name === "inventory_grant") {
    const e = findCyberEntry(string(a.entryId));
    if (!e) throw Error("Item desconhecido.");
    const r = purchaseItem(
      { ...s, eddies: Number.MAX_SAFE_INTEGER },
      e,
      a.quantity === undefined ? 1 : finite(a.quantity),
    );
    cp = { ...r, eddies: s.eddies };
  } else if (name === "inventory_consume") {
    const i = s.inventory.find((i) => i.id === a.itemId),
      quantity = finite(a.quantity);
    if (
      !i ||
      i.installed ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > i.qty
    )
      throw Error("Quantidade indisponível ou item instalado.");
    cp = {
      ...s,
      inventory: s.inventory
        .map((n) => (n.id === i.id ? { ...n, qty: n.qty - quantity } : n))
        .filter((n) => n.qty > 0),
    };
  } else if (name === "cyberware_install") {
    const item = s.inventory.find((i) => i.id === a.itemId),
      e = item && findCyberEntry(item.sourceId);
    cp =
      Number(e?.data.humanityLoss?.static ?? 0) > 0
        ? {
            ...s,
            pending: requestCyberInstall(
              s,
              string(a.itemId),
              string(a.parentId) || undefined,
            ),
          }
        : installCyberware(
            s,
            string(a.itemId),
            string(a.parentId) || undefined,
          );
  } else if (name === "weapon_reload") {
    cp = reloadCyberWeapon(s, string(a.weaponId), string(a.ammoId));
  } else if (name === "weapon_fire") {
    const item = s.inventory.find((i) => i.id === a.weaponId),
      e = item && findCyberEntry(item.sourceId);
    if (!item || e?.type !== "weapon") throw Error("Arma desconhecida.");
    const skill = skillOptions().find((k) => k.name === e.data.weaponSkill);
    if (!skill?.data.stat) throw Error("Perícia da arma desconhecida.");
    const count = s.net.physicalAttacks ?? 0,
      limit = Math.min(s.net.physicalLimit ?? 2, Number(e.data.rof ?? 1));
    if (s.net.actionsUsed > 0 || count >= limit)
      throw Error("Ação física ou cadência esgotada.");
    const ranged = Boolean(e.data.isRanged);
    if (ranged && (item.ammo ?? 0) < 1) throw Error("Arma sem munição.");
    cp = {
      ...s,
      pending: {
        id: crypto.randomUUID(),
        label: string(a.label),
        kind: "skill",
        target: finite(a.target),
        modifier:
          effectiveCyberStat(s, skill.data.stat) +
          (s.skills[skill.name] ?? 0) +
          woundPenalty(s, g.time.campaignMinute) +
          Number(e.data.attackmod ?? 0),
      },
      net: {
        ...s.net,
        meatAction: true,
        physicalAttacks: count + 1,
        physicalLimit: limit,
      },
      inventory: s.inventory.map((i) =>
        i.id === item.id && ranged ? { ...i, ammo: (i.ammo ?? 0) - 1 } : i,
      ),
    };
  } else if (name === "net_action") {
    cp = {
      ...s,
      pending: requestHack(
        s,
        string(a.targetId),
        a.action as "jack" | "breach" | "quickhack",
        g.time.campaignMinute,
        string(a.quickhackId),
      ),
    };
  } else throw Error("Ferramenta desconhecida.");
  next = withCyberState(next, cp);
  return {
    state: next,
    result: {
      ok: true,
      character: { hp: cp.hp, humanity: cp.humanity, armor: cp.armor },
      pending: cp.pending,
      locationId: cp.locationId,
      campaignMinute: next.time.campaignMinute,
      ...(name === "npc_damage"
        ? { npc: next.npcs.find((n) => n.id === a.npcId) }
        : {}),
    },
  };
}
export function cyberInstructions(g: GameState) {
  const s = g.cyberpunk!;
  return [
    `Você é o Mestre de Cyberpunk ${s.era === 2077 ? "Edgerunners em 2077, RED + Edgerunners Mission Kit" : "RED em 2045"}. Narre em português com agência do jogador e consequências coerentes.`,
    "Use apenas ferramentas Cyberpunk fornecidas. Daggerheart, Esperança, Medo, slots de PV e descanso longo adaptado não se aplicam. PV são RESTANTES; dano reduz, cura aumenta.",
    "Testes: atributo + perícia + d10; é preciso SUPERAR a DV. Empate favorece o defensor. Natural10 soma um d10;1 subtrai um d10, sem cadeia. O motor calcula e registra os dados do jogador. Nunca invente resultados. Use request_roll. Interface não soma atributo. Penalidades de armadura e ferimento são automáticas. Não duplique modificadores.",
    "Dano usa d6. Dois seis sinalizam ferimento crítico e +5 PV diretos após SP; Power CEMK aumenta esse bônus para10. receive_damage/npc_damage aplicam SP, cabeça e ablação. Melee ou tech carregada usam metade do SP arredondada para cima. Consulte as regras de cada arma. weapon_fire consome munição e cadência e pede o ataque; use weapon_reload para recarregar e next_turn somente ao passar o turno.",
    "PV0 exige Teste de Morte: d10+penalidade MENOR que BODY;10 natural sempre falha. Não use movimentos de morte de Daggerheart.",
    "Papéis, habilidades, terapia, procedimentos, tabela específica de ferimentos e progressão por IP exigem adjudicação pelas regras. Consulte search_compendium. A descrição de um item não significa que todos seus efeitos foram automatizados. Instalação na ficção exige cirurgia: cyberware_install solicita a rolagem de Humanidade, sem duplicar a perda por resource_change.",
    "Registre mudanças reais com ferramentas. Eventos importantes exigem remember com placeId, título, texto e IDs de NPCs/missões. Use o relógio da ficção e advance_time. scene_set aceita somente locais mapeados; peça ao jogador para marcar novos endereços, sem apresentar uma estimativa como endereço exato.",
    s.era === 2077
      ? "2077: net_action exige Netrunner, Neuroport Cyberdeck Port e cyberdeck, visão e até50m. Jack In falho conecta e alerta. Self-ICE exige uma ação por Passwall em DV4+2por camada. Uma tentativa de quickhack por alvo/turno. Expulsão impede reconexão60min. Não use RAM e regras do videogame no lugar do CEMK. Efeitos complexos, alvos de cyberware, dados de Lentidão/Queima de Sinapse e ação de Marionete são resolvidos pelo Mestre após a rolagem confirmada."
      : "2045: acesso local, Interface, programas, Black ICE e arquiteturas NET. A exploração de andares não é simulada automaticamente; consulte o compêndio, peça testes e registre consequências.",
    "Mantenha segredos fora da resposta e da memória pública. Preserve IDs ao atualizar NPCs e missões. Não repita recompensa, dano, consumo ou evento já aplicado na retomada.",
    "Ao obter o resultado solicitado, resolva e continue sem exigir outra mensagem. Se solicitar dados, registre request_roll antes do texto. Não solicite nova rolagem para substituir um resultado confirmado.",
    `Data: ${cyberDate(s.era, g.time.campaignMinute)}. Quickhacks: ${JSON.stringify(s.era === 2077 ? QUICKHACKS : [])}`,
  ].join("\n");
}
export type CyberRespond = (p: {
  model: string;
  instructions: string;
  input: unknown[];
  tools?: unknown[];
}) => Promise<{ output?: unknown[]; output_text?: unknown }>;
function signature(name: string, args: string) {
  try {
    const o = JSON.parse(args);
    delete o.reason;
    return name + JSON.stringify(o, Object.keys(o).sort());
  } catch {
    return name + args;
  }
}
export async function runCyberTurn(
  initial: GameState,
  text: string,
  respond: CyberRespond,
  model: string,
  onProgress: (g: GameState) => void,
  isCurrent: () => boolean = () => true,
) {
  let g = initial;
  const cp = g.cyberpunk!,
    previous = cp.recovery?.text === text ? cp.recovery : undefined,
    consumed = new Set<number>(),
    prior = previous?.applied.slice() ?? [];
  const recovery = previous
    ? structuredClone(previous)
    : {
        text,
        input: [
          {
            role: "user",
            content:
              JSON.stringify({
                campaign: g.campaign,
                date: cyberDate(cp.era, g.time.campaignMinute),
                name: g.character.name,
                appearance: g.character.appearance,
                cyberpunk: { ...cp, recovery: undefined },
                npcs: g.npcs,
                quests: g.quests,
                memories: g.memories.slice(0, 20),
                dialogue: g.messages.slice(-24),
              }) +
              "\nAÇÃO: " +
              text,
          },
        ],
        applied: [],
      };
  const save = () => {
    if (!isCurrent()) throw Error("Campanha alterada.");
    g = withCyberState(g, {
      ...g.cyberpunk!,
      recovery: structuredClone(recovery),
    });
    onProgress(g);
  };
  save();
  for (let round = 0; round < 12; round++) {
    const res = await respond({
      model,
      instructions: cyberInstructions(g),
      input: recovery.input,
      tools: cyberTools,
    });
    if (!isCurrent()) throw Error("Campanha alterada.");
    const output = (res.output ?? []) as Record<string, unknown>[],
      calls = output.filter((o) => o.type === "function_call");
    const narration =
      typeof res.output_text === "string"
        ? res.output_text
        : output
            .filter((o) => o.type === "message")
            .flatMap((o) =>
              ((o.content ?? []) as Record<string, unknown>[])
                .filter((c) => c.type === "output_text")
                .map((c) => String(c.text ?? "")),
            )
            .join("\n");
    recovery.input.push(...output);
    for (const c of calls) {
      const name = String(c.name),
        args = String(c.arguments ?? "{}"),
        callId = String(c.call_id);
      let result: unknown;
      try {
        const i = prior.findIndex(
          (e, index) =>
            !consumed.has(index) &&
            (e.callId === callId ||
              signature(e.name, e.args) === signature(name, args)),
        );
        if (i >= 0) {
          consumed.add(i);
          result = prior[i].result;
        } else if (g.cyberpunk!.pending)
          result = { ok: false, error: "Aguarde a rolagem pendente." };
        else {
          const out = executeCyberTool(g, name, JSON.parse(args));
          g = out.state;
          result = out.result;
          recovery.applied.push({ callId, name, args, result });
        }
      } catch (e) {
        result = { ok: false, error: (e as Error).message };
      }
      recovery.input.push({
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(result),
      });
    }
    save();
    if (g.cyberpunk!.pending) {
      const p = g.cyberpunk!.pending;
      return {
        state: withCyberState(g, { ...g.cyberpunk!, recovery: undefined }),
        text: narration || `${p.label}: use o botão de rolagem para continuar.`,
      };
    }
    if (!calls.length && narration) {
      if (/(?:\brole\b|faça (?:um teste|uma rolagem))/i.test(narration)) {
        recovery.input.push({
          role: "developer",
          content:
            "Se você está solicitando dados, registre request_roll antes do texto. Caso não precise de teste, retire a instrução de rolar.",
        });
        continue;
      }
      return {
        state: withCyberState(g, { ...g.cyberpunk!, recovery: undefined }),
        text: narration,
      };
    }
  }
  throw Error(
    "O Mestre não concluiu. Use Retomar; os efeitos já aplicados foram preservados.",
  );
}
