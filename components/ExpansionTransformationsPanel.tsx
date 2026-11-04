"use client";

import { useState } from "react";
import CompendiumArt from "@/components/CompendiumArt";
import type { GameState } from "@/lib/game";
import { daggerheartCompendium } from "@/lib/compendium/daggerheart";
import { EXPANSION_TRANSFORMATIONS, expansionState, permanentMarkedHp, type ExpansionTransformationKey } from "@/lib/expansionTransformations";

type Props = {
  state: GameState;
  disabled?: boolean;
  onAction: (key: ExpansionTransformationKey, action: string, args?: Record<string, unknown>) => void;
};
function ShapeshifterChoices({ state, disabled, onAction }: Props) {
  const current = state.character.daggerheart!.ancestry;
  const ancestries = daggerheartCompendium.entries.filter(entry => entry.type === "ancestry").toSorted((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  const [ancestryId, setAncestryId] = useState(current.primary.id);
  const ancestry = ancestries.find(entry => entry.id === ancestryId || entry.sourceId === ancestryId) || ancestries[0];
  const features = daggerheartCompendium.entries.filter(entry => entry.type === "ancestryFeature" && entry.parent === ancestry?.sourceId);
  const [featureId, setFeatureId] = useState(current.features[0]?.id || "");
  const selectedFeature = features.find(entry => entry.id === featureId) || features[0];
  const resting = Boolean(state.character.daggerheart?.restCycle?.active);
  const rest = state.character.daggerheart?.restCycle?.active;
  const sameAncestry = ancestry?.id === current.primary.id;
  const unchangedBenefit = sameAncestry && current.features.some(feature => feature.id === selectedFeature?.id);
  const noMoves = (rest?.restMovesSpent || 0) >= (rest?.availableRestMoves ?? 2);
  return <div className="expansionShapeChoices">
    <p>Atual: <strong>{current.primary.name}</strong> · {current.features.map(feature => feature.name).join(", ") || "sem benefício escolhido"}</p>
    <label>Ancestralidade<select aria-label="Ancestralidade" value={ancestry?.id || ""} onChange={event=>{setAncestryId(event.target.value);setFeatureId("");}}>{ancestries.map(entry=><option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
    <label>Um benefício ancestral<select aria-label="Um benefício ancestral" value={selectedFeature?.id || ""} onChange={event=>setFeatureId(event.target.value)}>{features.map(entry=><option value={entry.id} key={entry.id}>{entry.name}</option>)}</select></label>
    {selectedFeature && <p>{selectedFeature.description}</p>}
    <button type="button" disabled={disabled || !resting || !selectedFeature || unchangedBenefit || noMoves} onClick={()=>onAction("shapeshifter",sameAncestry?"change-benefit":"change-shape",{ancestryId:ancestry.id,featureId:selectedFeature!.id})}>{sameAncestry?"Trocar benefício":"Alterar Forma"} · 1 ação de repouso</button>
    {!resting && <small>Disponível durante um descanso longo. O mestre também pode registrar a troca de benefício durante um descanso curto.</small>}
    {resting && <small>Ações de repouso usadas: {rest?.restMovesSpent || 0}/{rest?.availableRestMoves ?? 2}</small>}
  </div>;
}
export default function ExpansionTransformationsPanel({ state, disabled, onAction }: Props) {
  const character = state.character;
  const resting = Boolean(character.daggerheart?.restCycle?.active);
  const cannotAct = disabled || Boolean(state.pendingRoll) || character.conditions.includes("Inconsciente") || Boolean(character.death && character.death.status !== "resolved");
  const canPayStress = character.stress < character.maxStress;
  return <div className="expansionTransformations">
    <header><small>EXPANSÃO</small><h1>Transformações</h1><p>Escolhidas na criação ou adquiridas durante a história. Consulte as regras e use as características que seu personagem possui.</p></header>
    {permanentMarkedHp(character)>0 && <p className="expansionPermanentHp">{permanentMarkedHp(character)} PV permanentemente marcado(s). Esses espaços não podem ser curados.</p>}
    {EXPANSION_TRANSFORMATIONS.map(definition=>{
      const owned=expansionState(character,definition.key);
      const parent=daggerheartCompendium.entries.find(entry=>entry.type==="transformation"&&entry.transformationKey===definition.key);
      const features=daggerheartCompendium.entries.filter(entry=>entry.type==="transformationFeature"&&entry.parent===definition.sourceId);
      return <details className={"expansionTransformationCard"+(owned?" acquired":"")} key={definition.key}>
        <summary><CompendiumArt entry={parent} alt="" className="expansionTransformationArt" fallback={<b aria-hidden="true">{definition.glyph}</b>} /><div><h2>{definition.name}</h2><span>{owned?"Adquirida":"Disponível na expansão"}{owned?.wolfActive?" · Forma Lupina ativa":owned?.spiritActive?" · Forma Espiritual ativa":""}</span></div><i aria-hidden="true">⌄</i></summary>
        <div className="expansionTransformationBody">
          {!owned && <p>Esta transformação pode ser adquirida durante a história pelo mestre.</p>}
          {owned && definition.key==="werewolf" && <div className="expansionTransformationControls"><p>{owned.wolfActive?"Dado do Lobo: +1d10 em ataques e dano. Ganhar Esperança marca Fadiga.":owned.wolfEligible?"Você marcou PV e pode assumir a Forma Lupina.":"Você pode assumir a Forma Lupina ao marcar PV."}</p><button type="button" disabled={cannotAct||!canPayStress||!owned.wolfEligible||owned.wolfActive} onClick={()=>onAction("werewolf","wolf-form")}>Assumir Forma Lupina · 1 Fadiga</button></div>}
          {owned && definition.key==="ghost" && <div className="expansionTransformationControls"><p>{owned.spiritActive?"Incorpóreo: imune a dano físico e dano mágico dobrado.":"Forma corpórea."}</p><button type="button" disabled={cannotAct||!canPayStress} onClick={()=>onAction("ghost","spirit-form")}>{owned.spiritActive?"Voltar à forma corpórea":"Assumir Forma Espiritual"} · 1 Fadiga</button>{owned.spiritActive&&<button type="button" disabled={cannotAct||character.hope<2||owned.materialAttackReady} onClick={()=>onAction("ghost","interact",{forAttack:true})}>{owned.materialAttackReady?"Ataque material preparado":"Preparar ataque material · 2 Esperança"}</button>}</div>}
          {owned && definition.key==="vampire" && <div className="expansionTransformationControls"><p><strong>Alimentar-se: {owned.blood||0}/5 marcadores</strong>{!owned.blood?" · Fome: desvantagem em testes de ação e reação.":""}{owned.empoweredAttack?" · Próximo ataque com Medo em d20.":""}</p><button type="button" disabled={cannotAct} onClick={()=>onAction("vampire","fangs")}>Usar Presas · Força</button><button type="button" disabled={cannotAct||!owned.blood||owned.empoweredAttack} onClick={()=>onAction("vampire","empower")}>Potencializar próximo ataque · 1 marcador</button><small>Após acertar Presas numa criatura viva, o mestre registra Alimentar-se e os PV marcados pelo alvo.</small></div>}
          {owned && definition.key==="reanimated" && <p className="expansionPermanentHp">Cura por ação de repouso exige restos mortais frescos. Arriscar Tudo também pode recuperar PV. Em uma falha, você poderá escolher usar Cadáver.</p>}
          {owned && definition.key==="demigod" && <div className="expansionTransformationControls"><p>Elixir dos Deuses: seu dado de vantagem é d10.</p>{(owned.divinityPendingRollIds || []).map(rollId=><div key={rollId}><p>O Peso da Divindade: escolha o custo deste fracasso com Medo.</p><button type="button" disabled={cannotAct||!canPayStress} onClick={()=>onAction("demigod","divinity-stress",{rollId})}>Marcar 1 Fadiga</button><button type="button" disabled={cannotAct} onClick={()=>onAction("demigod","divinity-fear",{rollId})}>Conceder 1 Medo adicional</button></div>)}<small>Medo adicional já concedido por esta característica: {owned.fearGranted || 0}.</small></div>}
          {owned && definition.key==="shapeshifter" && <ShapeshifterChoices state={state} disabled={cannotAct||!resting} onAction={onAction} />}
          <div className="expansionFeatureRules">{features.map(feature=><section key={feature.id}><h3>{feature.name}</h3><p>{feature.description}</p></section>)}</div>
          {parent && <small>Transformação da expansão · {parent.originalName}</small>}
        </div>
      </details>;
    })}
  </div>;
}
