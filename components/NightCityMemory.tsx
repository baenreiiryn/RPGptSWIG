"use client";
import { useState } from "react";
import type { GameState } from "@/lib/game";
import { cyberDate } from "@/lib/cyberpunk/rules";
import { withCyberState } from "@/lib/cyberpunk/state";
export default function NightCityMemory({
  game,
  onChange,
}: {
  game: GameState;
  onChange: (g: GameState) => void;
}) {
  const cp = game.cyberpunk!;
  const [selected, setSelected] = useState(cp.locationId),
    [zoom, setZoom] = useState(1),
    [search, setSearch] = useState(""),
    [date, setDate] = useState(""),
    [adding, setAdding] = useState(false),
    [position, setPosition] = useState({ x: 50, y: 50 }),
    [name, setName] = useState(""),
    [address, setAddress] = useState(""),
    [district, setDistrict] = useState(""),
    [title, setTitle] = useState(""),
    [text, setText] = useState(""),
    [npcIds, setNpcIds] = useState<string[]>([]),
    [questIds, setQuestIds] = useState<string[]>([]);
  const place = cp.places.find((p) => p.id === selected),
    events = cp.cityEvents
      .filter(
        (e) =>
          e.placeId === selected &&
          (!search ||
            (e.title + " " + e.text)
              .toLowerCase()
              .includes(search.toLowerCase())) &&
          (!date ||
            new Date(Date.UTC(cp.era, 0, 1, 20) + e.campaignMinute * 60000)
              .toISOString()
              .slice(0, 10) === date),
      )
      .sort((a, b) => b.campaignMinute - a.campaignMinute);
  function addPlace() {
    if (!name.trim() || !address.trim()) return;
    const p = {
      id: crypto.randomUUID(),
      name: name.trim(),
      address: address.trim(),
      district: district.trim(),
      x: position.x,
      y: position.y,
      era: cp.era,
      precision: "custom" as const,
    };
    onChange(withCyberState(game, { ...cp, places: [...cp.places, p] }));
    setSelected(p.id);
    setAdding(false);
    setName("");
    setAddress("");
  }
  function remember() {
    if (!title.trim() || !place) return;
    const e = {
      id: crypto.randomUUID(),
      title: title.trim(),
      text: text.trim(),
      placeId: place.id,
      campaignMinute: game.time.campaignMinute,
      npcIds,
      questIds,
    };
    onChange(
      withCyberState(
        {
          ...game,
          memories: [
            {
              id: e.id,
              kind: "event",
              text: e.title + ": " + e.text,
              createdAt: new Date().toISOString(),
              campaignMinute: e.campaignMinute,
            },
            ...game.memories,
          ],
        },
        { ...cp, cityEvents: [...cp.cityEvents, e] },
      ),
    );
    setTitle("");
    setText("");
    setNpcIds([]);
    setQuestIds([]);
  }
  return (
    <section className="cpMemory">
      <header className="cpSectionHeading">
        <div>
          <small>ARQUIVO GEOLOCALIZADO</small>
          <h1>Night City // {cp.era}</h1>
          <p>
            {cp.places.length} locais · {cp.cityEvents.length} acontecimentos
          </p>
        </div>
        <div className="cpButtonRow">
          <button
            aria-label="Diminuir mapa"
            onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}
          >
            −
          </button>
          <button
            aria-label="Ampliar mapa"
            onClick={() => setZoom(Math.min(3, zoom + 0.25))}
          >
            ＋
          </button>
          <button aria-pressed={adding} onClick={() => setAdding(!adding)}>
            {adding ? "Cancelar marcação" : "Marcar endereço"}
          </button>
        </div>
      </header>
      <div className="cpMapLayout">
        <div
          className="cpMapScroll"
          tabIndex={0}
          aria-label="Mapa interativo de Night City"
        >
          <div
            className="cpMapCanvas"
            style={{ width: `${zoom * 100}%` }}
            onClick={(e) => {
              if (!adding) return;
              const r = e.currentTarget.getBoundingClientRect();
              setPosition({
                x: Math.round(((e.clientX - r.left) / r.width) * 10000) / 100,
                y: Math.round(((e.clientY - r.top) / r.height) * 10000) / 100,
              });
            }}
          >
            <img
              draggable={false}
              src={`/cyberpunk/night-city-${cp.era}.${cp.era === 2045 ? "png" : "webp"}`}
              alt={`Mapa de Night City em ${cp.era}`}
            />
            {cp.places.map((p) => (
              <button
                key={p.id}
                className={`cpMapPin ${p.id === selected ? "selected" : ""} ${cp.cityEvents.some((e) => e.placeId === p.id) ? "hasEvents" : ""}`}
                style={{ left: p.x + "%", top: p.y + "%" }}
                title={p.name}
                aria-label={`${p.name}, ${cp.cityEvents.filter((e) => e.placeId === p.id).length} acontecimentos`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelected(p.id);
                }}
              >
                {cp.cityEvents.filter((e) => e.placeId === p.id).length || "·"}
              </button>
            ))}
            {adding && (
              <span
                className="cpMapCross"
                style={{ left: position.x + "%", top: position.y + "%" }}
              >
                ＋
              </span>
            )}
          </div>
        </div>
        <aside className="cpPanel cpPlacePanel">
          {adding ? (
            <div className="cpForm">
              <h2>Novo endereço</h2>
              <p>
                Toque no mapa para posicionar e defina o endereço da campanha.
              </p>
              <label>
                Nome
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Bairro
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </label>
              <label>
                Endereço
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </label>
              <small>
                {position.x.toFixed(2)}% / {position.y.toFixed(2)}%
              </small>
              <button
                disabled={!name.trim() || !address.trim()}
                onClick={addPlace}
              >
                Salvar local
              </button>
            </div>
          ) : (
            <>
              <label>
                Local
                <select
                  aria-label="Local"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {cp.places.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {place && (
                <>
                  <small>{place.district}</small>
                  <h2>{place.name}</h2>
                  <p>{place.address}</p>
                  <small>
                    {place.precision === "district"
                      ? "Marcador do bairro; cadastre endereços para pontos específicos."
                      : place.precision === "landmark"
                        ? "Ponto de referência do mapa do livro."
                        : "Endereço definido nesta campanha."}
                  </small>
                  <button
                    onClick={() =>
                      onChange({
                        ...withCyberState(game, {
                          ...cp,
                          locationId: place.id,
                        }),
                        campaign: { ...game.campaign, scene: place.name },
                      })
                    }
                  >
                    Definir como cena atual
                  </button>
                </>
              )}
              <div className="cpFilters">
                <input
                  aria-label="Filtrar acontecimentos"
                  placeholder="Buscar no histórico"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <input
                  aria-label="Data do acontecimento"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              {events.map((e) => (
                <article className="cpEvent" key={e.id}>
                  <time>{cyberDate(cp.era, e.campaignMinute)}</time>
                  <h3>{e.title}</h3>
                  <p>{e.text}</p>
                  {e.npcIds.map((id) => (
                    <small key={id}>
                      {game.npcs.find((n) => n.id === id)?.name}
                    </small>
                  ))}
                  {e.questIds.map((id) => (
                    <small key={id}>
                      {game.quests.find((q) => q.id === id)?.title}
                    </small>
                  ))}
                </article>
              ))}
              {!events.length && (
                <p>Nenhum acontecimento registrado neste local.</p>
              )}
              <details>
                <summary>Registrar acontecimento</summary>
                <div className="cpForm">
                  <label>
                    Título
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    Descrição
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  </label>
                  {game.npcs.length > 0 && (
                    <label>
                      Contatos envolvidos
                      <select
                        multiple
                        aria-label="Contatos envolvidos"
                        value={npcIds}
                        onChange={(e) =>
                          setNpcIds(
                            [...e.target.selectedOptions].map((o) => o.value),
                          )
                        }
                      >
                        {game.npcs.map((n) => (
                          <option value={n.id} key={n.id}>
                            {n.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {game.quests.length > 0 && (
                    <label>
                      Trabalhos relacionados
                      <select
                        multiple
                        aria-label="Trabalhos relacionados"
                        value={questIds}
                        onChange={(e) =>
                          setQuestIds(
                            [...e.target.selectedOptions].map((o) => o.value),
                          )
                        }
                      >
                        {game.quests.map((q) => (
                          <option value={q.id} key={q.id}>
                            {q.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <button disabled={!title.trim()} onClick={remember}>
                    Vincular a este local e à data atual
                  </button>
                </div>
              </details>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
