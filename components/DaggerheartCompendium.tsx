"use client";

import { useMemo, useState } from "react";
import CompendiumArt, { compendiumGlyph } from "@/components/CompendiumArt";
import EquipmentArt from "@/components/EquipmentArt";
import { equipmentRarityLabel } from "@/lib/equipmentRarity";
import { buildCompendiumSections, type CompendiumSection } from "@/lib/compendium/grouping";
import {
  daggerheartCompendium,
  entryTypeLabel,
  mechanicsSummary,
  subclassFeatureTierLabel,
  type CompendiumEntry,
} from "@/lib/compendium/daggerheart";

type Props = {
  onBack: () => void;
};

const TYPE_ORDER: Record<string, number> = {
  rule: 0,
  trait: 1,
  range: 2,
  condition: 3,
  deathMove: 4,
  class: 0,
  ancestry: 0,
  community: 0,
  subclass: 0,
  adversary: 0,
  classFeature: 1,
  ancestryFeature: 1,
  communityFeature: 1,
  subclassFeature: 1,
  domainCard: 0,
  transformation: 0,
  transformationFeature: 1,
  weapon: 0,
  armor: 1,
  consumable: 2,
  loot: 3,
};

const SUBCLASS_TIER_ORDER: Record<string, number> = {
  foundation: 0,
  specialization: 1,
  mastery: 2,
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function shortDescription(value: string, max = 170) {
  if (value.length <= max) return value;
  const sliced = value.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  return sliced.slice(0, lastSpace > 100 ? lastSpace : max) + "…";
}

function Mechanics({ entry, expanded = false }: { entry: CompendiumEntry; expanded?: boolean }) {
  const items = mechanicsSummary(entry);
  if (!items.length) return null;
  const visible = expanded ? items : items.slice(0, 4);
  return (
    <div className={"compMechanics" + (expanded ? " expanded" : "")}>
      {visible.map((item, index) => (
        <span className={"mechanicChip " + item.kind} key={item.kind + item.label + index}>
          {item.kind === "cost" ? "◆" : item.kind === "damage" ? "✦" : item.kind === "test" ? "◇" : item.kind === "difficulty" ? "◎" : item.kind === "range" ? "⌁" : "◷"}
          {item.label}
        </span>
      ))}
    </div>
  );
}

function EntryCard({ entry, onOpen, compact = false }: { entry: CompendiumEntry; onOpen: () => void; compact?: boolean }) {
  const glyph = compendiumGlyph(entry);
  return (
    <button className={["compEntryCard", entry.art || entry.category === "equipment" ? "withArt" : "", compact ? "compEntryCardChild" : ""].filter(Boolean).join(" ")} onClick={onOpen}>
      {entry.category === "equipment" ? (
        <div className="compEntryArt"><EquipmentArt item={entry} className="compEntryArtImage equipmentIconArt" /></div>
      ) : entry.art ? (
        <div className="compEntryArt">
          <CompendiumArt
            entry={entry}
            alt=""
            className={"compEntryArtImage" + (entry.category === "domains" ? " domainIconArt" : "")}
            fallback={<div className="compEntryArtFallback">{glyph}</div>}
          />
        </div>
      ) : (
        <div className="compEntryGlyph">{glyph}</div>
      )}
      <div className="compEntryBody">
        <div className="compEntryMeta">
          <span>{entryTypeLabel(entry.type)}</span>
          {entry.rarity && <em className="rarityBadge" data-rarity={entry.rarity}>{equipmentRarityLabel(entry.rarity)}</em>}
          {entry.type === "beastform" && <em>Patamar {entry.beastformTier}</em>}
          {entry.type === "subclassFeature" && entry.tier && <em>{subclassFeatureTierLabel(entry.tier)}</em>}
          {entry.source === "expansion" && <em>Expansão</em>}
          {entry.source === "void-unofficial" && <em>The Void</em>}
        </div>
        <h3>{entry.name}</h3>
        {entry.equipmentDetail && <p className="equipmentStats">{entry.equipmentDetail}</p>}
        <p>{shortDescription(entry.description || entry.motivesAndTactics || (entry.equipmentDetail ? "Equipamento sem característica adicional." : "Sem descrição."), compact ? 120 : 170)}</p>
        <Mechanics entry={entry} />
      </div>
      <b className="compEntryArrow">›</b>
    </button>
  );
}

function SectionEntries({ section, onOpen }: { section: CompendiumSection; onOpen: (entry: CompendiumEntry) => void }) {
  if (section.kind === "equipment") {
    return <div className="compEquipmentList">{section.rarities.map(({rarity, entries}) => (
      <section className="compEquipmentGroup" data-rarity={rarity} aria-label={equipmentRarityLabel(rarity)} key={rarity}>
        <header><small>RARIDADE</small><h2>{equipmentRarityLabel(rarity)}<span>{entries.length} equipamentos</span></h2></header>
        <div className="compEntryGrid">{entries.map((entry) => <EntryCard entry={entry} onOpen={() => onOpen(entry)} key={entry.id} />)}</div>
      </section>
    ))}</div>;
  }
  if (section.kind === "families") {
    return (
      <div className="compFamilyList">
        {section.families.map(({ parent, children }) => (
          <section className="compFamilyGroup" aria-label={parent.name} key={parent.id}>
            <EntryCard entry={parent} onOpen={() => onOpen(parent)} />
            {children.length > 0 && (
              <ul className="compFamilyChildren" aria-label={"Características de " + parent.name}>
                {children.map((entry) => (
                  <li key={entry.id}><EntryCard entry={entry} compact onOpen={() => onOpen(entry)} /></li>
                ))}
              </ul>
            )}
          </section>
        ))}
        {section.ungrouped.length > 0 && (
          <div className="compEntryGrid">
            {section.ungrouped.map((entry) => <EntryCard entry={entry} onOpen={() => onOpen(entry)} key={entry.id} />)}
          </div>
        )}
      </div>
    );
  }

  if (section.kind === "domains") {
    return (
      <div className="compDomainList">
        {section.domains.map((domain) => (
          <section className="compDomainGroup" aria-label={"Domínio " + domain.name} key={domain.id}>
            <header className="compDomainHeader"><small>DOMÍNIO</small><h2>{domain.name}</h2></header>
            {domain.levels.map(({ level, entries }) => (
              <section className="compDomainLevel" aria-label={level === null ? "Sem nível" : "Nível " + level} key={level ?? "none"}>
                <h3>{level === null ? "Sem nível" : "Nível " + level}<span>{entries.length} {entries.length === 1 ? "carta" : "cartas"}</span></h3>
                <div className="compEntryGrid">
                  {entries.map((entry) => <EntryCard entry={entry} onOpen={() => onOpen(entry)} key={entry.id} />)}
                </div>
              </section>
            ))}
          </section>
        ))}
      </div>
    );
  }

  if (section.kind === "beastforms") {
    return (
      <div className="compDomainList">
        {section.tiers.map(({ tier, entries }) => (
          <section className="compDomainLevel" aria-label={"Patamar " + tier} key={tier}>
            <h3>Patamar {tier}<span>{entries.length} formas</span></h3>
            <div className="compEntryGrid">
              {entries.map((entry) => <EntryCard entry={entry} onOpen={() => onOpen(entry)} key={entry.id} />)}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="compEntryGrid">
      {section.entries.map((entry) => <EntryCard entry={entry} onOpen={() => onOpen(entry)} key={entry.id} />)}
    </div>
  );
}

function EntryDetail({
  entry,
  related,
  onClose,
  onOpen,
}: {
  entry: CompendiumEntry;
  related: CompendiumEntry[];
  onClose: () => void;
  onOpen: (entry: CompendiumEntry) => void;
}) {
  const paragraphs = (entry.description || "").split(/\n{2,}/).filter(Boolean);
  const glyph = compendiumGlyph(entry);
  return (
    <div className="compDetailBackdrop" onClick={onClose}>
      <article className="compDetail" onClick={(event) => event.stopPropagation()}>
        <button className="compDetailClose" onClick={onClose}>×</button>
        {entry.art && (
          <div className="compDetailHero">
            <CompendiumArt
              entry={entry}
              className={"compDetailHeroImage" + (entry.category === "domains" ? " domainIconArt" : "")}
              fallback={<div className="compDetailArtFallback">{glyph}</div>}
              loading="eager"
            />
          </div>
        )}
        <div className="compDetailContent">
          <div className="compDetailMeta">
            <span>{entryTypeLabel(entry.type)}</span>
            {entry.rarity && <i className="rarityBadge" data-rarity={entry.rarity}>{equipmentRarityLabel(entry.rarity)}</i>}
            {entry.type === "subclassFeature" && entry.tier && <i>{subclassFeatureTierLabel(entry.tier)}</i>}
            <i>{entry.source === "expansion" ? "Conteúdo de expansão" : entry.source === "void-unofficial" ? "The Void · conteúdo não oficial" : entry.source === "srd2" ? "SRD 2.0" : entry.source === "srd" ? "SRD" : "Daggerheart"}</i>
            {entry.artSource?.includes("Foundryborne/daggerheart") && <i>Arte de domínio · Foundryborne · DPCGL</i>}
          </div>
          <h2>{entry.name}</h2>
          {entry.originalName && entry.originalName !== entry.name && <small className="compOriginalName">{entry.originalName}</small>}
          <Mechanics entry={entry} expanded />
          {entry.equipmentDetail && <p className="equipmentStats equipmentStatsDetail">{entry.equipmentDetail}</p>}
          {entry.creationRestricted && <p className="equipmentRestriction">{entry.creationRestricted}</p>}
          {entry.motivesAndTactics && (
            <div className="compTactics">
              <small>MOTIVAÇÕES E TÁTICAS</small>
              <p>{entry.motivesAndTactics}</p>
            </div>
          )}
          <div className="compDescription">
            {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </div>
          {!!related.length && (
            <section className="compRelated">
              <small>CONTEÚDO RELACIONADO</small>
              <div>
                {related.map((item) => (
                  <button onClick={() => onOpen(item)} key={item.id}>
                    <span className="compRelatedVisual">
                      <CompendiumArt entry={item} className={"compRelatedArt" + (item.category === "domains" ? " domainIconArt" : "")} fallback={compendiumGlyph(item)} />
                    </span>
                    <div><strong>{item.name}</strong><small>{shortDescription(item.description, 85)}</small></div>
                    <b>›</b>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </article>
    </div>
  );
}

export default function DaggerheartCompendium({ onBack }: Props) {
  const [category, setCategory] = useState("rules");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(
    () => daggerheartCompendium.entries.find((entry) => entry.id === selectedId) || null,
    [selectedId],
  );
  const related = useMemo(
    () => selected?.sourceId
      ? daggerheartCompendium.entries
          .filter((entry) => entry.parent === selected.sourceId)
          .sort((a, b) => {
            const tier = (SUBCLASS_TIER_ORDER[a.tier || ""] ?? 99) - (SUBCLASS_TIER_ORDER[b.tier || ""] ?? 99);
            return tier || a.name.localeCompare(b.name, "pt-BR");
          })
      : [],
    [selected],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of daggerheartCompendium.entries) {
      map.set(entry.category, (map.get(entry.category) || 0) + 1);
    }
    return map;
  }, []);

  const filtered = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    return daggerheartCompendium.entries
      .filter((entry) => {
        if (category !== "all" && entry.category !== category) return false;
        if (!normalizedQuery) return true;
        const haystack = normalize([
          entry.name,
          entry.originalName || "",
          entry.description,
          entry.motivesAndTactics || "",
          entryTypeLabel(entry.type),
          entry.type === "subclassFeature" ? subclassFeatureTierLabel(entry.tier) : "",
          entry.domain || "",
          entry.equipmentDetail || "",
          entry.rarity ? equipmentRarityLabel(entry.rarity) : "",
          entry.beastformTier ? "Patamar " + entry.beastformTier : "",
          entry.type === "domainCard" && entry.level !== undefined ? "Nível " + entry.level : "",
        ].join(" "));
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        const type = (TYPE_ORDER[a.type] || 0) - (TYPE_ORDER[b.type] || 0);
        return type || a.name.localeCompare(b.name, "pt-BR");
      });
  }, [category, query]);

  const sections = useMemo(() => buildCompendiumSections(
    daggerheartCompendium.entries,
    filtered,
    daggerheartCompendium.categories.map((item) => item.id),
  ), [filtered]);

  const activeCategory = daggerheartCompendium.categories.find((item) => item.id === category);

  return (
    <main className="appShell compendiumShell">
      <div className="ambient ambientOne" />
      <div className="ambient ambientTwo" />
      <header className="menuPageHeader compendiumHeader">
        <button className="backButton" onClick={onBack}>‹</button>
        <div><small>DAGGERHEART</small><strong>Compêndio</strong></div>
        <span className="compendiumCount">{daggerheartCompendium.entries.length} entradas</span>
      </header>

      <section className="compendiumLayout">
        <aside className="compendiumCategories">
          <div className="compendiumSource">
            <div className="compendiumSourceSigil">◇</div>
            <div><small>SISTEMA</small><strong>Daggerheart</strong><span>PT-BR · SRD</span></div>
          </div>
          <button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>
            <b>⌕</b><span><strong>Todos</strong><small>{daggerheartCompendium.entries.length}</small></span>
          </button>
          {daggerheartCompendium.categories.map((item) => (
            <button className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)} key={item.id}>
              <b>{item.icon}</b><span><strong>{item.name}</strong><small>{counts.get(item.id) || 0}</small></span>
            </button>
          ))}
          <div className="compendiumCredits">
            <small>FONTES</small>
            <p>Tradução PT-BR não oficial do SRD. Artes de adversários sob CC0. Ícones de dez domínios via Foundryborne sob DPCGL; Blood criado para o OracleRPG.</p>
          </div>
        </aside>

        <section className="compendiumContent">
          <div className="compendiumTitleRow">
            <div>
              <small>REFERÊNCIA RÁPIDA</small>
              <h1>{category === "all" ? "Todo o compêndio" : activeCategory?.name}</h1>
              <p>{category === "all" ? "Pesquise regras, características, cartas, equipamentos e adversários." : activeCategory?.description}</p>
            </div>
          </div>

          <label className="compendiumSearch">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, regra, recurso ou efeito…" />
            {query && <button onClick={() => setQuery("")}>×</button>}
          </label>

          <div className="compendiumMobileCategories">
            <button className={category === "all" ? "active" : ""} onClick={() => setCategory("all")}>Todos</button>
            {daggerheartCompendium.categories.map((item) => (
              <button className={category === item.id ? "active" : ""} onClick={() => setCategory(item.id)} key={item.id}>{item.name}</button>
            ))}
          </div>

          <div className="compendiumResultBar">
            <span>{filtered.length} {filtered.length === 1 ? "resultado" : "resultados"}</span>
            {query && <small>para “{query}”</small>}
          </div>

          <div className="compendiumEntries organized">
            {sections.map((section) => (
              <section className="compSection" key={section.category}>
                {category === "all" && <h2 className="compSectionTitle">{daggerheartCompendium.categories.find((item) => item.id === section.category)?.name || section.category}</h2>}
                <SectionEntries section={section} onOpen={(entry) => setSelectedId(entry.id)} />
              </section>
            ))}
            {!filtered.length && (
              <div className="compendiumEmpty"><b>◇</b><h3>Nada encontrado</h3><p>Tente outro termo ou escolha uma categoria diferente.</p></div>
            )}
          </div>
        </section>
      </section>

      {selected && (
        <EntryDetail
          entry={selected}
          related={related}
          onClose={() => setSelectedId(null)}
          onOpen={(entry) => setSelectedId(entry.id)}
        />
      )}
    </main>
  );
}
