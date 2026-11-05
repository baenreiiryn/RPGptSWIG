"use client";
import { useMemo, useState } from "react";
import type { GameState } from "@/lib/game";
import {
  roles,
  entriesForEra,
  priceOf,
  entryArt,
  type CyberEntry,
  TYPE_LABELS,
  humanityLossOf,
} from "@/lib/cyberpunk/catalog";
import {
  BASIC_SKILLS,
  DEFAULT_STATS,
  STAT_KEYS,
  STAT_LABELS,
  validateBuild,
  skillCost,
  maxHitPoints,
} from "@/lib/cyberpunk/rules";
import {
  buildCyberCampaign,
  skillOptions,
  difficultSkills,
  suggestedCyberSkills,
  previewCyberCreation,
} from "@/lib/cyberpunk/state";
import {
  suggestedCyberStats,
  suggestedCyberEquipment,
  suggestedCyberware,
  startingBudget,
} from "@/lib/cyberpunk/creation";
import { QUICKHACKS } from "@/lib/cyberpunk/hacking";
import type { NewCampaignAiAdapter } from "./NewCampaignWizard";
import CyberpunkOriginEditor, {
  type CyberOrigin,
} from "./CyberpunkOriginEditor";
import type { CyberpunkEra, Stats } from "@/lib/cyberpunk/types";
const options = skillOptions();
export default function CyberpunkCampaignWizard({
  era,
  ai,
  onBack,
  onComplete,
}: {
  era: CyberpunkEra;
  ai: NewCampaignAiAdapter;
  onBack: () => void;
  onComplete: (g: GameState) => void;
}) {
  const [step, setStep] = useState(0),
    [campaignName, setCampaignName] = useState("Night City " + era),
    [name, setName] = useState(""),
    [role, setRole] = useState("Solo"),
    [stats, setStats] = useState<Stats>({ ...DEFAULT_STATS }),
    [skills, setSkills] = useState<Record<string, number>>(() =>
      Object.fromEntries(BASIC_SKILLS.map((k) => [k, 2])),
    ),
    [items, setItems] = useState<CyberEntry[]>([]),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState("weapon"),
    [origin, setOrigin] = useState<CyberOrigin>({
      history: "",
      image: "",
      appearance: "",
    }),
    [aiBusy, setAiBusy] = useState(false),
    [preferredQuickhacks, setPreferredQuickhacks] = useState<string[]>([
      "sonic",
      "short",
      "overheat",
      "reset",
    ]),
    [language, setLanguage] = useState("Português"),
    [hook, setHook] = useState(""),
    [tone, setTone] = useState("Neon noir"),
    [neuroport, setNeuroport] = useState(true),
    [error, setError] = useState("");
  const steps = [
    "Identidade",
    "Atributos",
    "Perícias",
    "Equipamento",
    "Cyberware",
    ...(era === 2077 && role === "Netrunner" ? ["Quickhacks"] : []),
    "História",
  ];
  const current = steps[step];
  const budget = startingBudget(items),
    cost = budget.total,
    fashion = budget.fashionCredit;
  const spent = skillCost(skills, difficultSkills),
    total = STAT_KEYS.reduce((n, k) => n + stats[k], 0);
  const { preview, previewError } = useMemo(() => {
    try {
      return {
        preview: previewCyberCreation({
          era,
          stats,
          role,
          skills,
          items: items.map((e) => e.id),
          neuroport,
        }),
        previewError: "",
      };
    } catch (e) {
      return { preview: undefined, previewError: (e as Error).message };
    }
  }, [era, stats, role, skills, items, neuroport]);
  const available = entriesForEra(era)
    .filter(
      (e) =>
        e.type === (current === "Cyberware" ? "cyberware" : kind) &&
        e.name !== "Neuroport (Free)" &&
        e.name.toLowerCase().includes(query.toLowerCase()),
    )
    .slice(0, 80);
  function suggest(cyber: boolean) {
    const chosen = cyber
      ? suggestedCyberware(role, era, neuroport)
      : suggestedCyberEquipment(role, era);
    const next = [
      ...items.filter((e) => (e.type === "cyberware") !== cyber),
      ...chosen,
    ];
    if (startingBudget(next).remaining < 0) {
      setError(
        "Sugestão excede o saldo atual. Remova outros itens para liberar orçamento.",
      );
      return;
    }
    setItems(next);
    setError("");
  }
  function advance() {
    setError("");
    if (step === 0 && (!name.trim() || !campaignName.trim()))
      return setError("Informe apelido e campanha.");
    if (
      step === 1 &&
      (total !== 62 || STAT_KEYS.some((k) => stats[k] < 2 || stats[k] > 8))
    )
      return setError("Distribua 62 pontos de atributos, entre 2 e 8.");
    if (step === 2) {
      const es = validateBuild(stats, skills, difficultSkills);
      if (es.length) return setError(es.join(" "));
    }
    if (step >= 3 && cost - fashion > 2550)
      return setError("Orçamento geral insuficiente.");
    if ((current === "Cyberware" || current === "História") && previewError)
      return setError(previewError);
    if (step < steps.length - 1) {
      setStep(step + 1);
      setQuery("");
      return;
    }
    try {
      onComplete(
        buildCyberCampaign({
          era,
          campaignName,
          name,
          role,
          stats,
          skills,
          items: items.map((e) => e.id),
          tone,
          hook,
          history: origin.history,
          image: origin.image,
          appearance: origin.appearance,
          preferredQuickhacks,
          nativeLanguage: language,
          neuroport,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <main className="cpShell cpWizard">
      <header className="cpSectionHeading">
        <div>
          <small>ORACLERPG // {era}</small>
          <h1>Crie seu Edgerunner.</h1>
        </div>
        <button onClick={onBack}>← Sistemas</button>
      </header>
      <nav className="cpSteps" aria-label="Etapas">
        {steps.map((s, i) => (
          <span key={s} aria-current={step === i ? "step" : undefined}>
            {String(i + 1).padStart(2, "0")} {s}
          </span>
        ))}
      </nav>
      {step === 0 && (
        <section className="cpPanel cpForm">
          <h2>Identidade na cidade</h2>
          <label>
            Campanha
            <input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </label>
          <label>
            Apelido
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Papel
            <select
              aria-label="Papel"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {roles.map((e) => (
                <option key={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
          <p>{roles.find((e) => e.name === role)?.description}</p>
          <small>
            Habilidade:{" "}
            {roles.find((e) => e.name === role)?.data.mainRoleAbility} · Rank
            inicial 4
          </small>
          <label>
            Tom
            <input value={tone} onChange={(e) => setTone(e.target.value)} />
          </label>
          {era === 2077 && (
            <label>
              <span>
                <input
                  type="checkbox"
                  checked={neuroport}
                  onChange={(e) => setNeuroport(e.target.checked)}
                />{" "}
                Neuroport instalado na infância, sem custo ou perda de
                Humanidade inicial (CEMK).
              </span>
            </label>
          )}
        </section>
      )}
      {step === 1 && (
        <section className="cpPanel">
          <h2>
            Atributos <em>{total}/62</em>
          </h2>
          <p>Pacote Completo: 2–8 por atributo. Sugestões são editáveis.</p>
          <button onClick={() => setStats(suggestedCyberStats(role))}>
            Aplicar atributos sugeridos para {role}
          </button>
          <div className="cpStatsGrid">
            {STAT_KEYS.map((k) => (
              <label key={k}>
                <b>{k.toUpperCase()}</b>
                <small>{STAT_LABELS[k]}</small>
                <input
                  aria-label={STAT_LABELS[k]}
                  type="number"
                  min={2}
                  max={8}
                  value={stats[k]}
                  onChange={(e) =>
                    setStats({ ...stats, [k]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <p>
            PV: {maxHitPoints(stats)} · Humanidade: {stats.emp * 10}
          </p>
        </section>
      )}
      {step === 2 && (
        <section className="cpPanel">
          <h2>
            Perícias <em>{spent}/86</em>
          </h2>
          <p>Máximo 6. Básicas (★) exigem 2. Perícias x2 custam o dobro.</p>
          <button onClick={() => setSkills(suggestedCyberSkills(role))}>
            Preencher sugestão para {role}
          </button>
          <label>
            Idioma nativo gratuito (nível 4)
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            />
          </label>
          <input
            placeholder="Filtrar perícias"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="cpSkillList">
            {options
              .filter((e) => e.name.toLowerCase().includes(query.toLowerCase()))
              .map((e) => (
                <label key={e.name}>
                  <span>
                    {BASIC_SKILLS.includes(e.name) ? "★ " : ""}
                    {e.name} {difficultSkills.has(e.name) ? "(x2)" : ""}
                    <small>{e.data.stat?.toUpperCase()}</small>
                  </span>
                  <input
                    aria-label={e.name}
                    type="number"
                    min={BASIC_SKILLS.includes(e.name) ? 2 : 0}
                    max={6}
                    value={skills[e.name] ?? 0}
                    onChange={(v) =>
                      setSkills({ ...skills, [e.name]: Number(v.target.value) })
                    }
                  />
                </label>
              ))}
          </div>
        </section>
      )}
      {(current === "Equipamento" || current === "Cyberware") && (
        <section className="cpPanel">
          <h2>
            {current} <em>{2550 + fashion - cost} €$</em>
          </h2>
          <p>
            2550 €$ gerais + 800 €$ exclusivos para vestuário/Fashionware.
            Crédito de moda não usado é perdido. As compras de equipamento e
            cyberware usam o mesmo saldo.
          </p>
          <div className="cpButtonRow">
            <button onClick={() => suggest(current === "Cyberware")}>
              Aplicar {current === "Cyberware" ? "cyberware" : "itens"}{" "}
              sugeridos para {role}
            </button>
          </div>
          <small>
            A sugestão substitui apenas os itens desta etapa; os demais são
            preservados.
          </small>
          {current === "Cyberware" && (
            <div className="cpStarterSummary">
              <img src="/cyberpunk/body-scan.webp" alt="Esquema de cyberware" />
              <div>
                <h3>Implantes iniciais</h3>
                <p>
                  Humanidade: {preview?.humanity ?? "—"} /{" "}
                  {preview?.maxHumanity ?? stats.emp * 10}. A criação usa a
                  perda fixa da ficha de cada implante. Bases e opções são
                  instaladas ao iniciar.
                </p>
                {era === 2077 && neuroport && (
                  <p>Neuroport de infância instalado · 0 €$ · HL 0.</p>
                )}
                {previewError && <p className="cpError">{previewError}</p>}
                {preview?.inventory
                  .filter((i) => i.installed && i.name !== "Neuroport (Free)")
                  .map((i) => (
                    <p key={i.id}>
                      {i.name} · instalado{" "}
                      {i.parentId
                        ? "em " +
                          preview?.inventory.find((p) => p.id === i.parentId)
                            ?.name
                        : ""}
                    </p>
                  ))}
                <p>Crédito de moda restante: {budget.fashionRemaining} €$.</p>
              </div>
            </div>
          )}
          <div className="cpFilters">
            {current !== "Cyberware" && (
              <select
                aria-label="Categoria de equipamento"
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setQuery("");
                }}
              >
                {[
                  "weapon",
                  "armor",
                  "cyberdeck",
                  "gear",
                  "ammo",
                  "program",
                  "clothing",
                ].map((k) => (
                  <option key={k} value={k}>
                    {TYPE_LABELS[k] ?? k}
                  </option>
                ))}
              </select>
            )}
            <input
              placeholder={
                current === "Cyberware"
                  ? "Buscar cyberware"
                  : "Buscar equipamento"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="cpLoadout">
            {items
              .map((e, i) => ({ e, i }))
              .filter(
                ({ e }) =>
                  (e.type === "cyberware") === (current === "Cyberware"),
              )
              .map(({ e, i }) => (
                <button
                  key={i}
                  onClick={() => setItems(items.filter((_, j) => j !== i))}
                >
                  {e.name} · {priceOf(e)} €$ ×
                </button>
              ))}
          </div>
          <div className="cpCatalogGrid">
            {available.map((e) => (
              <button
                className="cpItemCard"
                key={e.id}
                disabled={startingBudget([...items, e]).remaining < 0}
                onClick={() => setItems([...items, e])}
              >
                {entryArt(e) && <img src={entryArt(e)} alt="" />}
                <b>{e.name}</b>
                <span>
                  {priceOf(e)} €${" "}
                  {current === "Cyberware" ? `· HL ${humanityLossOf(e)}` : ""}
                </span>
                {current === "Cyberware" && (
                  <small>
                    {e.data.isFoundational ? "Base" : "Opção / implante"} ·{" "}
                    {e.data.type}
                  </small>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
      {current === "Quickhacks" && (
        <section className="cpPanel">
          <h2>Quickhacks do Netrunner</h2>
          <p>
            Interface 4 libera todos os quickhacks abaixo no Mission Kit.
            Escolha os preferidos para destacar na aba NET; não custam dinheiro
            nem ocupam slots de programas.
          </p>
          <p>
            Cyberdeck:{" "}
            {preview?.inventory.find((i) => i.type === "cyberdeck")?.name ??
              "nenhum comprado"}
            . Neuroport Cyberdeck Port:{" "}
            {preview?.inventory.some(
              (i) => i.name === "Neuroport Cyberdeck Port" && i.installed,
            )
              ? "instalado"
              : "não instalado"}
            .
          </p>
          <button
            onClick={() =>
              setPreferredQuickhacks(["sonic", "short", "overheat", "reset"])
            }
          >
            Aplicar quickhacks sugeridos
          </button>
          <div className="cpCatalogGrid">
            {QUICKHACKS.map((h) => (
              <label className="cpPanel cpQuickChoice" key={h.id}>
                <span>
                  <input
                    aria-label={h.name}
                    type="checkbox"
                    checked={preferredQuickhacks.includes(h.id)}
                    onChange={(e) =>
                      setPreferredQuickhacks(
                        e.target.checked
                          ? [...preferredQuickhacks, h.id]
                          : preferredQuickhacks.filter((id) => id !== h.id),
                      )
                    }
                  />
                  {h.name}
                </span>
                <small>
                  DV {h.dv} · Interface {h.rank} · sem custo de compra
                </small>
                <p>{h.description}</p>
              </label>
            ))}
          </div>
        </section>
      )}
      {current === "História" && (
        <section className="cpPanel cpForm">
          <h2>Seu passado cobra um preço.</h2>
          <label>
            Gancho da campanha
            <textarea
              rows={3}
              value={hook}
              onChange={(e) => setHook(e.target.value)}
            />
          </label>
          <CyberpunkOriginEditor
            ai={ai}
            era={era}
            name={name}
            role={role}
            tone={tone}
            hook={hook}
            value={origin}
            onChange={setOrigin}
            onBusy={setAiBusy}
          />
          <p>
            {name} · {role} 4 · {era} · {maxHitPoints(stats)} PV ·{" "}
            {budget.remaining} €$
          </p>
        </section>
      )}
      {error && (
        <p className="cpError" role="alert">
          {error}
        </p>
      )}
      <footer className="cpWizardFooter">
        <button
          disabled={step === 0 || aiBusy}
          onClick={() => {
            setStep(step - 1);
            setQuery("");
          }}
        >
          ← Anterior
        </button>
        <button className="cpPrimary" onClick={advance} disabled={aiBusy}>
          {step === steps.length - 1 ? "INICIAR CAMPANHA" : "Continuar →"}
        </button>
      </footer>
    </main>
  );
}
