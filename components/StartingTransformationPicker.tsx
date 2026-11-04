"use client";

import CompendiumArt from "@/components/CompendiumArt";
import { daggerheartCompendium } from "@/lib/compendium/daggerheart";
import { EXPANSION_TRANSFORMATIONS, type ExpansionTransformationKey } from "@/lib/expansionTransformations";

export default function StartingTransformationPicker({ value, onChange }: {
  value?: ExpansionTransformationKey;
  onChange: (key?: ExpansionTransformationKey) => void;
}) {
  const selected = daggerheartCompendium.entries.find(entry => entry.type === "transformation" && entry.transformationKey === value);
  const features = selected ? daggerheartCompendium.entries.filter(entry => entry.type === "transformationFeature" && entry.parent === selected.sourceId) : [];
  return <section className="startingTransformationPicker" aria-labelledby="starting-transformation-title">
    <div className="campaignWizardSectionTitle"><small>EXPANSÃO · OPCIONAL</small><strong id="starting-transformation-title">Transformação inicial</strong></div>
    <p>Você pode começar com uma transformação. Ela se soma à sua ancestralidade e inclui os benefícios e custos abaixo.</p>
    <div className="startingTransformationChoices" role="group" aria-label="Transformação inicial">
      <button type="button" aria-pressed={!value} className={!value ? "selected" : ""} onClick={() => onChange(undefined)}><span aria-hidden="true">◇</span><strong>Nenhuma</strong><small>Sem transformação inicial</small></button>
      {EXPANSION_TRANSFORMATIONS.map(definition => {
        const entry = daggerheartCompendium.entries.find(item => item.type === "transformation" && item.transformationKey === definition.key);
        return <button type="button" key={definition.key} aria-pressed={value === definition.key} className={value === definition.key ? "selected" : ""} onClick={() => onChange(definition.key)}><CompendiumArt entry={entry} alt="" fallback={<span aria-hidden="true">{definition.glyph}</span>} /><strong>{definition.name}</strong><small>Expansão</small></button>;
      })}
    </div>
    {selected && <div className="startingTransformationRules" aria-live="polite"><h2>{selected.name}</h2>{features.map(feature => <section key={feature.id}><h3>{feature.name}</h3><p>{feature.description}</p></section>)}{value === "ghost" && <p className="expansionPermanentHp">Você começa com 1 PV permanentemente marcado e marca outro a cada novo Patamar.</p>}{value === "vampire" && <p>Você começa sem marcadores de Alimentar-se e, por isso, com desvantagem em testes de ação e reação até se alimentar.</p>}</div>}
  </section>;
}
