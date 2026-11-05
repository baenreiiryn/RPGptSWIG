export const MINUTES_PER_HOUR = 60;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_DAY = MINUTES_PER_HOUR * HOURS_PER_DAY;

export type CalendarMonth = {
  id: string;
  name: string;
  days: number;
};

export type CalendarWeekday = {
  id: string;
  name: string;
};

export type CalendarMoon = {
  id: string;
  name: string;
  cycleDays: number;
  phaseOffsetDays: number;
};

export type CampaignCalendarDefinition = {
  id: string;
  name: string;
  epochYear: number;
  /** Civil UTC date represented by campaign minute zero (Gregorian calendars only). */
  gregorianEpoch?: string;
  weekdays: CalendarWeekday[];
  months: CalendarMonth[];
  moons: CalendarMoon[];
};

export type WeatherCondition =
  | "clear"
  | "partly-cloudy"
  | "cloudy"
  | "rain"
  | "storm"
  | "snow"
  | "fog"
  | "wind"
  | "custom";

export type CampaignWeather = {
  condition: WeatherCondition;
  label: string;
  description?: string;
  temperatureC?: number;
  intensity?: "light" | "moderate" | "heavy";
  updatedAtCampaignMinute: number;
};

export type CalendarEventKind = "quest" | "effect" | "appointment" | "world" | "custom";

export type CampaignCalendarEvent = {
  id: string;
  title: string;
  startCampaignMinute: number;
  endCampaignMinute?: number;
  kind?: CalendarEventKind;
  sourceId?: string;
  description?: string;
  completed?: boolean;
};

export type CampaignTimeState = {
  calendar: CampaignCalendarDefinition;
  campaignMinute: number;
  weather: CampaignWeather;
  events: CampaignCalendarEvent[];
};

export type CampaignDayPeriod = "dawn" | "day" | "dusk" | "night";

export type CampaignDateTime = {
  year: number;
  monthIndex: number;
  month: CalendarMonth;
  day: number;
  dayOfYear: number;
  absoluteDay: number;
  weekdayIndex: number;
  weekday: CalendarWeekday;
  hour: number;
  minute: number;
  period: CampaignDayPeriod;
};

export type CampaignDateInput = {
  year: number;
  monthIndex: number;
  day: number;
  hour?: number;
  minute?: number;
};

export type MoonPhaseKey =
  | "new"
  | "waxing-crescent"
  | "first-quarter"
  | "waxing-gibbous"
  | "full"
  | "waning-gibbous"
  | "last-quarter"
  | "waning-crescent";

export type CampaignMoonPhase = {
  moon: CalendarMoon;
  phase: MoonPhaseKey;
  label: string;
  ageDays: number;
  illumination: number;
};

export type RemainingDuration = {
  targetCampaignMinute: number;
  signedMinutes: number;
  totalMinutes: number;
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
};

type RandomSource = () => number;
type CalendarOrTime = CampaignCalendarDefinition | CampaignTimeState;

const PHASES: Array<{ key: MoonPhaseKey; label: string }> = [
  { key: "new", label: "Lua nova" },
  { key: "waxing-crescent", label: "Crescente" },
  { key: "first-quarter", label: "Quarto crescente" },
  { key: "waxing-gibbous", label: "Gibosa crescente" },
  { key: "full", label: "Lua cheia" },
  { key: "waning-gibbous", label: "Gibosa minguante" },
  { key: "last-quarter", label: "Quarto minguante" },
  { key: "waning-crescent", label: "Minguante" },
];

const WEATHER_LABELS: Record<WeatherCondition, string> = {
  clear: "Céu limpo",
  "partly-cloudy": "Sol entre nuvens",
  cloudy: "Nublado",
  rain: "Chuva",
  storm: "Tempestade",
  snow: "Neve",
  fog: "Neblina",
  wind: "Ventania",
  custom: "Clima incomum",
};

const NAME_STARTS = ["Ae", "Ar", "Bel", "Cael", "Dra", "El", "Fae", "Gal", "Ith", "Ka", "Lun", "Mor", "Nae", "Or", "Ryn", "Syl", "Tha", "Vael", "Yra", "Ze"];
const NAME_ENDS = ["dor", "eth", "ia", "ion", "is", "ora", "os", "une", "yr", "ara", "en", "iel", "ath", "or", "yn"];

