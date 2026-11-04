import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
registerHooks({resolve(s,c,next){if(s.startsWith('@/')){const p=path.join(process.cwd(),s.slice(2));return next(pathToFileURL(/\.[a-z0-9]+$/i.test(p)?p:p+'.ts').href,c);}if(s.startsWith('./')&&!/\.[a-z0-9]+$/i.test(s)){try{return next(s+'.ts',c);}catch{}}return next(s,c);}});
const {initialState,ensureGameStateCharacterModel,executeCommand,inferLegacyRestartSnapshot}=await import('../lib/game.ts');
const gm=await import('../lib/gm.ts');
const {runGmTurn}=await import('../lib/gmTurn.ts');
const raw=(await import('../lib/compendium/daggerheart.generated.json',{with:{type:'json'}})).default;
function bard(){
 const state=structuredClone(initialState);state.campaign.system='Daggerheart';state.character.hope=2;
 state.character.daggerheart={class:{id:'core-class-bard',name:'Bardo'},subclass:{id:'core-subclass-wordsmith',name:'Beletrista'},classFeatures:[{id:'Rally',name:'Inspiração'}],subclassFeatures:[],ancestry:{mixed:false,primary:{id:'clank',name:'Clank'},features:[]},community:{id:'loreborne',name:'Erudita',features:[]},traits:{agility:0,strength:0,finesse:1,instinct:0,presence:2,knowledge:1},experiences:[],domains:[],domainCards:[],connections:[],history:'',trackers:[]};
 state.character.level=1;return ensureGameStateCharacterModel(state);
}
const call=(s,name,args)=>gm.executeGmTool(s,name,JSON.stringify(args));
const rest=(s,phase,restId)=>call(s,'character_long_rest',{phase,restId,reason:'Descanso de teste'});
test('the GM receives long-rest rules for every imported session ability',()=>{
 const state=bard();const ability=gm.ownedCharacterAbilities(state).find(e=>e.sourceId==='Rally');
 assert.match(ability.description,/Uma vez por descanso longo/);assert.match(ability.description,/Ao iniciar um descanso longo/);assert.doesNotMatch(ability.description,/sessão/i);
 for(const entry of raw.entries)assert.doesNotMatch(entry.description,/sessão|session/i,entry.id);
 assert.ok(gm.responseTools.some(t=>t.name==='character_long_rest'));
});
test('Inspiration expires at rest start and its spent use renews only after completion',()=>{
 let state=bard();state=call(state,'character_tracker_set',{trackerId:'bard-rally',value:1,mode:'set',reason:'Inspirar'}).state;
 const started=rest(state,'start');assert.equal(started.result.ok,true);state=started.state;
 assert.equal(state.character.daggerheart.trackers.find(t=>t.id==='bard-rally').active,false);
 assert.equal(call(state,'character_tracker_set',{trackerId:'bard-rally',value:1,mode:'set',reason:'Inspirar de novo'}).result.ok,false);
 const interrupted=rest(state,'interrupt',started.result.restId);assert.equal(interrupted.result.ok,true);
 assert.equal(call(interrupted.state,'character_tracker_set',{trackerId:'bard-rally',value:1,mode:'set',reason:'Inspirar'}).result.ok,false);
 const again=rest(interrupted.state,'start');const finished=rest(again.state,'finish',again.result.restId);assert.equal(finished.result.ok,true);
 assert.equal(finished.state.character.daggerheart.trackers.find(t=>t.id==='bard-rally').active,false,'Recarregar o uso não concede inspiração automaticamente');
 assert.equal(call(finished.state,'character_tracker_set',{trackerId:'bard-rally',value:1,mode:'set',reason:'Inspirar'}).result.ok,true);
});
test('spending the granted die does not allow a second inspiration before a completed long rest',()=>{
 let state=bard();state=executeCommand(state,{type:'tracker',trackerId:'bard-rally',value:1,mode:'set'});
 state=executeCommand(state,{type:'tracker',trackerId:'bard-rally',value:0,mode:'set'});
 const blocked=call(state,'character_tracker_set',{trackerId:'bard-rally',value:1,mode:'set',reason:'Segunda inspiração'});
 assert.equal(blocked.result.ok,false);assert.equal(blocked.state.character.daggerheart.trackers[0].active,false);
 assert.deepEqual(ensureGameStateCharacterModel(JSON.parse(JSON.stringify(state))).character.daggerheart.restCycle,state.character.daggerheart.restCycle);
});
test('rest completion requires the matching started rest and cannot refresh twice',()=>{
 const state=bard();assert.equal(rest(state,'finish','missing').result.ok,false);
 const started=rest(state,'start');assert.equal(rest(started.state,'finish','wrong').result.ok,false);
 const completed=rest(started.state,'finish',started.result.restId);assert.equal(completed.result.ok,true);
 const duplicate=rest(completed.state,'finish',started.result.restId);assert.equal(duplicate.result.ok,true);assert.deepEqual(duplicate.state,completed.state);
 assert.deepEqual(state,bard(),'Inspeção e descanso não alteram o estado de entrada');
});
test('three Contacts uses are preserved and reset together, while unowned abilities are rejected',()=>{
 const state=bard();state.character.daggerheart.subclassFeatures=[{id:'Contacts Everywhere',name:'Contatos'},{id:'Reliable Backup',name:'Reforços Confiáveis'}];
 let working=state;
 for(let i=0;i<3;i++){const out=call(working,'character_ability_use',{abilityId:'Contacts Everywhere',reason:'Chamar contato'});assert.equal(out.result.ok,true);working=out.state;}
 assert.equal(call(working,'character_ability_use',{abilityId:'Contacts Everywhere',reason:'Quarto contato'}).result.ok,false);
 assert.equal(call(working,'character_ability_use',{abilityId:'Luckbender',reason:'Não possui'}).result.ok,false);
 const started=rest(working,'start');const finished=rest(started.state,'finish',started.result.restId);
 assert.equal(call(finished.state,'character_ability_use',{abilityId:'Contacts Everywhere',reason:'Novo contato'}).result.ok,true);
});
test('long-rest start clears only expiring pools and grants Slayer hope once',()=>{
 const state=bard();state.character.daggerheart.trackers.push(
 {id:'prayer',name:'Dados de Oração',kind:'dicePool',value:2,min:0,max:12,dieSides:4,dice:[2,4],source:{type:'classFeature',id:'Prayer Dice'}},
 {id:'slayer',name:'Dados de Matança',kind:'dicePool',value:2,min:0,max:4,dieSides:6,dice:[3,5,0],source:{type:'subclassFeature',id:'Slayer'}},
 {id:'favor',name:'Favor',kind:'counter',value:3,min:0,max:6,source:{type:'classFeature',id:'Favor'}});
 const started=rest(state,'start');assert.equal(started.result.ok,true);
 for(const id of ['prayer','slayer']){const t=started.state.character.daggerheart.trackers.find(t=>t.id===id);assert.deepEqual(t.dice,[]);assert.equal(t.value,0);}
 assert.equal(started.state.character.hope,4);assert.equal(started.state.character.daggerheart.trackers.find(t=>t.id==='favor').value,3);
 assert.deepEqual(rest(started.state,'start').state,started.state);
});

