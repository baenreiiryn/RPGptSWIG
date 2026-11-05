"use client";
import { useState } from "react";
import type { GameState } from "@/lib/game";
import { withCyberState } from "@/lib/cyberpunk/state";
import { netActionsPerTurn, cyberDate } from "@/lib/cyberpunk/rules";
import {
  requestHack,
  QUICKHACKS,
  leaveNeuroport,
  nextCyberTurn,
} from "@/lib/cyberpunk/hacking";
import type { CyberPendingRoll, HackTarget } from "@/lib/cyberpunk/types";
export default function CyberpunkNetPanel({
  game,
  onChange,
  onRoll,
  onError,
}: {
  game: GameState;
  onChange: (g: GameState) => void;
  onRoll: (p: CyberPendingRoll) => void;
  onError: (s: string) => void;
}) {
  const cp = game.cyberpunk!;
  const [name, setName] = useState(""),
    [will, setWill] = useState(6),
    [ice, setIce] = useState(0),
    [distance, setDistance] = useState(20),
    [visible, setVisible] = useState(true),
    [neuroport, setNeuroport] = useState(true);
  const next = () =>
    onChange(
      withCyberState(
        {
          ...game,
          time: {
            ...game.time,
            campaignMinute: game.time.campaignMinute + 0.05,
          },
        },
        nextCyberTurn(cp),
      ),
    );
  function act(
    id: string,
    action: "jack" | "breach" | "quickhack",
    hack?: string,
  ) {
    try {
      onRoll(requestHack(cp, id, action, game.time.campaignMinute, hack));
    } catch (e) {
      onError((e as Error).message);
    }
  }
  function leave(id: string, ejected = false) {
    try {
      onChange(
        withCyberState(
          game,
          leaveNeuroport(cp, id, game.time.campaignMinute, ejected),
        ),
      );
    } catch (e) {
      onError((e as Error).message);
    }
  }
  function add() {
    if (!name.trim()) return;
    const t: HackTarget = {
      id: crypto.randomUUID(),
      name: name.trim(),
      will: Math.max(1, Math.min(20, will)),
      selfIce: Math.max(0, Math.min(20, ice)),
      distance: Math.max(0, distance),
      visible,
      neuroport,
      breached: 0,
      connected: false,
      aware: false,
      effects: [],
    };
    onChange(
      withCyberState(game, {
        ...cp,
        net: { ...cp.net, targets: [...cp.net.targets, t] },
      }),
    );
    setName("");
  }
  if (cp.era === 2045)
    return (
      <section className="cpPanel">
        <small>INTERFACE // NETRUNNING 2045</small>
        <h2>Arquiteturas NET</h2>
        <p>Turno {cp.net.turn}</p>
        <button disabled={!!cp.pending} onClick={next}>
          Próximo turno (+3 s)
        </button>
        <p>
          Acesso local, programas, Black ICE e andares de arquitetura. Use o
          chat para explorar; o Mestre consulta os registros e solicita os
          testes de Interface.
        </p>
        <p>
          A navegação por andares e os adversários NET exigem adjudicação do
          Mestre.
        </p>
      </section>
    );
  return (
    <section className="cpPanel">
      <header className="cpSectionHeading">
        <div>
          <small>INTERFACE {cp.role === "Netrunner" ? cp.roleRank : 0}</small>
          <h2>Quickhacking</h2>
          <p>
            Turno {cp.net.turn} · {cp.net.actionsUsed}/
            {netActionsPerTurn(cp.roleRank)} ações NET{" "}
            {cp.net.meatAction ? "· Ação física usada" : ""}
          </p>
        </div>
        <button disabled={!!cp.pending} onClick={next}>
          Próximo turno (+3 s)
        </button>
      </header>
      <details>
        <summary>Registrar alvo conhecido</summary>
        <div className="cpForm">
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            WILL
            <input
              type="number"
              min={1}
              max={20}
              value={will}
              onChange={(e) => setWill(Number(e.target.value))}
            />
          </label>
          <label>
            Self-ICE
            <input
              type="number"
              min={0}
              max={20}
              value={ice}
              onChange={(e) => setIce(Number(e.target.value))}
            />
          </label>
          <label>
            Distância (m)
            <input
              type="number"
              min={0}
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
            />
          </label>
          <label>
            <span>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />{" "}
              Visível
            </span>
          </label>
          <label>
            <span>
              <input
                type="checkbox"
                checked={neuroport}
                onChange={(e) => setNeuroport(e.target.checked)}
              />{" "}
              Possui Neuroport
            </span>
          </label>
          <button disabled={!name.trim()} onClick={add}>
            Registrar alvo
          </button>
        </div>
      </details>
      <div className="cpTargetGrid">
        {cp.net.targets.map((t) => (
          <article className="cpTarget" key={t.id}>
            <h3>{t.name}</h3>
            <p>
              {t.connected ? "CONECTADO" : "DESCONECTADO"} · {t.distance} m ·
              Passwalls {t.breached}/{t.selfIce} ·{" "}
              {t.aware ? "ALERTA" : "DESAVISADO"}
            </p>
            <div className="cpButtonRow">
              <button disabled={!!cp.pending} onClick={() => act(t.id, "jack")}>
                Jack In
              </button>
              <button
                disabled={!!cp.pending}
                onClick={() => act(t.id, "breach")}
              >
                Breach DV{4 + 2 * t.selfIce}
              </button>
              <button
                disabled={!t.connected || !!cp.pending}
                onClick={() => leave(t.id)}
              >
                Jack Out
              </button>
              <button
                disabled={!t.connected || !!cp.pending}
                onClick={() => leave(t.id, true)}
              >
                Registrar expulsão
              </button>
            </div>
            <div className="cpHackList">
              {QUICKHACKS.map((h) => (
                <button
                  disabled={!!cp.pending || cp.roleRank < h.rank}
                  title={h.description}
                  key={h.id}
                  onClick={() => act(t.id, "quickhack", h.id)}
                >
                  <span>{h.name}</span>
                  <b>DV{h.dv}</b>
                </button>
              ))}
            </div>
            {t.effects
              .filter((e) => e.expires > game.time.campaignMinute)
              .map((e, i) => (
                <p key={i}>
                  {e.name} · até {cyberDate(cp.era, e.expires)}
                </p>
              ))}
          </article>
        ))}
      </div>
    </section>
  );
}
