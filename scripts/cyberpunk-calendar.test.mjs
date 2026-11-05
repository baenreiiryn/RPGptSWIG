import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
registerHooks({
  resolve(s, c, next) {
    if (s.startsWith("@/"))
      return next(
        pathToFileURL(
          path.join(process.cwd(), s.slice(2)) +
            (/\.[a-z0-9]+$/i.test(s) ? "" : ".ts"),
        ).href,
        c,
      );
    if ((s.startsWith("./") || s.startsWith("../")) && !/\.[a-z0-9]+$/i.test(s))
      return next(s + ".ts", c);
    return next(s, c);
  },
});
const { buildCyberCampaign, suggestedCyberSkills } = await import(
  "../lib/cyberpunk/state.ts"
);
const { DEFAULT_STATS, cyberDate } = await import("../lib/cyberpunk/rules.ts");
const { executeCyberTool, runCyberTurn } = await import(
  "../lib/cyberpunk/gm.ts"
);
const { deriveCampaignDateTime, campaignMinuteFromDate } = await import(
  "../lib/campaignTime.ts"
);
const {
  createCampaignRestartSnapshot,
  restartCampaignFromSnapshot,
  ensureGameStateCharacterModel,
} = await import("../lib/game.ts");
const fresh = (era = 2077) =>
  buildCyberCampaign({
    era,
    campaignName: "Calendar",
    name: "Merc",
    tone: "Noir",
    hook: "Job",
    stats: { ...DEFAULT_STATS },
    skills: suggestedCyberSkills("Netrunner"),
    role: "Netrunner",
    history: "Past",
    nativeLanguage: "Português",
    items: [],
    neuroport: true,
  });
const opening = {
  month: 6,
  day: 21,
  hour: 18,
  minute: 30,
  condition: "fog",
  label: "Névoa industrial",
  description: "Visibilidade baixa entre os prédios.",
  temperatureC: 16,
};
const start = (g = fresh(), args = opening) =>
  executeCyberTool(g, "calendar_start", args).state;

test("the GM chooses the opening date and weather, with the era fixed", () => {
  const g = fresh();
  assert.equal(g.cyberpunk.calendarInitialized, false);
  assert.equal(g.time.weather.label, "Clima a definir");
  const next = start(g);
  const date = deriveCampaignDateTime(next.time);
  assert.deepEqual(
    [date.year, date.monthIndex, date.day, date.hour, date.minute],
    [2077, 5, 21, 18, 30],
  );
  assert.equal(date.weekdayIndex, new Date(Date.UTC(2077, 5, 21)).getUTCDay());
  assert.equal(next.time.campaignMinute, 0);
  assert.equal(next.time.weather.condition, "fog");
  assert.equal(next.time.weather.temperatureC, 16);
  assert.match(cyberDate(2077, 0, next.time.calendar), /21\/06\/2077/);
  assert.equal(deriveCampaignDateTime(start(fresh(2045)).time).year, 2045);
  assert.throws(() => start(next), /definido/);
  assert.throws(() => start(fresh(), { ...opening, year: 2099 }), /ano/i);
});

test("invalid dates and weather cannot initialize or mutate the campaign", () => {
  const g = fresh();
  for (const args of [
    { month: 2, day: 30 },
    { month: 13 },
    { month: 1.5 },
    { day: 0 },
    { hour: 24 },
    { minute: -1 },
    { condition: "lava" },
    { temperatureC: NaN },
    { label: " " },
  ]) {
    assert.throws(() => start(g, { ...opening, ...args }));
  }
  assert.equal(g.cyberpunk.calendarInitialized, false);
});

