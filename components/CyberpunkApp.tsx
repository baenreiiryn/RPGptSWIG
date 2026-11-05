"use client";
import { useEffect, useRef, useState } from "react";
import type { GameState, Message } from "@/lib/game";
import type { NewCampaignAiAdapter } from "./NewCampaignWizard";
import type { CyberPendingRoll, CyberpunkState } from "@/lib/cyberpunk/types";
import {
  makeCyberRoll,
  resolveCyberCheck,
  cyberDate,
} from "@/lib/cyberpunk/rules";
import { withCyberState, installCyberware } from "@/lib/cyberpunk/state";
import { finishHack } from "@/lib/cyberpunk/hacking";
import { runCyberTurn } from "@/lib/cyberpunk/gm";
import { visualCyberRoll } from "@/lib/cyberpunk/diceFaces";
import { cyberpunkDiceAppearances } from "@/lib/edgerunnersDice";
import type { DiceAppearanceOverrides, DiceRollResult } from "@/lib/dice";
import DiceOverlay from "./DiceOverlay";
import CyberpunkCharacter from "./CyberpunkCharacter";
import CyberpunkNetPanel from "./CyberpunkNetPanel";
import CyberpunkCompendium from "./CyberpunkCompendium";
import NightCityMemory from "./NightCityMemory";
import CyberpunkCalendar from "./CyberpunkCalendar";
type View = "session" | "character" | "net" | "world" | "memory" | "compendium" | "calendar";
function append(g: GameState, role: Message["role"], text: string): GameState {
  return {
    ...g,
    messages: [
      ...g.messages,
      {
        id: crypto.randomUUID(),
        role,
        text,
        createdAt: new Date().toISOString(),
        campaignMinute: g.time.campaignMinute,
      },
    ],
  };
}
export default function CyberpunkApp({
  state,
  onChange,
  onHome,
  onSettings,
  ai,
  cloudLabel,
  diceAppearances,
}: {
  state: GameState;
  onChange: (g: GameState) => void;
  onHome: () => void;
  onSettings: () => void;
  ai: NewCampaignAiAdapter;
  cloudLabel: string;
  diceAppearances?: DiceAppearanceOverrides;
}) {
  const cp = state.cyberpunk!;
  const [view, setView] = useState<View>("session"),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [roll, setRoll] = useState<DiceRollResult | null>(null),
    [tray, setTray] = useState(false),
    [count, setCount] = useState(1),
    [sides, setSides] = useState<6 | 10>(10),
    [modifier, setModifier] = useState(0),
    [luck, setLuck] = useState(0),
    [npcName, setNpcName] = useState(""),
    [npcRole, setNpcRole] = useState(""),
    [questTitle, setQuestTitle] = useState(""),
    [questStage, setQuestStage] = useState("");
  const current = useRef(state),
    alive = useRef(true),
    running = useRef(false),
    opening = useRef(false),
    bottom = useRef<HTMLDivElement>(null),
    trayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [state.messages.length, busy, view]);
  useEffect(() => {
    if (!tray) return;
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !trayRef.current?.contains(e.target))
        setTray(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTray(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [tray]);
  function publish(g: GameState) {
    current.current = g;
    if (alive.current) onChange(g);
  }
  async function turn(text: string, g = current.current) {
    if (running.current) return;
    if (!ai.connected || !ai.model) {
      setError("Conecte o ChatGPT e selecione um modelo para continuar.");
      return;
    }
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await runCyberTurn(
        g,
        text,
        ai.respond,
        ai.model,
        publish,
        () => alive.current,
      );
      if (alive.current) publish(append(result.state, "gm", result.text));
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      running.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !opening.current &&
      ai.connected &&
      ai.model &&
      state.messages.length === 0 &&
      !cp.recovery
    ) {
      opening.current = true;
      void turn(
        "Inicie a campanha com uma cena jogável no local atual. Apresente uma situação e aguarde a ação do jogador.",
      );
    }
  }, [ai.connected, ai.model]);
  function request(p: CyberPendingRoll) {
    if (busy || cp.pending || cp.dead) return;
    setLuck(0);
    publish(
      withCyberState(current.current, {
        ...current.current.cyberpunk!,
        pending: p,
      }),
    );
    setView("session");
  }
  function resolve(p: CyberPendingRoll) {
    if (running.current) return;
    try {
      const g = current.current,
        s = g.cyberpunk!;
      if (s.pending?.id !== p.id && p.kind !== "custom") return;
      let pending = { ...p };
      const usedLuck = ["skill", "interface"].includes(p.kind)
        ? Math.min(s.luck, Math.max(0, luck))
        : 0;
      pending.modifier = (pending.modifier ?? 0) + usedLuck;
      let defense = "";
      if (pending.netAction === "jack") {
        const target = s.net.targets.find((t) => t.id === pending.targetId)!;
        const d = resolveCyberCheck(target.will);
        pending.target = d.total;
        defense = ` Defesa WILL do alvo: ${d.dice.join(", ")} + ${target.will} = ${d.total}.`;
      }
      const result = makeCyberRoll(s, pending, g.time.campaignMinute);
      let next: CyberpunkState = {
        ...s,
        pending: undefined,
        luck: s.luck - usedLuck,
        rolls: [...s.rolls, result],
      };
      next = finishHack(next, pending, result, g.time.campaignMinute);
      if (p.kind === "humanity")
        next = installCyberware(next, p.itemId!, p.parentId, result.total);
      if (p.kind === "death")
        next = {
          ...next,
          dead: result.success === false,
          deathPenalty: next.deathPenalty + (result.success ? 1 : 0),
        };
      const diceText = result.dice.join(
          ["skill", "interface"].includes(result.kind) && result.dice[0] === 1
            ? " − "
            : " + ",
        ),
        note = `${p.label}: [${diceText}] ${result.modifier >= 0 ? "+" : ""}${result.modifier} = ${result.total}${result.target === undefined ? "" : ` vs DV${result.target}: ${result.success ? "SUCESSO" : "FALHA"}`}${p.kind === "death" ? (result.success ? " · sobrevive este turno" : " · morte") : ""}${result.critical ? " · FERIMENTO CRÍTICO" : ""}.${defense}`;
      const nextGame = append(withCyberState(g, next), "system", note);
      publish(nextGame);
      setRoll(visualCyberRoll(result));
      setLuck(0);
      setTray(false);
      if (p.kind !== "custom")
        void turn(
          "Resultado confirmado pelo motor: " +
            note +
            " Resolva a ação usando este resultado, aplique somente efeitos que faltam e continue a narração. Não repita esta rolagem.",
          nextGame,
        );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function submit() {
    const text = input.trim();
    if (!text || busy || cp.pending || cp.recovery) return;
    const next = append(current.current, "player", text);
    publish(next);
    setInput("");
    void turn(text, next);
  }
  const place = cp.places.find((p) => p.id === cp.locationId);
  return (
    <main className={`cpShell cpApp cpView-${view}`}>
      <header className="cpTopbar">
        <button className="cpBrand" onClick={onHome}>
          ORACLE<span> // {cp.era}</span>
        </button>
        <div className="cpCampaignTitle">
          <b>{state.campaign.name}</b>
          <small>
            {place?.name} · {cp.calendarInitialized === false ? `${cp.era} · Data a definir pelo Mestre` : cyberDate(cp.era, state.time.campaignMinute, state.time.calendar)}
          </small>
        </div>
        <div className="cpButtonRow">
          <button title="Abrir calendário e clima" aria-label="Abrir calendário e clima" onClick={() => setView("calendar")}>
            ◷ <span className="cpHideMobile">{state.time.weather.label}{state.time.weather.temperatureC !== undefined ? ` · ${state.time.weather.temperatureC} °C` : ""}</span>
          </button>
          <button title={`Nuvem: ${cloudLabel}`} onClick={onSettings}>
            ☁ <span className="cpHideMobile">{cloudLabel}</span>
          </button>
          <button
            aria-label="Conectar ChatGPT"
            className={ai.connected ? "connected" : ""}
            onClick={() => void ai.onConnect()}
          >
            {ai.connected ? "GPT ●" : "GPT ○"}
          </button>
        </div>
      </header>
      <nav className="cpNav" aria-label="Navegação da campanha">
        {(
          [
            ["session", "Sessão"],
            ["character", "Personagem"],
            ["net", "NET"],
            ["world", "Mundo"],
            ["memory", "Memória / Mapa"],
            ["calendar", "Calendário"],
            ["compendium", "Compêndio"],
          ] as [View, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <div role="alert" className="cpError">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {view === "session" && (
        <section className="cpSession">
          <div className="cpChat">
            <div className="cpChatBackdrop" />
            <header className="cpSceneHeading">
              <small>CANAL SEGURO // {cp.role.toUpperCase()}</small>
              <h1>{place?.name}</h1>
              <span>{state.campaign.system}</span>
            </header>
            <div className="cpMessages" role="log" aria-live="polite">
              {state.messages.map((m) => (
                <article key={m.id} className={`cpMessage ${m.role}`}>
                  <small>
                    {m.role === "gm"
                      ? "MESTRE"
                      : m.role === "player"
                        ? state.character.name
                        : "SISTEMA"}
                  </small>
                  <p>{m.text}</p>
                  <time>{cp.calendarInitialized === false ? `${cp.era} · Data a definir` : cyberDate(cp.era, m.campaignMinute ?? 0, state.time.calendar)}</time>
                </article>
              ))}
              {busy && <p className="cpThinking">Sinal em transmissão…</p>}
              <div ref={bottom} />
            </div>
            {cp.pending && (
              <div className="cpPending">
                <b>{cp.pending.label}</b>
                <span>
                  {["damage", "humanity"].includes(cp.pending.kind)
                    ? `${cp.pending.count ?? 1}d6`
                    : cp.pending.kind === "death"
                      ? `d10 + ${cp.deathPenalty} < BODY ${cp.stats.body}`
                      : `d10 ${Number(cp.pending.modifier ?? 0) >= 0 ? "+" : ""}${cp.pending.modifier ?? 0}`}
                  {cp.pending.target === undefined
                    ? ""
                    : ` · DV${cp.pending.target} (superar)`}
                </span>
                {["skill", "interface"].includes(cp.pending.kind) && (
                  <label>
                    Sorte
                    <input
                      type="number"
                      min={0}
                      max={cp.luck}
                      value={luck}
                      onChange={(e) => setLuck(Number(e.target.value))}
                    />
                  </label>
                )}
                <button
                  className="cpPrimary"
                  disabled={busy}
                  onClick={() => resolve(cp.pending!)}
                >
                  ROLAR E CONTINUAR
                </button>
              </div>
            )}
            {cp.recovery && !busy && (
              <button
                className="cpPrimary"
                onClick={() => void turn(cp.recovery!.text)}
              >
                Retomar resposta do Mestre
              </button>
            )}
            {!cp.recovery &&
              !cp.pending &&
              !busy &&
              !state.messages.some((m) => m.role === "gm") && (
                <button
                  onClick={() => void turn("Inicie a campanha no local atual.")}
                >
                  Iniciar narração
                </button>
              )}
            <form
              className="cpComposer"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="cpDiceControl" ref={trayRef}>
                <button
                  type="button"
                  aria-label="Rolador de dados"
                  aria-expanded={tray}
                  onClick={() => setTray(!tray)}
                >
                  ◈
                </button>
                {tray && (
                  <div className="cpDiceTray">
                    <button
                      type="button"
                      aria-label="Fechar rolador"
                      onClick={() => setTray(false)}
                    >
                      ×
                    </button>
                    <label>
                      Quantidade
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={count}
                        onChange={(e) => setCount(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      Dado
                      <select
                        aria-label="Tipo de dado"
                        value={sides}
                        onChange={(e) =>
                          setSides(Number(e.target.value) as 6 | 10)
                        }
                      >
                        <option value={10}>d10</option>
                        <option value={6}>d6</option>
                      </select>
                    </label>
                    <label>
                      Modificador
                      <input
                        type="number"
                        value={modifier}
                        onChange={(e) => setModifier(Number(e.target.value))}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || !!cp.pending}
                      onClick={() =>
                        resolve({
                          id: crypto.randomUUID(),
                          label: "Rolagem livre",
                          kind: "custom",
                          count,
                          sides,
                          modifier,
                        })
                      }
                    >
                      Rolar
                    </button>
                  </div>
                )}
              </div>
              <textarea
                rows={2}
                aria-label="Sua ação"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Sua próxima ação nas ruas…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                className="cpPrimary"
                disabled={
                  busy ||
                  !!cp.pending ||
                  !!cp.recovery ||
                  !input.trim() ||
                  !ai.connected
                }
              >
                Enviar →
              </button>
            </form>
          </div>
          <aside className="cpSessionSidebar cpPanel">
            <small>BIOMONITOR</small>
            <h2>{state.character.name}</h2>
            <p>
              {cp.role} {cp.roleRank}
            </p>
            <div className="cpVitals">
              <span>
                PV{" "}
                <b>
                  {cp.hp}/{cp.maxHp}
                </b>
              </span>
              <meter min={0} max={cp.maxHp} value={cp.hp} />
              <span>
                HUM{" "}
                <b>
                  {cp.humanity}/{cp.maxHumanity}
                </b>
              </span>
              <meter
                min={0}
                max={Math.max(1, cp.maxHumanity)}
                value={Math.max(0, cp.humanity)}
              />
              <span>
                SP{" "}
                <b>
                  {cp.armor.body} / {cp.armor.head}
                </b>
              </span>
              <span>
                €$ <b>{cp.eddies}</b>
              </span>
            </div>
            <h3>Trabalhos ativos</h3>
            {state.quests
              .filter((q) => q.status === "active")
              .map((q) => (
                <article key={q.id}>
                  <b>{q.title}</b>
                  <p>{q.stage}</p>
                </article>
              ))}
            <h3>Última rolagem</h3>
            {cp.rolls.at(-1) && (
              <div className="cpRollResult">
                {cp.rolls.at(-1)!.dice.map((d, i) => (
                  <img
                    key={i}
                    src={`/cyberpunk/dice/d${cp.rolls.at(-1)!.sides}-${d}.webp`}
                    alt={`d${cp.rolls.at(-1)!.sides}: ${d}`}
                  />
                ))}
                <b>{cp.rolls.at(-1)!.total}</b>
              </div>
            )}
          </aside>
        </section>
      )}
      {view === "calendar" && <CyberpunkCalendar game={state} onSession={() => setView("session")} />}
      <fieldset
        className="cpViewContent"
        disabled={busy || !!cp.pending || !!cp.recovery}
      >
        {view === "character" && (
          <CyberpunkCharacter
            game={state}
            onChange={publish}
            onRoll={request}
            onError={setError}
          />
        )}
        {view === "net" && (
          <CyberpunkNetPanel
            game={state}
            onChange={publish}
            onRoll={request}
            onError={setError}
          />
        )}
        {view === "memory" && (
          <NightCityMemory game={state} onChange={publish} />
        )}
        {view === "compendium" && (
          <CyberpunkCompendium
            era={cp.era}
            onNpcChoose={(e) => {
              const raw = (e.data.npcStats ?? {}) as Record<
                  string,
                  { value: number }
                >,
                hp = e.data.npcHp as { value?: number; max?: number };
              publish({
                ...state,
                npcs: [
                  ...state.npcs,
                  {
                    id: crypto.randomUUID(),
                    name: e.name,
                    role: String(e.data.npcRole || "Contato"),
                    relation: "neutral",
                    location: place?.name || "",
                    cyberpunk: {
                      stats: Object.fromEntries(
                        Object.entries(raw).map(([k, v]) => [k, v.value]),
                      ),
                      hp: hp?.max ?? hp?.value ?? 30,
                      maxHp: hp?.max ?? 30,
                      armor: { body: 0, head: 0 },
                      injuries: [],
                    },
                  },
                ],
              });
              setView("world");
            }}
          />
        )}
        {view === "world" && (
          <section>
            <header className="cpSectionHeading">
              <div>
                <small>DATABANK // NIGHT CITY</small>
                <h1>Contatos & trabalhos</h1>
              </div>
            </header>
            <div className="cpWorldColumns">
              <section className="cpPanel">
                <h2>Contatos</h2>
                {state.npcs.map((n) => (
                  <article className={`cpContact ${n.relation}`} key={n.id}>
                    <span className="cpAvatar">
                      {n.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <h3>{n.name}</h3>
                      <p>{n.role}</p>
                      <small>{n.location}</small>
                      {n.cyberpunk && (
                        <p>
                          PV {n.cyberpunk.hp}/{n.cyberpunk.maxHp} · SP{" "}
                          {n.cyberpunk.armor.body}/{n.cyberpunk.armor.head}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
                <details>
                  <summary>Novo contato</summary>
                  <div className="cpForm">
                    <label>
                      Nome
                      <input
                        value={npcName}
                        onChange={(e) => setNpcName(e.target.value)}
                      />
                    </label>
                    <label>
                      Papel
                      <input
                        value={npcRole}
                        onChange={(e) => setNpcRole(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={!npcName.trim()}
                      onClick={() => {
                        publish({
                          ...state,
                          npcs: [
                            ...state.npcs,
                            {
                              id: crypto.randomUUID(),
                              name: npcName.trim(),
                              role: npcRole.trim(),
                              relation: "neutral",
                              location: place?.name || "",
                            },
                          ],
                        });
                        setNpcName("");
                        setNpcRole("");
                      }}
                    >
                      Salvar contato
                    </button>
                  </div>
                </details>
              </section>
              <section className="cpPanel">
                <h2>Diário de trabalhos</h2>
                {state.quests.map((q) => (
                  <article className="cpJob" key={q.id}>
                    <small>
                      {q.status === "active"
                        ? "EM ANDAMENTO"
                        : q.status === "completed"
                          ? "CONCLUÍDO"
                          : "FALHOU"}
                    </small>
                    <h3>{q.title}</h3>
                    <p>{q.stage}</p>
                  </article>
                ))}
                <details>
                  <summary>Novo trabalho</summary>
                  <div className="cpForm">
                    <label>
                      Título
                      <input
                        value={questTitle}
                        onChange={(e) => setQuestTitle(e.target.value)}
                      />
                    </label>
                    <label>
                      Objetivo
                      <input
                        value={questStage}
                        onChange={(e) => setQuestStage(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={!questTitle.trim()}
                      onClick={() => {
                        publish({
                          ...state,
                          quests: [
                            ...state.quests,
                            {
                              id: crypto.randomUUID(),
                              title: questTitle.trim(),
                              stage: questStage.trim(),
                              status: "active",
                            },
                          ],
                        });
                        setQuestTitle("");
                        setQuestStage("");
                      }}
                    >
                      Salvar trabalho
                    </button>
                  </div>
                </details>
              </section>
            </div>
          </section>
        )}
      </fieldset>
      <DiceOverlay
        result={roll}
        appearances={cyberpunkDiceAppearances(diceAppearances)}
      />
    </main>
  );
}
