import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
registerHooks({resolve(s,c,next){if(s.startsWith('@/')){const p=path.join(process.cwd(),s.slice(2));return next(pathToFileURL(/\.[a-z0-9]+$/i.test(p)?p:p+'.ts').href,c);}if(s.startsWith('./')&&!/\.[a-z0-9]+$/i.test(s)){try{return next(s+'.ts',c);}catch{}}return next(s,c);}});
const game=await import('../lib/game.ts');
const gm=await import('../lib/gm.ts');
const expansion=await import('../lib/expansionTransformations.ts');
const dice=await import('../lib/dice.ts');
const raw=(await import('../lib/compendium/daggerheart.generated.json',{with:{type:'json'}})).default;
function character(){const s=structuredClone(game.initialState);s.campaign.system='Daggerheart';s.character={...s.character,level:1,tier:1,hp:0,maxHp:6,stress:0,maxStress:6,hope:6,maxHope:6,armor:0,damageThresholds:{major:5,severe:10},conditions:[],death:undefined,daggerheart:{class:{id:'Bard',name:'Bardo'},subclass:{id:'Wordsmith',name:'Beletrista'},classFeatures:[],subclassFeatures:[],ancestry:{mixed:false,primary:{id:'core-ancestry-human',name:'Humano'},features:[]},community:{id:'loreborne',name:'Erudita',features:[]},traits:{agility:1,strength:2,finesse:0,instinct:1,presence:2,knowledge:0},experiences:[],domains:[],domainCards:[],connections:[],history:'',trackers:[]}};s.messages=[];s.events=[];s.pendingRoll=undefined;return s;}
const call=(s,name,args)=>gm.executeGmTool(s,name,JSON.stringify(args));
function grant(key,state=character()){const out=call(state,'character_expansion_transformation_set',{transformation:key,active:true,reason:'Adquirida na história'});assert.equal(out.result.ok,true,JSON.stringify(out.result));return out.state;}
const action=(s,key,action,args={})=>call(s,'character_expansion_transformation_action',{transformation:key,action,reason:'Usar a característica',...args});
test('the six expansion transformation families include all twelve translated features',()=>{
 const parents=raw.entries.filter(e=>e.type==='transformation');
 for(const name of ['Werewolf','Vampire','Ghost','Reanimated','Shapeshifter','Demigod']){
  const p=parents.find(e=>e.sourceId===name);assert.ok(p,name);assert.equal(p.category,'transformations');
  assert.equal(raw.entries.filter(e=>e.type==='transformationFeature'&&e.parent===name).length,2);
 }
});
test('Demigod uses d10 only for explicit advantage, preserving other auxiliary dice',()=>{
 const request={label:'Teste',reason:'Testar vantagem',formula:'2d12+1d6+2',rollKind:'duality',actionType:'check',advantage:true};
 const ordinary=call(character(),'request_player_roll',request);assert.equal(ordinary.result.ok,true);assert.equal(ordinary.state.pendingRoll.formula,'2d12+1d6+2+1d6');
 const divine=call(grant('demigod'),'request_player_roll',request);assert.equal(divine.result.ok,true);assert.equal(divine.state.pendingRoll.formula,'2d12+1d6+2+1d10');
 const normal=call(grant('demigod'),'request_player_roll',{...request,advantage:false});assert.equal(normal.state.pendingRoll.formula,request.formula);
});
test('Demigod fear failure requires a persistent player choice exactly once',()=>{
 let s=grant('demigod');const start=call(s,'request_player_roll',{label:'Teste',reason:'Fracasso',formula:'2d12',target:20,rollKind:'duality'}).state;
 s=game.resolvePendingRoll(start,start.pendingRoll.id,{total:11,dice:[{die:'d12',value:3,label:'Esperança'},{die:'d12',value:8,label:'Medo'}]});
 const rollId=s.rollHistory.at(-1).id;assert.deepEqual(expansion.expansionState(s.character,'demigod').divinityPendingRollIds,[rollId]);
 assert.equal(action(s,'demigod','divinity-stress',{rollId}).result.ok,false,'O mestre não escolhe pelo jogador');
 assert.equal(call(s,'request_player_roll',{label:'Outro',reason:'Outro teste',formula:'2d12',rollKind:'duality'}).result.ok,false);
 const chosen=expansion.expansionTransformationAction(JSON.parse(JSON.stringify(s)),'demigod','divinity-stress',{rollId});assert.equal(chosen.result.ok,true);assert.equal(chosen.state.character.stress,1);
 assert.equal(expansion.expansionTransformationAction(chosen.state,'demigod','divinity-stress',{rollId}).result.ok,false);
 const fear=expansion.expansionTransformationAction(s,'demigod','divinity-fear',{rollId});assert.equal(fear.result.ok,true);assert.equal(expansion.expansionState(fear.state.character,'demigod').fearGranted,1);assert.equal(fear.state.character.stress,0);
 const full=structuredClone(s);full.character.stress=6;assert.equal(expansion.expansionTransformationAction(full,'demigod','divinity-stress',{rollId}).result.ok,false);assert.equal(expansion.expansionTransformationAction(full,'demigod','divinity-fear',{rollId}).result.ok,true);
});
test('Demigod does not penalize Fear successes, Hope failures or criticals and supports GM adjudication without a target',()=>{
 for(const [hope,fear,success] of [[3,8,true],[8,3,false],[6,6,false]]){
  let s=grant('demigod');s=game.requestPlayerRoll(s,{label:'Teste',reason:'Teste',formula:'2d12',rollKind:'duality'});s=game.resolvePendingRoll(s,s.pendingRoll.id,{total:hope+fear,success,dice:[{die:'d12',value:hope,label:'Esperança'},{die:'d12',value:fear,label:'Medo'}]});
  assert.equal(expansion.expansionState(s.character,'demigod').divinityPendingRollIds?.length||0,0);
 }
 let s=grant('demigod');s=game.requestPlayerRoll(s,{label:'Sem CD',reason:'Adjudicação',formula:'2d12',rollKind:'duality'});s=game.resolvePendingRoll(s,s.pendingRoll.id,{total:11,dice:[{die:'d12',value:3,label:'Esperança'},{die:'d12',value:8,label:'Medo'}]});
 const rollId=s.rollHistory.at(-1).id;const judged=action(s,'demigod','fear-failure',{rollId});assert.equal(judged.result.ok,true);assert.deepEqual(expansion.expansionState(judged.state.character,'demigod').divinityPendingRollIds,[rollId]);
});
test('the divine cost can still be resolved after a failed roll incapacitates the character',()=>{
 let s=grant('demigod');s=game.requestPlayerRoll(s,{label:'Teste',reason:'Teste',formula:'2d12',rollKind:'duality'});s=game.resolvePendingRoll(s,s.pendingRoll.id,{total:11,dice:[{die:'d12',value:3,label:'Esperança'},{die:'d12',value:8,label:'Medo'}]});
 const rollId=s.rollHistory.at(-1).id;s.character.hp=6;s.character.death={status:'choice'};s.character.conditions=['Inconsciente'];
 const judged=action(s,'demigod','fear-failure',{rollId});assert.equal(judged.result.ok,true);const choice=expansion.expansionTransformationAction(judged.state,'demigod','divinity-fear',{rollId});assert.equal(choice.result.ok,true);assert.equal(choice.state.character.death.status,'choice');assert.equal(expansion.expansionState(choice.state.character,'demigod').fearGranted,1);
});
test('optional initial transformation starts empty and applies one acquisition cost before advancement',()=>{
 const base=character().character;assert.equal(expansion.withStartingTransformation(base).daggerheart.expansionTransformations?.length||0,0);
 for(const definition of expansion.EXPANSION_TRANSFORMATIONS){const created=expansion.withStartingTransformation(base,definition.key);assert.equal(created.daggerheart.expansionTransformations.length,1);assert.equal(created.daggerheart.expansionTransformations[0].key,definition.key);assert.equal(created.permanentHp||0,definition.key==='ghost'?1:0);assert.equal(expansion.withStartingTransformation(created,definition.key).permanentHp||0,created.permanentHp||0);}
 const ghost=expansion.withStartingTransformation(base,'ghost');ghost.level=5;assert.equal(expansion.reconcileExpansionCharacter(ghost).permanentHp,3);assert.equal(base.permanentHp,undefined);
 assert.throws(()=>expansion.withStartingTransformation(base,'invented'));
});
test('each transformation has a distinct square WebP icon shared with its own features',()=>{
 const hashes=new Set();
 for(const definition of expansion.EXPANSION_TRANSFORMATIONS){
  const parent=raw.entries.find(entry=>entry.type==='transformation'&&entry.transformationKey===definition.key);assert.ok(parent?.art);
  const bytes=fs.readFileSync(path.join(process.cwd(),'public',parent.art));assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  assert.equal(bytes.readUInt16LE(26)&0x3fff,256);assert.equal(bytes.readUInt16LE(28)&0x3fff,256);
  hashes.add(createHash('sha256').update(bytes).digest('hex'));
  for(const feature of raw.entries.filter(entry=>entry.type==='transformationFeature'&&entry.parent===definition.sourceId))assert.equal(feature.art,parent.art);
 }
 assert.equal(hashes.size,6);
});
test('Demigod advantage cancels vampire hunger and acquired forms survive a saved starting snapshot',()=>{
 let s=grant('demigod',grant('vampire'));const request=call(s,'request_player_roll',{label:'Teste',reason:'Vantagem e fome',formula:'2d12+2',rollKind:'duality',advantage:true});assert.equal(request.state.pendingRoll.formula,'2d12+2');
 s=character();s.character=expansion.withStartingTransformation(s.character,'ghost');s.campaign.restartSnapshot=game.createCampaignRestartSnapshot(s);
 const reopened=game.ensureGameStateCharacterModel(JSON.parse(JSON.stringify(s)));assert.equal(reopened.character.permanentHp,1);assert.equal(reopened.campaign.restartSnapshot.character.permanentHp,1);assert.equal(reopened.campaign.restartSnapshot.character.daggerheart.expansionTransformations[0].key,'ghost');
});
test('Werewolf requires marked HP, adds the Wolf Die and converts Hope gains into Stress',()=>{
 let s=grant('werewolf');assert.equal(action(s,'werewolf','wolf-form').result.ok,false);
 s=game.executeCommand(s,{type:'adjust',resource:'hp',amount:1});
 const wolf=action(s,'werewolf','wolf-form');assert.equal(wolf.result.ok,true);s=wolf.state;assert.equal(s.character.stress,1);
 const attack=call(s,'request_player_roll',{label:'Ataque',reason:'Golpear',formula:'2d12+2',rollKind:'duality',actionType:'attack'});
 assert.equal(attack.result.ok,true);assert.match(attack.state.pendingRoll.formula,/1d10/);
 s=game.executeCommand(s,{type:'adjust',resource:'hope',amount:1});assert.equal(s.character.hope,6);assert.equal(s.character.stress,2);
});
test('Werewolf Frenzy rolls tier d20 and ends the form only after the linked result',()=>{
 let s=grant('werewolf');s=game.executeCommand(s,{type:'adjust',resource:'hp',amount:1});s=action(s,'werewolf','wolf-form').state;
 s=game.executeCommand(s,{type:'adjust',resource:'stress',amount:5});
 assert.equal(s.pendingRoll?.purpose,'werewolf-frenzy');assert.equal(s.pendingRoll.formula,'1d20');
 s=game.resolvePendingRoll(s,s.pendingRoll.id,{formula:'1d20',total:17,dice:[{die:'d20',value:17}]});
 assert.equal(s.character.daggerheart.expansionTransformations.find(t=>t.key==='werewolf').wolfActive,false);
 assert.equal(s.pendingRoll,undefined);assert.match(s.messages.at(-1).text,/17.*dano físico/);
});
test('Ghost has permanent marked HP on acquisition and once per new tier, plus spirit defenses',()=>{
 let s=grant('ghost');assert.equal(s.character.permanentHp,1);assert.equal(s.character.hp,1);
 s=grant('ghost',s);assert.equal(s.character.permanentHp,1);
 s=game.executeCommand(s,{type:'adjust',resource:'hp',amount:-6});assert.equal(s.character.hp,1);
 s.character.level=5;s=game.ensureGameStateCharacterModel(s);assert.equal(s.character.permanentHp,3);
 assert.equal(game.ensureGameStateCharacterModel(s).character.permanentHp,3);
 const spirit=action(s,'ghost','spirit-form');assert.equal(spirit.result.ok,true);assert.equal(spirit.state.character.stress,1);
 const physical=call(spirit.state,'character_receive_damage',{amount:9,damageType:'physical',reason:'Espada'});assert.equal(physical.result.hpMarked,0);
 const magic=call(spirit.state,'character_receive_damage',{amount:5,damageType:'magic',reason:'Magia'});assert.equal(magic.result.adjustedDamage,10);assert.equal(magic.result.hpMarked,3);
 const last=game.executeCommand(s,{type:'adjust',resource:'hp',amount:6});
 assert.equal(last.character.death.status,'last-glory');assert.equal(game.chooseDeathMove(last,'avoid').character.death.status,'last-glory');
});
test('Vampire feeding caps at five, charges Stress and empowers the next attack with a d20 Fear die',()=>{
 let s=grant('vampire');const fangs=action(s,'vampire','fangs');assert.equal(fangs.result.ok,true);assert.match(fangs.state.pendingRoll.formula,/-1d6/);
 s=game.resolvePendingRoll(fangs.state,fangs.state.pendingRoll.id,{formula:fangs.state.pendingRoll.formula,total:15,modifier:2,success:true,dice:[{die:'d12',value:9,label:'Esperança'},{die:'d12',value:5,label:'Medo'},{die:'d6',value:1}]});
 const attackId=s.rollHistory.at(-1).id;
 const feed=action(s,'vampire','feed',{attackRollId:attackId,targetLiving:true,targetHitPointsMarked:6});assert.equal(feed.result.ok,true);s=feed.state;
 assert.equal(s.character.daggerheart.expansionTransformations.find(t=>t.key==='vampire').blood,5);assert.equal(s.character.stress,1);
 assert.equal(action(s,'vampire','feed',{attackRollId:attackId,targetLiving:true,targetHitPointsMarked:2}).result.ok,false);
 s=action(s,'vampire','empower').state;
 const attack=call(s,'request_player_roll',{label:'Ataque',reason:'Golpear',formula:'2d12+2',rollKind:'duality',actionType:'attack'});
 assert.equal(attack.result.ok,true);assert.equal(attack.state.pendingRoll.dualityFearSides,20);assert.match(attack.state.pendingRoll.formula,/1d20/);assert.doesNotMatch(attack.state.pendingRoll.formula,/-1d6/);
 const begun=call(s,'character_long_rest',{phase:'start',reason:'Repouso'});const end=call(begun.state,'character_long_rest',{phase:'finish',restId:begun.result.restId,reason:'Repouso concluído'});
 assert.equal(end.state.character.daggerheart.expansionTransformations.find(t=>t.key==='vampire').blood,3);
 assert.equal(call(end.state,'character_long_rest',{phase:'finish',restId:begun.result.restId,reason:'Repetição'}).state.character.daggerheart.expansionTransformations.find(t=>t.key==='vampire').blood,3);
});
test('Reanimated heals only through rest with fresh remains or Risk It All',()=>{
 let s=grant('reanimated');s.character.hp=4;
 assert.equal(call(s,'character_adjust_resource',{resource:'hp',amount:-2,reason:'Poção'}).result.ok,false);
 assert.equal(call(s,'character_adjust_resource',{resource:'hp',amount:-2,healingSource:'rest',freshRemains:false,reason:'Descanso sem restos'}).result.ok,false);
 const healed=call(s,'character_adjust_resource',{resource:'hp',amount:-2,healingSource:'rest',freshRemains:true,reason:'Ação de repouso com restos'});assert.equal(healed.result.ok,true);assert.equal(healed.state.character.hp,2);
 s.character.hp=6;s.character.death={status:'choice'};s=game.chooseDeathMove(s,'risk');
 s=game.resolvePendingRoll(s,s.pendingRoll.id,{total:10,dice:[{die:'d12',value:3,label:'Esperança'},{die:'d12',value:7,label:'Medo'}]});
 assert.equal(s.character.death.status,'reanimated-choice');
 const saved=expansion.expansionTransformationAction(s,'reanimated','survive');assert.equal(saved.result.ok,true);assert.equal(saved.state.character.permanentHp,1);assert.equal(saved.state.character.death.status,'risk-recovery');assert.equal(saved.state.character.death.recoveryPoints,3);
});