test('every adapted limited ability and item enforces its own remaining uses',()=>{
 for(const entry of raw.entries.filter(e=>e.sessionRest?.useLimit)){
  const state=bard();const ref={id:entry.id,name:entry.name};
  const data=state.character.daggerheart;
  if(entry.type==='loot')state.inventory.push({id:'test-item',sourceId:entry.id,name:entry.name,qty:1,detail:entry.description,icon:'◇'});
  else if(entry.type==='ancestryFeature')data.ancestry.features.push(ref);
  else if(entry.type==='communityFeature')data.community.features.push(ref);
  else if(entry.type==='classFeature')data.classFeatures.push(ref);
  else if(entry.type==='subclassFeature')data.subclassFeatures.push(ref);
  else if(entry.type==='domainCard')data.domainCards.push({...ref,domain:entry.domain,level:entry.level});
  const first=call(state,'character_ability_use',{abilityId:entry.id,reason:'Uso da habilidade'});assert.equal(first.result.ok,true,entry.id);
  const second=call(first.state,'character_ability_use',{abilityId:entry.id,reason:'Uso repetido'});assert.equal(second.result.ok,false,entry.id);
  const elapsed=call(first.state,'advance_time',{minutes:1440,reason:'Passou um dia'}).state;
  elapsed.campaign.session+=1;
  assert.equal(call(elapsed,'character_ability_use',{abilityId:entry.id,reason:'Reabri o app'}).result.ok,false,entry.id);
 }
});

