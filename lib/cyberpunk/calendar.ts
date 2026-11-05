import type { GameState } from "../game";
import {
  campaignMinuteFromDate,
  deriveCampaignDateTime,
  gregorianEpochMs,
  type CampaignWeather,
  type WeatherCondition,
} from "../campaignTime";

export const CYBER_WEATHER = {
  clear: "Céu limpo",
  "partly-cloudy": "Parcialmente nublado",
  cloudy: "Nublado",
  rain: "Chuva",
  storm: "Tempestade",
  snow: "Neve",
  fog: "Névoa",
  wind: "Vento",
  custom: "Outro",
} satisfies Record<WeatherCondition, string>;

export function cyberDayKey(g: GameState, minute = g.time.campaignMinute) {
  const epoch =
    gregorianEpochMs(g.time.calendar) ?? Date.UTC(g.cyberpunk!.era, 0, 1, 20);
  return new Date(epoch + minute * 60000).toISOString().slice(0, 10);
}

function weatherFromArgs(
  g: GameState,
  a: Record<string, unknown>,
): CampaignWeather {
  const condition = a.condition as WeatherCondition;
  if (!Object.hasOwn(CYBER_WEATHER, condition)) throw Error("Clima inválido.");
  if (typeof a.label !== "string" || !a.label.trim())
    throw Error("Informe o nome do clima.");
  if (a.description !== undefined && typeof a.description !== "string")
    throw Error("Descrição inválida.");
  if (
    a.temperatureC !== undefined &&
    (typeof a.temperatureC !== "number" ||
      !Number.isFinite(a.temperatureC) ||
      a.temperatureC < -100 ||
      a.temperatureC > 100)
  )
    throw Error("Temperatura inválida.");
  if (
    a.intensity !== undefined &&
    !["light", "moderate", "heavy"].includes(String(a.intensity))
  )
    throw Error("Intensidade inválida.");
  return {
    condition,
    label: a.label.trim(),
    description: a.description as string | undefined,
    temperatureC: a.temperatureC as number | undefined,
    intensity: a.intensity as CampaignWeather["intensity"],
    updatedAtCampaignMinute: g.time.campaignMinute,
  };
}

export function applyCyberCalendarTool(
  g: GameState,
  name: string,
  a: Record<string, unknown>,
): GameState {
  const cp = g.cyberpunk!;
  if (
    name !== "weather_set" &&
    ![a.month, a.day, a.hour, a.minute].every(
      (v) => typeof v === "number" && Number.isInteger(v),
    )
  )
    throw Error("Informe mês, dia, hora e minuto como números inteiros.");
  if (name === "calendar_start") {
    if (
      cp.calendarInitialized !== false ||
      g.time.campaignMinute !== 0
    )
      throw Error(
        "O início do calendário já foi definido; use advance_time para prosseguir.",
      );
    if (a.year !== undefined) throw Error(`O ano inicial é ${cp.era}.`);
    const base = {
      ...g.time.calendar,
      gregorianEpoch: new Date(Date.UTC(cp.era, 0, 1)).toISOString(),
    };
    const minute = campaignMinuteFromDate(base, {
      year: cp.era,
      monthIndex: (a.month as number) - 1,
      day: a.day as number,
      hour: a.hour as number,
      minute: a.minute as number,
    });
    const calendar = {
      ...base,
      gregorianEpoch: new Date(
        Date.UTC(cp.era, 0, 1) + minute * 60000,
      ).toISOString(),
    };
    const time = { ...g.time, calendar, weather: weatherFromArgs(g, a) };
    const snapshot = g.campaign.restartSnapshot;
    return {
      ...g,
      time,
      cyberpunk: { ...cp, calendarInitialized: true },
      campaign: snapshot
        ? {
            ...g.campaign,
            restartSnapshot: {
              ...snapshot,
              time: structuredClone(time),
              ...(snapshot.cyberpunk
                ? {
                    cyberpunk: {
                      ...snapshot.cyberpunk,
                      calendarInitialized: true,
                    },
                  }
                : {}),
            },
          }
        : g.campaign,
    };
  }
  if (cp.calendarInitialized === false)
    throw Error("Defina primeiro o início com calendar_start.");
  if (name === "weather_set")
    return { ...g, time: { ...g.time, weather: weatherFromArgs(g, a) } };
  if (name === "calendar_event_add") {
    if (typeof a.title !== "string" || !a.title.trim())
      throw Error("Informe o título do compromisso.");
    const now = deriveCampaignDateTime(g.time);
    const startCampaignMinute = campaignMinuteFromDate(g.time.calendar, {
      year: (a.year ?? now.year) as number,
      monthIndex: (a.month as number) - 1,
      day: a.day as number,
      hour: a.hour as number,
      minute: a.minute as number,
    });
    if (startCampaignMinute < g.time.campaignMinute)
      throw Error("O compromisso precisa estar no presente ou futuro.");
    return {
      ...g,
      time: {
        ...g.time,
        events: [
          ...g.time.events,
          {
            id: crypto.randomUUID(),
            title: a.title.trim(),
            description:
              typeof a.description === "string" ? a.description : undefined,
            kind: "appointment" as const,
            startCampaignMinute,
          },
        ].sort((a, b) => a.startCampaignMinute - b.startCampaignMinute),
      },
    };
  }
  throw Error("Ferramenta de calendário desconhecida.");
}