test('Vampire duality preserves Hope, Fear d20 and auxiliary die render roles',()=>{
 const parsed=dice.parseDiceFormula('1d12+1d20+1d10-1d6+2');
 const roles=dice.dualityAppearanceByDie(parsed,20);assert.deepEqual(roles,['hope','fear','normal','normal']);
 const rolled=dice.rollDice(parsed,{random:()=>0.5,appearanceByDie:roles});
 const lanes=dice.buildDiceBoxRenderPlan(rolled);assert.equal(lanes.find(l=>l.role==='fear').roll.notation,'1d20');
 assert.equal(lanes.find(l=>l.role==='hope').roll.notation,'1d12');
 assert.throws(()=>dice.dualityAppearanceByDie(dice.parseDiceFormula('2d12'),20));
});

test('Wolf Form eligibility expires when time passes or a different action is rolled',()=>{
 let s=grant('werewolf');s=game.executeCommand(s,{type:'adjust',resource:'hp',amount:1});
 const elapsed=call(s,'advance_time',{minutes:10,reason:'A luta terminou'}).state;
 assert.equal(action(elapsed,'werewolf','wolf-form').result.ok,false);
 const acted=call(s,'request_player_roll',{label:'Investigar',reason:'Olhar o local',formula:'2d12',rollKind:'duality',actionType:'check'}).state;
 const resolved=game.resolvePendingRoll(acted,acted.pendingRoll.id,{total:12,dice:[{die:'d12',value:7,label:'Esperança'},{die:'d12',value:5,label:'Medo'}]});
 assert.equal(action(resolved,'werewolf','wolf-form').result.ok,false);
});