test('start-of-session benefits are requested only after a matching completed long rest',()=>{
 const state=bard();const data=state.character.daggerheart;
 data.ancestry.features=[{id:'Luckbringer',name:'Talismã da Sorte'}];
 data.classFeatures.push({id:'Prayer Dice',name:'Dados de Oração'});
 data.subclassFeatures=[{id:'Lunar Phases',name:'Fases Lunares'}];
 data.domainCards=[{id:'Unleash Chaos',name:'Liberar o Caos',domain:'Arcana',level:1}];
 const started=rest(state,'start');assert.equal(started.state.character.hope,2);
 assert.deepEqual(started.result.refreshRequired,[]);
 const finished=rest(started.state,'finish',started.result.restId);
 assert.equal(finished.state.character.hope,3);
 assert.deepEqual(finished.result.refreshRequired.map(e=>e.sourceId).sort(),['Lunar Phases','Prayer Dice','Unleash Chaos'].sort());
 assert.match(finished.result.groupEffects[0],/demais membros/);
 assert.equal(rest(finished.state,'finish',started.result.restId).state.character.hope,3);
});

test('Invigoration can restore one spent use with an owned card and a new qualifying roll',()=>{
 let state=bard();state.character.daggerheart.domainCards=[{id:'Invigoration',name:'Revigorar',domain:'Splendor',level:6}];
 state=call(state,'character_ability_use',{abilityId:'Rally',reason:'Inspirar'}).state;
 const args={abilityId:'Rally',rollId:'invigoration-roll',reason:'Revigorar com resultado seis'};
 assert.equal(call(state,'character_ability_refresh',args).result.ok,false);
 state.rollHistory=[{id:'invigoration-roll',pendingRollId:'test-roll',label:'Revigorar',reason:'Recuperar Inspiração',rollKind:'custom',source:'pending',total:6,dice:[{die:'d6',value:6}],requestedAt:new Date().toISOString(),requestedCampaignMinute:state.time.campaignMinute,resolvedAt:new Date().toISOString(),campaignMinute:state.time.campaignMinute}];
 const restored=call(state,'character_ability_refresh',args);assert.equal(restored.result.ok,true);
 assert.equal(call(restored.state,'character_ability_refresh',args).result.ok,false);
 const activated=call(restored.state,'character_ability_use',{abilityId:'Rally',reason:'Inspirar novamente'});assert.equal(activated.result.ok,true);
 const noCard=structuredClone(state);noCard.character.daggerheart.domainCards=[];
 assert.equal(call(noCard,'character_ability_refresh',args).result.ok,false);
});

