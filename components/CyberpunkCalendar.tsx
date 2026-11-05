"use client";
import { useState } from "react";
import type { GameState } from "@/lib/game";
import { formatCampaignDateTime } from "@/lib/campaignTime";
import { cyberDayKey } from "@/lib/cyberpunk/calendar";
import { cyberDate } from "@/lib/cyberpunk/rules";

const monthLabel = (key: string) =>
  new Date(key + "-01T00:00:00Z").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const dayLabel = (key: string) =>
  new Date(key + "T00:00:00Z").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export default function CyberpunkCalendar({
  game,
  onSession,
}: {
  game: GameState;
  onSession: () => void;
}) {
  const cp = game.cyberpunk!,
    today = cyberDayKey(game),
    weather = game.time.weather;
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  if (cp.calendarInitialized === false)
    return (
      <section className="cpPanel cpCalendarPending">
        <small>NIGHT CITY // {cp.era}</small>
        <h1>Seu primeiro dia ainda vai começar.</h1>
        <p>
          O Mestre escolherá o dia, o mês, o horário e o clima ao abrir a
          campanha.
        </p>
        <button onClick={onSession}>Voltar à sessão</button>
      </section>
    );
  const [year, monthNumber] = month.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const records = [
    ...cp.cityEvents.map((e) => ({
      id: e.id,
      title: e.title,
      text: e.text,
      minute: e.campaignMinute,
      location: cp.places.find((p) => p.id === e.placeId)?.name,
      kind: "ACONTECIMENTO",
      completed: false,
    })),
    ...game.time.events.map((e) => ({
      id: e.id,
      title: e.title,
      text: e.description,
      minute: e.startCampaignMinute,
      location: undefined,
      kind: e.completed ? "CONCLUÍDO" : "AGENDA",
      completed: !!e.completed,
    })),
  ].sort((a, b) => a.minute - b.minute);
  const keys = records.map((e) => cyberDayKey(game, e.minute));
  const selectedRecords = records.filter((_, i) => keys[i] === selected);
  function navigate(offset: number) {
    const next = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
    if (next.getUTCFullYear() < cp.era || next.getUTCFullYear() > 9999) return;
    const key = next.toISOString().slice(0, 7);
    setMonth(key);
    setSelected(key + "-01");
  }
  return (
    <section className="cpCalendar" aria-label="Calendário de Night City">
      <header className="cpCalendarStatus cpPanel">
        <div>
          <small>NIGHT CITY // RELÓGIO DA CAMPANHA</small>
          <h2>{formatCampaignDateTime(game.time)}</h2>
          <p>Data e clima conduzidos pelo Mestre durante a história.</p>
        </div>
        <div className="cpWeather">
          <small>CLIMA ATUAL</small>
          <strong>
            {weather.label}
            {weather.temperatureC !== undefined
              ? ` · ${weather.temperatureC} °C`
              : ""}
          </strong>
          {weather.description && <p>{weather.description}</p>}
          <small>
            Atualizado em{" "}
            {cyberDate(
              cp.era,
              weather.updatedAtCampaignMinute,
              game.time.calendar,
            )}
          </small>
        </div>
      </header>
      <div className="cpCalendarLayout">
        <section className="cpPanel">
          <div className="cpCalendarToolbar">
            <button
              aria-label="Mês anterior"
              disabled={year === cp.era && monthNumber === 1}
              onClick={() => navigate(-1)}
            >
              ‹
            </button>
            <h2 aria-live="polite">{monthLabel(month)}</h2>
            <button
              aria-label="Próximo mês"
              disabled={year === 9999 && monthNumber === 12}
              onClick={() => navigate(1)}
            >
              ›
            </button>
            <button
              className="cpCalendarToday"
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
            >
              Hoje na campanha
            </button>
          </div>
          <div className="cpMonthGrid">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
              <small className="cpWeekday" key={d}>
                {d}
              </small>
            ))}
            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`empty-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1,
                key = `${month}-${String(day).padStart(2, "0")}`,
                count = keys.filter((d) => d === key).length;
              return (
                <button
                  key={key}
                  className={`cpCalendarDay ${key === today ? "cpCalendarCurrent" : ""} ${key === selected ? "active" : ""}`}
                  aria-label={`${dayLabel(key)}${count ? `, ${count} registro(s)` : ""}`}
                  aria-pressed={key === selected}
                  aria-current={key === today ? "date" : undefined}
                  onClick={() => setSelected(key)}
                >
                  <span>{day}</span>
                  {count > 0 && (
                    <small>
                      {count}
                      <span className="cpHideMobile">
                        {" "}
                        registro{count > 1 ? "s" : ""}
                      </span>
                    </small>
                  )}
                </button>
              );
            })}
          </div>
          <p className="cpCalendarLegend">
            <span /> Dia atual da campanha · Selecione um dia para consultar os
            registros.
          </p>
        </section>
        <section className="cpPanel cpCalendarAgenda" aria-live="polite">
          <small>DIÁRIO / AGENDA</small>
          <h2>{dayLabel(selected)}</h2>
          {selectedRecords.length === 0 && (
            <p>Nenhum acontecimento ou compromisso registrado neste dia.</p>
          )}
          {selectedRecords.map((e) => (
            <article
              className={`cpCalendarEvent ${e.completed ? "completed" : ""}`}
              key={e.id}
            >
              <small>
                {e.kind} ·{" "}
                {cyberDate(cp.era, e.minute, game.time.calendar).split(", ")[1]}
              </small>
              <h3>{e.title}</h3>
              {e.location && <small>⌖ {e.location}</small>}
              {e.text && <p>{e.text}</p>}
            </article>
          ))}
          <p className="cpCalendarHint">
            O Mestre registra os acontecimentos e agenda os prazos dos
            trabalhos. Os locais também ficam disponíveis na Memória / Mapa.
          </p>
        </section>
      </div>
    </section>
  );
}