test("Gregorian rollover, leap years and dated memories share the opening epoch", () => {
  let g = start(fresh(), {
    ...opening,
    month: 12,
    day: 31,
    hour: 23,
    minute: 59,
  });
  g = executeCyberTool(g, "advance_time", { minutes: 2 }).state;
  assert.equal(cyberDate(2077, 2, g.time.calendar), "01/01/2078, 00:01");
  assert.equal(deriveCampaignDateTime(g.time).absoluteDay, 1);
  g = executeCyberTool(g, "remember", {
    title: "Encontro",
    text: "No bar.",
  }).state;
  assert.equal(g.cyberpunk.cityEvents[0].campaignMinute, 2);
  const epoch = {
    ...g.time.calendar,
    gregorianEpoch: "2080-02-28T23:59:00.000Z",
  };
  assert.equal(deriveCampaignDateTime(epoch, 2).day, 29);
  assert.equal(
    campaignMinuteFromDate(epoch, {
      year: 2080,
      monthIndex: 1,
      day: 29,
      hour: 0,
      minute: 1,
    }),
    2,
  );
  assert.throws(() =>
    campaignMinuteFromDate(g.time.calendar, {
      year: 2078,
      monthIndex: 1,
      day: 30,
    }),
  );
  const turn = executeCyberTool(g, "next_turn", {}).state;
  assert.equal(turn.time.campaignMinute, 2.05);
});

test("weather changes and future appointments survive save, reopen and restart", () => {
  let g = fresh();
  g.campaign.restartSnapshot = createCampaignRestartSnapshot(g);
  g = start(g);
  g = executeCyberTool(g, "advance_time", { minutes: 90 }).state;
  g = executeCyberTool(g, "weather_set", {
    condition: "rain",
    label: "Chuva ácida",
    temperatureC: 12,
  }).state;
  assert.equal(g.time.weather.updatedAtCampaignMinute, 90);
  g = executeCyberTool(g, "calendar_event_add", {
    title: "Encontrar fixer",
    month: 6,
    day: 22,
    hour: 9,
    minute: 0,
    description: "Afterlife",
  }).state;
  assert.equal(g.time.events.length, 1);
  assert.equal(
    cyberDate(2077, g.time.events[0].startCampaignMinute, g.time.calendar),
    "22/06/2077, 09:00",
  );
  assert.throws(() =>
    executeCyberTool(g, "calendar_event_add", {
      title: "Passado",
      month: 6,
      day: 20,
      hour: 9,
      minute: 0,
    }),
  );
  const reopened = ensureGameStateCharacterModel(JSON.parse(JSON.stringify(g)));
  assert.equal(reopened.time.weather.label, "Chuva ácida");
  assert.equal(ensureGameStateCharacterModel(reopened), reopened);
  const reset = restartCampaignFromSnapshot(reopened);
  assert.equal(reset.time.campaignMinute, 0);
  assert.equal(reset.cyberpunk.calendarInitialized, true);
  assert.equal(reset.time.weather.label, opening.label);
  assert.match(cyberDate(2077, 0, reset.time.calendar), /21\/06\/2077/);
});

test("legacy campaigns retain Jan 1 at 20:00 without replacing history", () => {
  const legacy = fresh();
  delete legacy.cyberpunk.calendarInitialized;
  delete legacy.time.calendar.gregorianEpoch;
  legacy.time.campaignMinute = 75;
  assert.match(
    cyberDate(2077, 75, legacy.time.calendar),
    /01\/01\/2077, 21:15/,
  );
  assert.equal(deriveCampaignDateTime(legacy.time).hour, 21);
  assert.throws(() => start(legacy), /definido/);
});

test("opening requires the calendar tool before narrative and preserves it on retry", async () => {
  let g = fresh(),
    n = 0;
  await assert.rejects(
    runCyberTurn(
      g,
      "Comece",
      async (p) => {
        if (n++ === 0) {
          assert.deepEqual(p.toolChoice, {
            type: "function",
            name: "calendar_start",
          });
          return { output_text: "Ainda sem calendário." };
        }
        if (n === 2)
          return {
            output: [
              {
                type: "function_call",
                name: "calendar_start",
                call_id: "start",
                arguments: JSON.stringify(opening),
              },
            ],
          };
        throw Error("Rede interrompida");
      },
      "mock",
      (s) => {
        g = s;
      },
    ),
    /Rede interrompida/,
  );
  assert.equal(g.cyberpunk.calendarInitialized, true);
  const epoch = g.time.calendar.gregorianEpoch;
  const recovered = await runCyberTurn(
    JSON.parse(JSON.stringify(g)),
    "Comece",
    async () => ({ output_text: "A névoa cobre Night City." }),
    "mock",
    () => {},
  );
  assert.equal(recovered.state.time.calendar.gregorianEpoch, epoch);
  assert.equal(recovered.state.cyberpunk.recovery, undefined);
});
