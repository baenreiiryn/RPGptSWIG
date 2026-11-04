import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = path.join(process.cwd(), specifier.slice(2));
      return nextResolve(pathToFileURL(/\.[a-z0-9]+$/i.test(target) ? target : target + ".ts").href, context);
    }
    if (specifier.startsWith("./") && !/\.[a-z0-9]+$/i.test(specifier)) {
      try { return nextResolve(specifier + ".ts", context); } catch {}
    }
    return nextResolve(specifier, context);
  },
});
const game = await import("../lib/game.ts");
const gm = await import("../lib/gm.ts");

function bard() {
  const state = structuredClone(game.initialState);
  state.campaign.system = "Daggerheart";
  state.character.level = 1;
  state.character.hope = 3;
  state.character.daggerheart = {
    class: {id: "core-class-bard", name: "Bardo"},
    subclass: {id: "core-subclass-wordsmith", name: "Beletrista"},
    classFeatures: [{id: "core-classFeature-rally", name: "Inspiração"}],
    subclassFeatures: [],
    ancestry: {mixed: false, primary: {id: "core-ancestry-clank", name: "Clank"}, features: []},
    community: {id: "core-community-loreborne", name: "Erudita", features: []},
    traits: {agility: 0, strength: -1, finesse: 1, instinct: 0, presence: 2, knowledge: 1},
    experiences: [], domains: ["Grace", "Codex"], domainCards: [], connections: [], history: "",
    trackers: [{id:"bard-rally", name:"Dado de Inspiração", kind:"die", value:0, min:0, max:6, dieSides:6, active:false, source:{type:"classFeature", id:"Rally"}}],
  };
  state.messages = [];
  state.events = [];
  return state;
}

test("a bard speaking to inspire supplies the owned Inspiration rules and tracker without spending them", () => {
  const state = bard();
  const input = gm.buildTurnInput(state, "Vou usar a fala para inspirar meus companheiros.");
  const content = input[0].content;
  const packet = JSON.parse(content.split("ESTADO ATUAL DO ORACLE:\n")[1].split("\n\nMENSAGEM DO JOGADOR:")[0]);
  const ability = packet.characterAbilities?.find((item) => item.sourceId === "Rally");
  assert.ok(ability, "The GM must receive the full rules of Inspiration, not just its display name");
  assert.match(ability.description, /Uma vez por descanso longo/);
  assert.match(ability.description, /Dado de Inspiração/);
  assert.ok(packet.abilityIntentHints?.some((item) => item.sourceId === "Rally"));
  assert.equal(state.character.daggerheart.trackers[0].active, false);
  assert.equal(state.character.hope, 3);
});

test("an inspiration phrase never grants a feature the character does not own", () => {
  const state = bard();
  state.character.daggerheart.classFeatures = [];
  state.character.daggerheart.trackers = [];
  const input = gm.buildTurnInput(state, "Quero inspirar o grupo com um discurso.");
  const packet = JSON.parse(input[0].content.split("ESTADO ATUAL DO ORACLE:\n")[1].split("\n\nMENSAGEM DO JOGADOR:")[0]);
  assert.equal(packet.characterAbilities?.some((item) => item.sourceId === "Rally") ?? false, false);
  assert.equal(packet.abilityIntentHints?.some((item) => item.sourceId === "Rally") ?? false, false);
});

function call(name, args, id = name) {
  return {type:"function_call", call_id:id, name, arguments:JSON.stringify(args)};
}
function message(text) {
  return {output:[{type:"message",role:"assistant",content:[{type:"output_text",text}]}]};
}
const attack = {label:"Ataque com rapieira",reason:"O ataque precisa ser resolvido.",formula:"2d12+2",rollKind:"duality"};