function hashSeed(seed: string | number) {
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string | number): RandomSource {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(random: RandomSource, min: number, max: number) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pickNonGregorianCount(random: RandomSource, min: number, max: number, gregorianCount: number) {
  const values = Array.from({ length: max - min + 1 }, (_, index) => min + index).filter((value) => value !== gregorianCount);
  return values[randomInt(random, 0, values.length - 1)];
}

function fantasyName(random: RandomSource, used: Set<string>) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const name = `${NAME_STARTS[randomInt(random, 0, NAME_STARTS.length - 1)]}${NAME_ENDS[randomInt(random, 0, NAME_ENDS.length - 1)]}`;
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  const fallback = `Era${used.size + 1}`;
  used.add(fallback);
  return fallback;
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function randomId(prefix: string) {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return randomUuid ? `${prefix}-${randomUuid}` : `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function calendarOf(source: CalendarOrTime) {
  return "calendar" in source ? source.calendar : source;
}

function minuteOf(source: CalendarOrTime, campaignMinute?: number) {
  if (campaignMinute !== undefined) return normalizeCampaignMinute(campaignMinute);
  return "calendar" in source ? normalizeCampaignMinute(source.campaignMinute) : 0;
}

function normalizeCampaignMinute(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function yearLengthDays(calendar: CampaignCalendarDefinition) {
  return calendar.months.reduce((total, month) => total + month.days, 0);
}

function assertCalendar(calendar: CampaignCalendarDefinition) {
  if (!calendar.months.length) throw new Error("Calendar must contain at least one month.");
  if (!calendar.weekdays.length) throw new Error("Calendar must contain at least one weekday.");
  if (calendar.months.some((month) => month.days < 1)) throw new Error("Calendar months must contain at least one day.");
}

export function generateCalendarDefinition(seed?: string | number): CampaignCalendarDefinition {
  const random = seed === undefined ? Math.random : seededRandom(seed);
  const usedNames = new Set<string>();
  const monthCount = pickNonGregorianCount(random, 8, 14, 12);
  const weekdayCount = pickNonGregorianCount(random, 5, 14, 7);
  const moonCount = randomInt(random, 1, 3);
  const name = `Ciclo de ${fantasyName(random, usedNames)}`;
  const idBase = slug(name);

  const months = Array.from({ length: monthCount }, (_, index) => {
    const monthName = fantasyName(random, usedNames);
    return {
      id: `${idBase}-month-${index + 1}`,
      name: monthName,
      days: randomInt(random, 20, 60),
    };
  });

  const weekdays = Array.from({ length: weekdayCount }, (_, index) => ({
    id: `${idBase}-weekday-${index + 1}`,
    name: fantasyName(random, usedNames),
  }));

  const moons = Array.from({ length: moonCount }, (_, index) => ({
    id: `${idBase}-moon-${index + 1}`,
    name: fantasyName(random, usedNames),
    cycleDays: randomInt(random, 18, 48),
    phaseOffsetDays: randomInt(random, 0, 17),
  }));

  return {
    id: idBase,
    name,
    epochYear: randomInt(random, 180, 980),
    weekdays,
    months,
    moons,
  };
}

export function createCampaignTimeState(options: {
  seed?: string | number;
  calendar?: CampaignCalendarDefinition;
  campaignMinute?: number;
  weather?: Partial<Omit<CampaignWeather, "updatedAtCampaignMinute">>;
  events?: CampaignCalendarEvent[];
} = {}): CampaignTimeState {
  const calendar = options.calendar ?? generateCalendarDefinition(options.seed);
  assertCalendar(calendar);
  const campaignMinute = normalizeCampaignMinute(options.campaignMinute ?? 0);
  return {
    calendar: structuredClone(calendar),
    campaignMinute,
    weather: {
      condition: options.weather?.condition ?? "clear",
      label: options.weather?.label ?? WEATHER_LABELS[options.weather?.condition ?? "clear"],
      description: options.weather?.description,
      temperatureC: options.weather?.temperatureC,
      intensity: options.weather?.intensity,
      updatedAtCampaignMinute: campaignMinute,
    },
    events: structuredClone(options.events ?? []).sort((a, b) => a.startCampaignMinute - b.startCampaignMinute),
  };
}

export function gregorianEpochMs(calendar: CampaignCalendarDefinition): number | undefined {
  // Older Night City saves used this same origin without storing it explicitly.
  if (!calendar.gregorianEpoch && !/^gregorian-(2045|2077)$/.test(calendar.id)) return undefined;
  const epoch = calendar.gregorianEpoch ? Date.parse(calendar.gregorianEpoch) : Date.UTC(calendar.epochYear, 0, 1, 20);
  if (!Number.isFinite(epoch) || calendar.months.length !== 12 || calendar.weekdays.length !== 7)
    throw new Error("Calendário gregoriano inválido.");
  return epoch;
}

export function campaignMinuteFromDate(calendar: CampaignCalendarDefinition, input: CampaignDateInput) {
  assertCalendar(calendar);
  const epoch = gregorianEpochMs(calendar);
  if (epoch !== undefined) {
    const { year, monthIndex, day, hour = 0, minute = 0 } = input;
    if (![year, monthIndex, day, hour, minute].every(Number.isInteger) || year < calendar.epochYear || year > 9999 || monthIndex < 0 || monthIndex > 11 || day < 1 || hour < 0 || hour > 23 || minute < 0 || minute > 59)
      throw new Error("Data ou horário inválido.");
    const value = Date.UTC(year, monthIndex, day, hour, minute);
    const date = new Date(value);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== monthIndex || date.getUTCDate() !== day)
      throw new Error("Dia inválido para este mês.");
    return (value - epoch) / 60000;
  }
  if (!Number.isInteger(input.year) || input.year < calendar.epochYear) throw new Error(`Year must be ${calendar.epochYear} or later.`);
  const month = calendar.months[input.monthIndex];
  if (!month) throw new Error("Month index is outside this calendar.");
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > month.days) throw new Error(`Day must be between 1 and ${month.days}.`);
  const hour = input.hour ?? 0;
  const minute = input.minute ?? 0;
  if (!Number.isInteger(hour) || hour < 0 || hour >= HOURS_PER_DAY) throw new Error("Hour must be between 0 and 23.");
  if (!Number.isInteger(minute) || minute < 0 || minute >= MINUTES_PER_HOUR) throw new Error("Minute must be between 0 and 59.");

  const yearsSinceEpoch = input.year - calendar.epochYear;
  const daysBeforeYear = yearsSinceEpoch * yearLengthDays(calendar);
  const daysBeforeMonth = calendar.months.slice(0, input.monthIndex).reduce((total, entry) => total + entry.days, 0);
  const absoluteDay = daysBeforeYear + daysBeforeMonth + input.day - 1;
  return absoluteDay * MINUTES_PER_DAY + hour * MINUTES_PER_HOUR + minute;
}

export function deriveCampaignDateTime(source: CalendarOrTime, campaignMinute?: number): CampaignDateTime {
  const calendar = calendarOf(source);
  assertCalendar(calendar);
  const minuteValue = minuteOf(source, campaignMinute);
  const epoch = gregorianEpochMs(calendar);
  if (epoch !== undefined) {
    const date = new Date(epoch + minuteValue * 60000);
    const year = date.getUTCFullYear();
    const monthIndex = date.getUTCMonth();
    const day = date.getUTCDate();
    const hour = date.getUTCHours();
    const minute = date.getUTCMinutes();
    const weekdayIndex = date.getUTCDay();
    return {
      year,
      monthIndex,
      month: { ...calendar.months[monthIndex], days: new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate() },
      day,
      dayOfYear: Math.floor((Date.UTC(year, monthIndex, day) - Date.UTC(year, 0, 1)) / 86400000) + 1,
      absoluteDay: Math.floor(date.getTime() / 86400000) - Math.floor(epoch / 86400000),
      weekdayIndex,
      weekday: calendar.weekdays[weekdayIndex],
      hour,
      minute,
      period: hour >= 5 && hour < 7 ? "dawn" : hour >= 7 && hour < 18 ? "day" : hour >= 18 && hour < 20 ? "dusk" : "night",
    };
  }
  const absoluteDay = Math.floor(minuteValue / MINUTES_PER_DAY);
  const minuteOfDay = minuteValue % MINUTES_PER_DAY;
  const daysInYear = yearLengthDays(calendar);
  const yearsSinceEpoch = Math.floor(absoluteDay / daysInYear);
  const dayOfYearIndex = absoluteDay % daysInYear;
  let remainingDays = dayOfYearIndex;
  let monthIndex = 0;
  while (monthIndex < calendar.months.length - 1 && remainingDays >= calendar.months[monthIndex].days) {
    remainingDays -= calendar.months[monthIndex].days;
    monthIndex += 1;
  }
  const hour = Math.floor(minuteOfDay / MINUTES_PER_HOUR);
  const minute = minuteOfDay % MINUTES_PER_HOUR;
  const weekdayIndex = absoluteDay % calendar.weekdays.length;
  const period: CampaignDayPeriod = hour >= 5 && hour < 7 ? "dawn" : hour >= 7 && hour < 18 ? "day" : hour >= 18 && hour < 20 ? "dusk" : "night";

  return {
    year: calendar.epochYear + yearsSinceEpoch,
    monthIndex,
    month: calendar.months[monthIndex],
    day: remainingDays + 1,
    dayOfYear: dayOfYearIndex + 1,
    absoluteDay,
    weekdayIndex,
    weekday: calendar.weekdays[weekdayIndex],
    hour,
    minute,
    period,
  };
}

export function formatCampaignDateTime(
  source: CalendarOrTime,
  campaignMinute?: number,
  options: { includeWeekday?: boolean; includeTime?: boolean } = {},
) {
  const date = deriveCampaignDateTime(source, campaignMinute);
  const includeWeekday = options.includeWeekday ?? true;
  const includeTime = options.includeTime ?? true;
  const weekday = includeWeekday ? `${date.weekday.name}, ` : "";
  const time = includeTime ? ` · ${String(date.hour).padStart(2, "0")}:${String(date.minute).padStart(2, "0")}` : "";
  return `${weekday}${date.day} de ${date.month.name}, ${date.year}${time}`;
}

export function getMoonPhases(source: CalendarOrTime, campaignMinute?: number): CampaignMoonPhase[] {
  const calendar = calendarOf(source);
  const date = deriveCampaignDateTime(source, campaignMinute);
  return calendar.moons.map((moon) => {
    const cycleDays = Math.max(1, moon.cycleDays);
    const ageDays = ((date.absoluteDay + moon.phaseOffsetDays) % cycleDays + cycleDays) % cycleDays;
    const progress = ageDays / cycleDays;
    const phaseIndex = Math.floor(progress * PHASES.length + 0.5) % PHASES.length;
    const phase = PHASES[phaseIndex];
    const illumination = (1 - Math.cos(progress * Math.PI * 2)) / 2;
    return {
      moon,
      phase: phase.key,
      label: phase.label,
      ageDays,
      illumination,
    };
  });
}

export function advanceCampaignTime(state: CampaignTimeState, minutes: number): CampaignTimeState {
  if (!Number.isFinite(minutes)) return state;
  return {
    ...state,
    campaignMinute: normalizeCampaignMinute(state.campaignMinute + Math.trunc(minutes)),
  };
}

export function setCampaignTime(state: CampaignTimeState, value: number | Partial<CampaignDateInput>): CampaignTimeState {
  if (typeof value === "number") {
    return { ...state, campaignMinute: normalizeCampaignMinute(value) };
  }
  const current = deriveCampaignDateTime(state);
  const campaignMinute = campaignMinuteFromDate(state.calendar, {
    year: value.year ?? current.year,
    monthIndex: value.monthIndex ?? current.monthIndex,
    day: value.day ?? current.day,
    hour: value.hour ?? current.hour,
    minute: value.minute ?? current.minute,
  });
  return { ...state, campaignMinute };
}

export function setCampaignWeather(
  state: CampaignTimeState,
  weather: Omit<CampaignWeather, "updatedAtCampaignMinute"> | (Partial<Omit<CampaignWeather, "updatedAtCampaignMinute">> & Pick<CampaignWeather, "condition">),
): CampaignTimeState {
  return {
    ...state,
    weather: {
      ...state.weather,
      ...weather,
      label: weather.label ?? WEATHER_LABELS[weather.condition],
      updatedAtCampaignMinute: state.campaignMinute,
    },
  };
}

export function addCalendarEvent(
  state: CampaignTimeState,
  event: Omit<CampaignCalendarEvent, "id"> & { id?: string },
): CampaignTimeState {
  const next: CampaignCalendarEvent = {
    ...event,
    id: event.id ?? randomId("calendar-event"),
    startCampaignMinute: normalizeCampaignMinute(event.startCampaignMinute),
    endCampaignMinute: event.endCampaignMinute === undefined ? undefined : normalizeCampaignMinute(event.endCampaignMinute),
  };
  if (next.endCampaignMinute !== undefined && next.endCampaignMinute < next.startCampaignMinute) {
    throw new Error("Calendar event end must be at or after its start.");
  }
  return {
    ...state,
    events: [...state.events, next].sort((a, b) => a.startCampaignMinute - b.startCampaignMinute),
  };
}

export function updateCalendarEvent(
  state: CampaignTimeState,
  eventId: string,
  changes: Partial<Omit<CampaignCalendarEvent, "id">>,
): CampaignTimeState {
  let found = false;
  const events = state.events.map((event) => {
    if (event.id !== eventId) return event;
    found = true;
    const changesEnd = Object.prototype.hasOwnProperty.call(changes, "endCampaignMinute");
    const next = {
      ...event,
      ...changes,
      startCampaignMinute: changes.startCampaignMinute === undefined ? event.startCampaignMinute : normalizeCampaignMinute(changes.startCampaignMinute),
      endCampaignMinute: changesEnd
        ? changes.endCampaignMinute === undefined
          ? undefined
          : normalizeCampaignMinute(changes.endCampaignMinute)
        : event.endCampaignMinute,
    };
    if (next.endCampaignMinute !== undefined && next.endCampaignMinute < next.startCampaignMinute) {
      throw new Error("Calendar event end must be at or after its start.");
    }
    return next;
  });
  if (!found) return state;
  return { ...state, events: events.sort((a, b) => a.startCampaignMinute - b.startCampaignMinute) };
}

export function removeCalendarEvent(state: CampaignTimeState, eventId: string): CampaignTimeState {
  if (!state.events.some((event) => event.id === eventId)) return state;
  return { ...state, events: state.events.filter((event) => event.id !== eventId) };
}

export function remainingDuration(
  source: CampaignTimeState | number,
  target: CampaignCalendarEvent | number,
): RemainingDuration {
  const currentMinute = typeof source === "number" ? normalizeCampaignMinute(source) : source.campaignMinute;
  const targetCampaignMinute = typeof target === "number"
    ? normalizeCampaignMinute(target)
    : target.endCampaignMinute ?? target.startCampaignMinute;
  const signedMinutes = targetCampaignMinute - currentMinute;
  let totalMinutes = Math.max(0, signedMinutes);
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  totalMinutes -= days * MINUTES_PER_DAY;
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes - hours * MINUTES_PER_HOUR;
  return {
    targetCampaignMinute,
    signedMinutes,
    totalMinutes: Math.max(0, signedMinutes),
    expired: signedMinutes <= 0,
    days,
    hours,
    minutes,
  };
}

export function createDemoCampaignTimeState(): CampaignTimeState {
  const calendar = generateCalendarDefinition("oracle-rpg-demo-calendar");
  const campaignMinute = campaignMinuteFromDate(calendar, {
    year: calendar.epochYear + 6,
    monthIndex: Math.min(4, calendar.months.length - 1),
    day: 9,
    hour: 16,
    minute: 40,
  });
  return createCampaignTimeState({
    calendar,
    campaignMinute,
    weather: {
      condition: "partly-cloudy",
      label: "Sol entre nuvens",
      description: "Nuvens altas atravessam um céu ainda claro.",
      temperatureC: 18,
      intensity: "light",
    },
  });
}
