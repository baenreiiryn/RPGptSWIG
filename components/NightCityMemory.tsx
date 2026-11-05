"use client";
import { useState } from "react";
import NightCityMap, { type CityMapLayer } from "./NightCityMap";
import { mergeNightCityPlaces, PLACE_CATEGORIES } from "@/lib/cyberpunk/places";
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
  const cp = {
    ...game.cyberpunk!,
    places: mergeNightCityPlaces(game.cyberpunk!.places, game.cyberpunk!.era),
  };
  const [selected, setSelected] = useState(cp.locationId),
    [layer, setLayer] = useState<CityMapLayer>(
      cp.era === 2077 ? "streets" : "atlas",
    ),
    [placeQuery, setPlaceQuery] = useState(""),
    [category, setCategory] = useState(""),
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
  const visible = cp.places.filter(
    (p) =>
      (!category ||
        (p.category ?? (p.precision === "custom" ? "custom" : "landmark")) ===
          category) &&
      (!placeQuery ||
        (p.name + " " + p.district + " " + p.address)
          .toLocaleLowerCase()
          .includes(placeQuery.toLocaleLowerCase())),
  );
  function selectPlace(id: string) {
    const p = cp.places.find((p) => p.id === id);
    setSelected(id);
    if (p && !p.streetPosition) setLayer("atlas");
    else if (p?.mapLayer === "streets") setLayer("streets");
  }
  const counts = Object.fromEntries(
    cp.places.map((p) => [
      p.id,
      cp.cityEvents.filter((e) => e.placeId === p.id).length,
    ]),
  );
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
      category: "custom",
      mapLayer: layer,
      ...(layer === "streets" ? { streetPosition: { ...position } } : {}),
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
          <button aria-pressed={adding} onClick={() => setAdding(!adding)}>
            {adding ? "Cancelar marcação" : "Marcar endereço"}
          </button>
        </div>
      </header>
      <div className="cpMapLayout">
        <div>
          <div className="cpFilters cpPlaceFilters">
            <input
              aria-label="Buscar locais"
              placeholder="Estabelecimento, bairro ou endereço"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
            />
            <select
              aria-label="Tipo de local"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todos os locais</option>
              {Object.entries(PLACE_CATEGORIES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <NightCityMap
            era={cp.era}
            places={visible}
            selected={selected}
            counts={counts}
            adding={adding}
            position={position}
            layer={layer}
            onLayer={setLayer}
            onSelect={selectPlace}
            onPosition={setPosition}
          />
          {(placeQuery || category) && (
            <div className="cpPlaceResults" aria-label="Resultados de locais">
              {visible.length ? (
                visible.map((p) => (
                  <button key={p.id} onClick={() => selectPlace(p.id)}>
                    {p.name}
                    <small>{p.district}</small>
                  </button>
                ))
              ) : (
                <p>Nenhum local encontrado.</p>
              )}
            </div>
          )}
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
                  onChange={(e) => selectPlace(e.target.value)}
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
                  {place.referenceUrl && (
                    <p>
                      <a
                        href={place.referenceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver referência da localização ↗
                      </a>
                    </p>
                  )}
                  <small>
                    {place.precision === "district"
                      ? "Marcador do bairro; cadastre endereços para pontos específicos."
                      : place.precision === "landmark"
                        ? place.referenceUrl
                          ? layer === "streets"
                            ? "Ponto de acesso da referência no mapa de ruas."
                            : "Posição aproximada no atlas; consulte a camada de ruas."
                          : "Ponto de referência do mapa do livro."
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
                        cyberpunk: { ...cp, locationId: place.id },
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