test("retry after a resource change keeps tools and creates the attack roll without spending twice", async () => {
  const {runGmTurn} = await import("../lib/gmTurn.ts");
  let persisted = bard();
  let requests = 0;
  await assert.rejects(runGmTurn(persisted,"Ataco com a rapieira.",async () => {
    if (requests++ === 0) return {output:[call("character_adjust_resource",{resource:"hope",amount:-1,reason:"Custo da ação"})]};
    throw new Error("Falha de rede");
  },{model:"test",onProgress:state=>{persisted=state;}}),/Falha de rede/);
  assert.equal(persisted.character.hope,2);
  assert.equal(persisted.gmRecovery.appliedTools.length,1);
  let resumed = 0;
  const result = await runGmTurn(persisted,persisted.gmRecovery.text,async payload => {
    assert.ok(payload.tools.some(tool=>tool.name==="request_player_roll"));
    if (resumed++ === 0) return {output:[call("character_adjust_resource",{resource:"hope",amount:-1,reason:"Pagar o custo"},"replay")]};
    return {output:[call("request_player_roll",attack)]};
  },{model:"test",onProgress:state=>{persisted=state;}});
  assert.equal(result.state.character.hope,2);
  assert.equal(result.state.pendingRoll.formula,"2d12+2");
  assert.equal(result.state.pendingRoll.rollKind,"duality");
  assert.equal(result.state.events.filter(event=>event.actor==="gm-ai").length,1);
});

test("a textual dice request is repaired into an interface request before it is published", async () => {
  const {runGmTurn} = await import("../lib/gmTurn.ts");
  let requests = 0;
  const result = await runGmTurn(bard(),"Ataco com a rapieira.",async payload => {
    if (requests++ === 0) return message("Faça uma rolagem de **Presença com a rapieira: 2d12+2**. Aguardo o resultado.");
    assert.deepEqual(payload.toolChoice,{type:"function",name:"request_player_roll"});
    return {output:[call("request_player_roll",attack)]};
  },{model:"test"});
  assert.equal(requests,2);
  assert.equal(result.state.pendingRoll.formula,"2d12+2");
  assert.equal(result.state.pendingRoll.rollKind,"duality");
});

test("a resolved linked roll continues and a failed continuation can resume without rolling again", async () => {
  const {runGmTurn} = await import("../lib/gmTurn.ts");
  const pending = game.requestPlayerRoll(bard(),attack);
  const resolved = game.resolvePendingRoll(pending,pending.pendingRoll.id,{
    total:20,formula:"2d12+2",dice:[{die:"d12",value:9,label:"Esperança"},{die:"d12",value:9,label:"Medo"}],
    modifier:2,result:"Crítico de Dualidade",success:true,source:"tray",
  });
  const text = "RESULTADO DA ROLAGEM SOLICITADA: 2d12+2 = 20, crítico. Continue exatamente do ponto em que a cena aguardava esta rolagem.";
  let persisted = resolved;
  await assert.rejects(runGmTurn(resolved,text,async ()=>{throw new Error("Rede caiu");},{
    model:"test",onProgress:state=>{persisted=state;},
  }),/Rede caiu/);
  assert.equal(persisted.gmRecovery.text,text);
  assert.equal(persisted.rollHistory.length,1);
  assert.equal(persisted.pendingRoll,undefined);
  const result = await runGmTurn(persisted,text,async payload=>{
    assert.match(payload.input[0].content,/Crítico de Dualidade/);
    return message("Sua rapieira atravessa a guarda do inimigo. O golpe é crítico.");
  },{model:"test"});
  assert.match(result.narration,/crítico/);
  assert.equal(result.state.rollHistory.length,1);
  assert.equal(result.state.pendingRoll,undefined);
});

test("recovery never silently publishes another text-only dice request when the model ignores the tool", async () => {
  const {runGmTurn} = await import("../lib/gmTurn.ts");
  await assert.rejects(runGmTurn(bard(),"Ataco.",async ()=>message("Role 2d12+2 para atacar."),{model:"test"}),/rolagem.*interface/i);
});

test("past dice results and negated instructions do not create new rolls", async () => {
  const {runGmTurn} = await import("../lib/gmTurn.ts");
  let requests=0;
  const result = await runGmTurn(bard(),"Continuar.",async ()=>{
    requests++;return message("Você rolou 2d12+2 e acertou. Não precisa rolar novamente.");
  },{model:"test"});
  assert.equal(requests,1);
  assert.equal(result.state.pendingRoll,undefined);
});
test("a request to roll a named feature die also requires the roll interface", async () => {
  const {narrationRequestsRoll} = await import("../lib/gmTurn.ts");
  assert.equal(narrationRequestsRoll("Role seu Dado de Inspiração."),true);
  assert.equal(narrationRequestsRoll("Role Presença com a rapieira: 2d12+2."),true);
  assert.equal(narrationRequestsRoll("Não role o Dado de Inspiração agora."),false);
  assert.equal(narrationRequestsRoll("Seu discurso inspira o grupo e concede um d6."),false);
});