test('existing inventory and custom tracker descriptions migrate without changing their values',()=>{
 const state=bard();state.inventory.push({id:'old-ring',name:'Anel antigo',qty:1,detail:'Uma vez por sessão, use este anel.',icon:'◇'});
 state.character.daggerheart.trackers.push({id:'tide',name:'Marcadores',kind:'counter',value:2,min:0,max:5,description:'No fim de cada sessão, marcadores não usados são perdidos.',source:{type:'custom',id:'tide'}});
 const migrated=ensureGameStateCharacterModel(state);
 assert.match(migrated.inventory.at(-1).detail,/por descanso longo/);
 const tracker=migrated.character.daggerheart.trackers.find(t=>t.id==='tide');assert.equal(tracker.value,2);assert.match(tracker.description,/Ao iniciar um descanso longo/);
 assert.deepEqual(ensureGameStateCharacterModel(migrated),migrated);
 assert.match(state.inventory.at(-1).detail,/por sessão/);
 const restarted=inferLegacyRestartSnapshot({...migrated,character:{...migrated.character,daggerheart:{...migrated.character.daggerheart,restCycle:{completed:2,used:{'core-classFeature-rally':1}}}}});
 assert.equal(restarted.character.daggerheart.restCycle,undefined);
});

test('an earlier unrelated six cannot refresh an ability used afterwards',()=>{
 let state=bard();state.character.daggerheart.domainCards=[{id:'Invigoration',name:'Revigorar',domain:'Splendor',level:6}];
 state.rollHistory=[{id:'old-six',pendingRollId:'old-roll',label:'Dano',reason:'Dano anterior',rollKind:'damage',source:'pending',total:6,dice:[{die:'d6',value:6}],requestedAt:new Date().toISOString(),requestedCampaignMinute:state.time.campaignMinute,resolvedAt:new Date().toISOString(),campaignMinute:state.time.campaignMinute}];
 state=call(state,'character_ability_use',{abilityId:'Rally',reason:'Inspirar'}).state;
 assert.equal(call(state,'character_ability_refresh',{abilityId:'Rally',rollId:'old-six',reason:'Resultado antigo'}).result.ok,false);
});

test('a failed GM response resumes the same rest without repeating expiration or renewal',async()=>{
 const state=bard();state.character.daggerheart.ancestry.features=[{id:'Luckbringer',name:'Talismã da Sorte'}];
 let checkpoint=state,calls=0;
 const tool=(id,args)=>({output:[{type:'function_call',call_id:id,name:'character_long_rest',arguments:JSON.stringify(args)}]});
 await assert.rejects(runGmTurn(state,'Começo meu descanso longo.',async()=>{
  if(calls++===0)return tool('begin',{phase:'start',reason:'Acampamento seguro'});
  throw new Error('Falha de rede simulada');
 },{model:'test',onProgress:s=>checkpoint=s}),/Falha de rede/);
 const restId=checkpoint.character.daggerheart.restCycle.active.id;
 calls=0;
 const resumed=await runGmTurn(checkpoint,'Começo meu descanso longo.',async()=>{
  if(calls++===0)return tool('begin-retry',{phase:'start',reason:'Acampamento seguro'});
  if(calls===2)return tool('finish',{phase:'finish',restId,reason:'O descanso terminou'});
  return {output_text:'Você termina o descanso longo.'};
 },{model:'test'});
 assert.equal(resumed.state.character.daggerheart.restCycle.completed,1);
 assert.equal(resumed.state.character.daggerheart.restCycle.active,undefined);
 assert.equal(resumed.state.character.hope,3);
});

test('rest moves share a bounded balance and extra moves require the declared benefit total',()=>{
 const begun=call(bard(),'character_long_rest',{phase:'start',reason:'Descanso longo',availableRestMoves:3});
 assert.equal(begun.result.ok,true);let state=begun.state;
 for(let i=0;i<3;i++){const spent=call(state,'character_rest_move_spend',{restId:begun.result.restId,reason:'Uma escolha de repouso'});assert.equal(spent.result.ok,true);state=spent.state;}
 assert.equal(call(state,'character_rest_move_spend',{restId:begun.result.restId,reason:'Sem ações restantes'}).result.ok,false);
 assert.equal(call(state,'character_rest_move_spend',{restId:'outro-descanso',reason:'Identificador incorreto'}).result.ok,false);
 assert.equal(call(bard(),'character_long_rest',{phase:'start',reason:'Total inválido',availableRestMoves:0}).result.ok,false);
});