test('spirit attacks require a paid material interaction and failed costs do not mutate state',()=>{
 let s=grant('ghost');s=action(s,'ghost','spirit-form').state;
 const request={label:'Ataque',reason:'Atacar um guarda',formula:'2d12+1',rollKind:'duality',actionType:'attack'};
 assert.equal(call(s,'request_player_roll',request).result.ok,false);
 const paid=action(s,'ghost','interact',{forAttack:true});assert.equal(paid.state.character.hope,4);
 const attack=call(paid.state,'request_player_roll',request);assert.equal(attack.result.ok,true);
 assert.equal(attack.state.character.daggerheart.expansionTransformations.find(t=>t.key==='ghost').materialAttackReady,false);
 const exhausted=structuredClone(s);exhausted.character.stress=exhausted.character.maxStress;
 const before=structuredClone(exhausted);assert.equal(action(exhausted,'ghost','spirit-form').result.ok,false);assert.deepEqual(exhausted,before);
});

test('the GM cannot choose Cadaver survival for the player',()=>{
 const s=grant('reanimated');s.character.hp=6;s.character.death={status:'reanimated-choice',move:'risk',recoveryPoints:3};
 assert.equal(action(s,'reanimated','survive').result.ok,false);
 assert.equal(action(s,'reanimated','accept-death').result.ok,false);
 assert.equal(expansion.expansionTransformationAction(s,'reanimated','accept-death').state.character.death.status,'dead');
});
test('Shapeshifter changes ancestry during long rest and selects exactly one valid ancestry feature',()=>{
 let s=grant('shapeshifter');
 const args={ancestryId:'core-ancestry-dwarf',featureId:'core-ancestryFeature-thick-skin'};
 const ancestry=raw.entries.find(e=>e.type==='ancestry'&&e.sourceId==='Dwarf');const feature=raw.entries.find(e=>e.type==='ancestryFeature'&&e.parent==='Dwarf');assert.ok(ancestry&&feature);
 args.ancestryId=ancestry.id;args.featureId=feature.id;
 assert.equal(action(s,'shapeshifter','change-shape',args).result.ok,false);
 const started=call(s,'character_long_rest',{phase:'start',reason:'Mudar de forma durante o repouso'});s=started.state;
 const changed=action(s,'shapeshifter','change-shape',args);assert.equal(changed.result.ok,true);assert.equal(changed.state.character.daggerheart.ancestry.primary.id,ancestry.id);
 assert.deepEqual(changed.state.character.daggerheart.ancestry.features,[{id:feature.id,name:feature.name}]);
 assert.equal(changed.state.character.daggerheart.restCycle.active.restMovesSpent,1);
 assert.equal(action(s,'shapeshifter','change-shape',{...args,featureId:'Rally'}).result.ok,false);
 const human=raw.entries.find(e=>e.type==='ancestry'&&e.sourceId==='Human');const humanFeature=raw.entries.find(e=>e.type==='ancestryFeature'&&e.parent==='Human');
 const second=action(changed.state,'shapeshifter','change-shape',{ancestryId:human.id,featureId:humanFeature.id});assert.equal(second.result.ok,true);
 assert.equal(action(second.state,'shapeshifter','change-shape',args).result.ok,false,'O descanso longo tem duas ações-base, sem trocas ilimitadas');
});
