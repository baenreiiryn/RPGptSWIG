"use client";
import { useState } from "react";
import type { GameState } from "@/lib/game";
import {
  STAT_KEYS,
  STAT_LABELS,
  effectiveEmpathy,
  effectiveCyberStat,
  woundPenalty,
  cyberDate,
} from "@/lib/cyberpunk/rules";
import {
  findCyberEntry,
  entryArt,
  TYPE_LABELS,
  entriesForEra,
  priceOf,
  type CyberEntry,
} from "@/lib/cyberpunk/catalog";
import {
  withCyberState,
  installCyberware,
  equipArmor,
  skillOptions,
  purchaseItem,
  requestCyberInstall,
  reloadCyberWeapon,
} from "@/lib/cyberpunk/state";
import type { CyberPendingRoll } from "@/lib/cyberpunk/types";
export default function CyberpunkCharacter({
  game,
  onChange,
  onRoll,
  onError,
}: {
  game: GameState;
  onChange: (g: GameState) => void;
  onRoll: (p: CyberPendingRoll) => void;
  onError: (e: string) => void;
}) {
  const cp = game.cyberpunk!;
  const [tab, setTab] = useState<"sheet" | "cyberware" | "inventory">("sheet"),
    [part, setPart] = useState(""),
    [parent, setParent] = useState(""),
    [filter, setFilter] = useState(""),
    [shop, setShop] = useState(false),
    [ammoId, setAmmoId] = useState("");
  function update(action: () => void) {
    try {
      action();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  const inventory = cp.inventory.filter(
      (i) =>
        (!part || findCyberEntry(i.sourceId)?.data.type === part) &&
        i.name.toLowerCase().includes(filter.toLowerCase()),
    ),
    slots = cp.inventory.filter(
      (i) =>
        i.installed && findCyberEntry(i.sourceId)?.data.installedItems?.allowed,
    ),
    shopEntries = entriesForEra(cp.era)
      .filter(
        (e) =>
          !["skill", "role", "criticalInjury", "netarch", "npc"].includes(
            e.type,
          ) &&
          e.name !== "Neuroport (Free)" &&
          e.name.toLowerCase().includes(filter.toLowerCase()),
      )
      .slice(0, 50);
  function skillRoll(name: string, stat: string) {
    onRoll({
      id: crypto.randomUUID(),
      kind: "skill",
      label: name,
      skill: name,
      modifier:
        effectiveCyberStat(cp, stat as keyof typeof cp.stats) +
        (cp.skills[name] ?? 0) +
        woundPenalty(cp, game.time.campaignMinute),
    });
  }
  function buy(e: CyberEntry) {
    onChange(withCyberState(game, purchaseItem(cp, e)));
  }
  return (
    <section>
      <header className="cpSectionHeading">
        <div>
          <small>
            ARQUIVO PESSOAL // {cp.role} {cp.roleRank}
          </small>
          <h1>{game.character.name}</h1>
          {game.character.image && <img className="cpCharacterPortrait" src={game.character.image} alt={`Retrato de ${game.character.name}`}/>}
          {game.character.appearance && <p>{game.character.appearance}</p>}
          <p>
            {cp.eddies} €$ · Humanidade {cp.humanity}/{cp.maxHumanity} · EMP{" "}
            {effectiveEmpathy(cp)} · {cp.ip} IP
          </p>
        </div>
        <nav className="cpSubnav">
          {(["sheet", "cyberware", "inventory"] as const).map((t) => (
            <button
              className={tab === t ? "active" : ""}
              key={t}
              onClick={() => {
                setTab(t);
                setPart("");
                setFilter("");
              }}
            >
              {t === "sheet"
                ? "Personagem"
                : t === "cyberware"
                  ? "Cyberware"
                  : "Inventário"}
            </button>
          ))}
        </nav>
      </header>
      {tab === "sheet" && (
        <div className="cpSheetColumns">
          <section className="cpPanel">
            <h2>Atributos</h2>
            <div className="cpStatsGrid">
              {STAT_KEYS.map((k) => (
                <div key={k}>
                  <small>{STAT_LABELS[k]}</small>
                  <b>{effectiveCyberStat(cp, k)}</b>
                  <span>{k.toUpperCase()}</span>
                </div>
              ))}
            </div>
            <h2>Perícias</h2>
            <div className="cpSkillList">
              {skillOptions()
                .filter((e) => (cp.skills[e.name] ?? 0) > 0)
                .map((e) => (
                  <button
                    key={e.name}
                    disabled={!!cp.pending}
                    onClick={() => skillRoll(e.name, e.data.stat ?? "int")}
                  >
                    <span>{e.name}</span>
                    <b>
                      {cp.skills[e.name]} + {e.data.stat?.toUpperCase()}
                    </b>
                  </button>
                ))}
            </div>
            <p>Idioma nativo: {cp.nativeLanguage} 4</p>
          </section>
          <section className="cpPanel">
            <h2>Estado</h2>
            <button
              disabled={!!cp.pending}
              onClick={() =>
                onRoll({
                  id: crypto.randomUUID(),
                  label: "Iniciativa",
                  kind: "custom",
                  count: 1,
                  sides: 10,
                  modifier:
                    effectiveCyberStat(cp, "ref") +
                    (cp.inventory.some(
                      (i) =>
                        i.installed &&
                        i.name === "Sandevistan" &&
                        (i.activeUntil ?? 0) > game.time.campaignMinute,
                    )
                      ? 3
                      : cp.inventory.some(
                            (i) => i.installed && i.name === "Kerenzikov",
                          )
                        ? 2
                        : 0),
                })
              }
            >
              Rolar iniciativa
            </button>
            <p>
              PV restantes:{" "}
              <b>
                {cp.hp}/{cp.maxHp}
              </b>
            </p>
            <p>Gravemente ferido: ≤{Math.ceil(cp.maxHp / 2)} PV</p>
            <p>
              Armadura: Corpo {cp.armor.body} SP · Cabeça {cp.armor.head} SP
            </p>
            <p>
              Sorte: {cp.luck}/{cp.stats.luck}
            </p>
            {cp.hp === 0 && !cp.dead && (
              <button
                disabled={!!cp.pending}
                onClick={() =>
                  onRoll({
                    id: crypto.randomUUID(),
                    label: "Teste de Morte",
                    kind: "death",
                  })
                }
              >
                Teste de Morte
              </button>
            )}
            {cp.dead && <p className="cpError">Morto</p>}
            <h3>Ferimentos</h3>
            {cp.injuries.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
            <h2>Lifepath</h2>
            <p className="cpPreserve">
              {cp.history || "História não registrada."}
            </p>
            <p>
              Habilidade:{" "}
              {
                entriesForEra(cp.era).find(
                  (e) => e.type === "role" && e.name === cp.role,
                )?.data.mainRoleAbility
              }
            </p>
            <small>
              Habilidades de papel e escolhas narrativas são resolvidas pelo
              Mestre com as regras do compêndio.
            </small>
          </section>
        </div>
      )}
      {tab === "cyberware" && (
        <div className="cpCyberLayout">
          <aside className="cpPanel">
            <h2>Sistemas</h2>
            {[
              ["", "Todos"],
              ["neuralWare", "Sistema nervoso"],
              ["cyberEye", "Visão"],
              ["cyberAudio", "Áudio"],
              ["cyberArm", "Braços"],
              ["cyberLeg", "Pernas"],
              ["internalBody", "Corpo interno"],
              ["externalBody", "Corpo externo"],
              ["fashionWare", "Fashionware"],
            ].map(([id, label]) => (
              <button
                className={part === id ? "active" : ""}
                key={id}
                onClick={() => setPart(id)}
              >
                {label}
              </button>
            ))}
            <h3>Bases instaladas</h3>
            {slots.map((i) => (
              <p key={i.id}>
                {i.name} ·{" "}
                {cp.inventory
                  .filter((c) => c.parentId === i.id)
                  .reduce(
                    (n, c) =>
                      n + Number(findCyberEntry(c.sourceId)?.data.size ?? 0),
                    0,
                  )}
                /{findCyberEntry(i.sourceId)?.data.installedItems?.slots ?? 0}{" "}
                slots
              </p>
            ))}
          </aside>
          <div className="cpBodyScan">
            <img
              src="/cyberpunk/body-scan.webp"
              alt="Scanner corporal de cyberware"
            />
            <div className="cpScanLabel">
              SISTEMAS CIBERNÉTICOS
              <br />
              HUM {cp.humanity} // EMP {effectiveEmpathy(cp)}
            </div>
          </div>
          <section className="cpPanel">
            <h2>Cyberware</h2>
            <label>
              Base para instalar opção
              <select
                aria-label="Base para instalar opção"
                value={parent}
                onChange={(e) => setParent(e.target.value)}
              >
                <option value="">Selecione a base</option>
                {slots.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </label>
            {inventory
              .filter((i) => i.type === "cyberware")
              .map((i) => {
                const e = findCyberEntry(i.sourceId)!;
                return (
                  <article key={i.id} className="cpInventoryCard">
                    <img src={entryArt(e)} alt="" />
                    <div>
                      <b>{i.name}</b>
                      <small>
                        {i.installed ? "INSTALADO" : "NÃO INSTALADO"} · HL{" "}
                        {e.data.humanityLoss?.static ?? 0}
                      </small>
                      <p>{e.description}</p>
                      {!i.installed && (
                        <button
                          onClick={() =>
                            update(() => {
                              if (Number(e.data.humanityLoss?.static ?? 0) > 0)
                                onRoll(
                                  requestCyberInstall(
                                    cp,
                                    i.id,
                                    parent || undefined,
                                  ),
                                );
                              else
                                onChange(
                                  withCyberState(
                                    game,
                                    installCyberware(
                                      cp,
                                      i.id,
                                      parent || undefined,
                                    ),
                                  ),
                                );
                            })
                          }
                        >
                          Instalar em clínica
                        </button>
                      )}
                      {i.installed &&
                        ["Sandevistan", "Berserk Implant"].includes(i.name) && (
                          <button
                            disabled={
                              (i.cooldownUntil ?? 0) > game.time.campaignMinute
                            }
                            onClick={() =>
                              onChange(
                                withCyberState(game, {
                                  ...cp,
                                  inventory: cp.inventory.map((x) =>
                                    x.id === i.id
                                      ? {
                                          ...x,
                                          activeUntil:
                                            game.time.campaignMinute + 1,
                                          cooldownUntil:
                                            game.time.campaignMinute + 61,
                                        }
                                      : x,
                                  ),
                                }),
                              )
                            }
                          >
                            {(i.cooldownUntil ?? 0) > game.time.campaignMinute
                              ? `Recarga: ${cyberDate(cp.era, i.cooldownUntil!)}`
                              : "Ativar por 60 s"}
                          </button>
                        )}
                    </div>
                  </article>
                );
              })}
          </section>
        </div>
      )}
      {tab === "inventory" && (
        <section className="cpPanel">
          <div className="cpFilters">
            <input
              aria-label="Buscar inventário"
              placeholder={shop ? "Buscar no mercado" : "Buscar no inventário"}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              aria-pressed={shop}
              onClick={() => {
                setShop(!shop);
                setFilter("");
              }}
            >
              {shop ? "Fechar mercado" : "Abrir mercado"}
            </button>
          </div>
          {shop ? (
            <div className="cpCatalogGrid">
              {shopEntries.map((e) => (
                <button
                  className="cpItemCard"
                  key={e.id}
                  onClick={() => update(() => buy(e))}
                >
                  {entryArt(e) && <img src={entryArt(e)} alt="" />}
                  <b>{e.name}</b>
                  <span>{priceOf(e)} €$</span>
                </button>
              ))}
            </div>
          ) : (
            inventory.map((i) => {
              const e = findCyberEntry(i.sourceId);
              if (!e) return null;
              return (
                <article className="cpInventoryCard" key={i.id}>
                  {entryArt(e) && <img src={entryArt(e)} alt="" />}
                  <div>
                    <small>{TYPE_LABELS[i.type]}</small>
                    <h3>
                      {i.name} ×{i.qty}
                    </h3>
                    <p>{e.description}</p>
                    {i.type === "weapon" &&
                      Number(e.data.magazine?.max ?? 0) > 0 && (
                        <div>
                          <small>
                            Munição: {i.ammo ?? 0}/{e.data.magazine?.max}
                          </small>
                          <select
                            aria-label={"Munição para " + i.name}
                            value={ammoId}
                            onChange={(ev) => setAmmoId(ev.target.value)}
                          >
                            <option value="">Escolha munição</option>
                            {cp.inventory
                              .filter((a) => a.type === "ammo")
                              .map((a) => (
                                <option value={a.id} key={a.id}>
                                  {a.name} ×{a.qty}
                                </option>
                              ))}
                          </select>
                          <button
                            onClick={() =>
                              update(() =>
                                onChange(
                                  withCyberState(
                                    game,
                                    reloadCyberWeapon(cp, i.id, ammoId),
                                  ),
                                ),
                              )
                            }
                          >
                            Recarregar (ação)
                          </button>
                        </div>
                      )}
                    {e.data.damage && i.type === "weapon" && (
                      <button
                        disabled={!!cp.pending}
                        onClick={() =>
                          onRoll({
                            id: crypto.randomUUID(),
                            label: "Dano: " + i.name,
                            kind: "damage",
                            count: Number(
                              e.data.damage!.match(/^(\d+)d6/)?.[1] ?? 1,
                            ),
                            modifier: 0,
                            sides: 6,
                          })
                        }
                      >
                        Rolar dano ({e.data.damage})
                      </button>
                    )}
                    {i.type === "armor" && (
                      <button
                        onClick={() =>
                          update(() =>
                            onChange(
                              withCyberState(game, equipArmor(cp, i.id)),
                            ),
                          )
                        }
                      >
                        Equipar armadura
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>
      )}
    </section>
  );
}
