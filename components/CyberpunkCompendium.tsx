"use client";
import { useEffect, useMemo, useState } from "react";
import {
  entriesForEra,
  TYPE_LABELS,
  entryArt,
  priceOf,
  type CyberEntry,
} from "@/lib/cyberpunk/catalog";
import type { CyberpunkEra } from "@/lib/cyberpunk/types";
export default function CyberpunkCompendium({
  era,
  onBack,
  onNpcChoose,
}: {
  era: CyberpunkEra;
  onBack?: () => void;
  onNpcChoose?: (e: CyberEntry) => void;
}) {
  const [query, setQuery] = useState(""),
    [type, setType] = useState(""),
    [source, setSource] = useState(""),
    [limit, setLimit] = useState(60),
    [selected, setSelected] = useState<CyberEntry | null>(null);
  const list = useMemo(
    () =>
      entriesForEra(era).filter(
        (e) =>
          (!type || e.type === type) &&
          (!source || e.source.book === source) &&
          `${e.name} ${e.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [era, type, source, query],
  );
  useEffect(() => {
    if (!selected) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected]);
  return (
    <section className="cpCompendium">
      <header className="cpSectionHeading">
        <div>
          <small>ARQUIVO DE DADOS // {era}</small>
          <h1>Compêndio Cyberpunk</h1>
          <p>
            {list.length} registros ·{" "}
            {era === 2077
              ? "Base RED + Edgerunners Mission Kit"
              : "RED e suplementos do arquivo"}
          </p>
        </div>
        {onBack && <button onClick={onBack}>← Voltar</button>}
      </header>
      <div className="cpFilters">
        <input
          aria-label="Buscar no compêndio Cyberpunk"
          placeholder="Pesquisar equipamento, cyberware, regras…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(60);
          }}
        />
        <select
          aria-label="Categoria"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setLimit(60);
          }}
        >
          <option value="">Todas as categorias</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Livro de origem"
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            setLimit(60);
          }}
        >
          <option value="">Todas as fontes</option>
          {[
            ...new Set(
              entriesForEra(era)
                .map((e) => e.source.book)
                .filter(Boolean),
            ),
          ]
            .sort()
            .map((s) => (
              <option key={s}>{s}</option>
            ))}
        </select>
      </div>
      <div className="cpCatalogGrid">
        {list.slice(0, limit).map((e) => (
          <button
            key={e.id}
            className="cpItemCard"
            onClick={() => setSelected(e)}
          >
            {entryArt(e) ? (
              <img src={entryArt(e)} alt="" loading="lazy" />
            ) : (
              <span className="cpItemGlyph">
                {e.type === "weapon" ? "⌖" : e.type === "npc" ? "◉" : "◇"}
              </span>
            )}
            <small>
              {TYPE_LABELS[e.type]} · {e.era === 2077 ? "CEMK" : "RED"}
            </small>
            <b>{e.name}</b>
            <span>{priceOf(e) > 0 ? `${priceOf(e)} €$` : "—"}</span>
          </button>
        ))}
      </div>
      {limit < list.length && (
        <button onClick={() => setLimit(limit + 60)}>Carregar mais</button>
      )}
      {!list.length && <p>Nenhum registro encontrado.</p>}
      {selected && (
        <div className="cpModalBackdrop" onClick={() => setSelected(null)}>
          <section
            className="cpModal"
            role="dialog"
            aria-modal="true"
            aria-label={selected.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="cpClose"
              autoFocus
              onClick={() => setSelected(null)}
            >
              Fechar ×
            </button>
            <small>
              {TYPE_LABELS[selected.type]} · {selected.era}
            </small>
            <h2>{selected.name}</h2>
            {entryArt(selected) && (
              <img className="cpDetailArt" src={entryArt(selected)} alt="" />
            )}
            <p>
              {selected.description ||
                "Consulte as propriedades e a fonte deste registro."}
            </p>
            <dl>
              {[
                ["Preço", priceOf(selected) + " €$"],
                ["Dano", selected.data.damage],
                ["Perícia", selected.data.weaponSkill],
                ["Cadência", selected.data.rof],
                ["Perda de Humanidade", selected.data.humanityLoss?.static],
                ["Slots", selected.data.installedItems?.slots],
                ["Habilidade de papel", selected.data.mainRoleAbility],
              ]
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => (
                  <div key={String(k)}>
                    <dt>{k}</dt>
                    <dd>{String(v)}</dd>
                  </div>
                ))}
            </dl>
            {selected.type === "npc" && (
              <pre className="cpNpcStats">
                {Object.entries(
                  (selected.data.npcStats ?? {}) as Record<
                    string,
                    { value: number }
                  >,
                )
                  .map(([key, value]) => `${key.toUpperCase()}: ${value.value}`)
                  .join(" · ")}
              </pre>
            )}
            <small>
              Fonte: {selected.source.book || "Mundo Foundry"}
              {selected.source.page ? ` · p. ${selected.source.page}` : ""}
            </small>
            {selected.type === "npc" && onNpcChoose && (
              <button
                className="cpPrimary"
                onClick={() => {
                  onNpcChoose(selected);
                  setSelected(null);
                }}
              >
                Adicionar aos contatos da campanha
              </button>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
