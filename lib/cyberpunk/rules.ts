import type {
  CyberpunkState,
  CyberpunkEra,
  Stats,
  Stat,
  CyberRoll,
  CyberPendingRoll,
} from "./types";
import {
  gregorianEpochMs,
  type CampaignCalendarDefinition,
} from "../campaignTime";
export const STAT_KEYS = [
  "int",
  "ref",
  "dex",
  "tech",
  "cool",
  "will",
  "luck",
  "move",
  "body",
  "emp",
] as const;
export const STAT_LABELS: Record<Stat, string> = {
  int: "Inteligência",
  ref: "Reflexos",
  dex: "Destreza",
  tech: "Técnica",
  cool: "Presença",
  will: "Vontade",
  luck: "Sorte",
  move: "Movimento",
  body: "Corpo",
  emp: "Empatia",
};
export const DEFAULT_STATS: Stats = {
  int: 6,
  ref: 8,
  dex: 6,
  tech: 6,
  cool: 6,
  will: 6,
  luck: 6,
  move: 6,
  body: 6,
  emp: 6,
};
export const BASIC_SKILLS = [
  "Athletics",
  "Brawling",
  "Concentration",
  "Conversation",
  "Education",
  "Evasion",
  "First Aid",
  "Human Perception",
  "Language (Streetslang)",
  "Local Expert (Your Home)",
  "Perception",
  "Persuasion",
  "Stealth",
];
export const maxHitPoints = (s: Stats) =>
  10 + 5 * Math.ceil((s.body + s.will) / 2);
export const netActionsPerTurn = (rank: number) =>
  rank >= 10 ? 5 : rank >= 7 ? 4 : rank >= 4 ? 3 : 2;
export const effectiveEmpathy = (s: CyberpunkState) =>
  Math.max(0, Math.min(s.stats.emp, Math.floor(s.humanity / 10)));
export function effectiveCyberStat(s: CyberpunkState, k: Stat) {
  const ids = Object.values(s.equippedArmor ?? {}),
    penalty = Math.max(
      0,
      ...s.inventory
        .filter((i) => ids.includes(i.id))
        .map((i) => i.armorPenalty ?? 0),
    );
  return k === "emp"
    ? effectiveEmpathy(s)
    : s.stats[k] - (["ref", "dex", "move"].includes(k) ? penalty : 0);
}
export function woundPenalty(s: CyberpunkState, minute: number) {
  if (
    s.inventory.some(
      (i) =>
        i.installed &&
        i.name === "Berserk Implant" &&
        (i.activeUntil ?? 0) > minute,
    )
  )
    return 0;
  return s.hp === 0 ? -4 : s.hp <= Math.ceil(s.maxHp / 2) ? -2 : 0;
}
export function diceValue(
  sides: number,
  random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
) {
  return Math.min(sides, Math.max(1, Math.floor(random() * sides) + 1));
}
export function resolveCyberCheck(
  modifier: number,
  target?: number,
  random?: () => number,
) {
  if (
    !Number.isFinite(modifier) ||
    (target !== undefined && !Number.isFinite(target))
  )
    throw Error("Teste inválido.");
  const first = diceValue(10, random),
    dice = [first];
  let total = modifier + first;
  if (first === 1 || first === 10) {
    const extra = diceValue(10, random);
    dice.push(extra);
    total += first === 1 ? -extra : extra;
  }
  return {
    dice,
    total,
    ...(target === undefined ? {} : { success: total > target }),
  };
}
export function makeCyberRoll(
  s: CyberpunkState,
  p: CyberPendingRoll,
  minute: number,
  random?: () => number,
): CyberRoll {
  const modifier = p.modifier ?? 0;
  if (["damage", "custom", "humanity"].includes(p.kind)) {
    const count = Math.max(1, Math.min(30, Math.trunc(p.count ?? 1))),
      sides = p.sides ?? 6;
    const dice = Array.from({ length: count }, () => diceValue(sides, random));
    return {
      id: crypto.randomUUID(),
      label: p.label,
      kind: p.kind,
      dice,
      sides,
      modifier,
      total: dice.reduce((a, b) => a + b, 0) + modifier,
      critical: p.kind === "damage" && dice.filter((d) => d === 6).length >= 2,
      campaignMinute: minute,
    };
  }
  if (p.kind === "death") {
    const die = diceValue(10, random),
      total = die + s.deathPenalty;
    return {
      id: crypto.randomUUID(),
      label: p.label,
      kind: p.kind,
      dice: [die],
      sides: 10,
      modifier: s.deathPenalty,
      total,
      success: die !== 10 && total < s.stats.body,
      campaignMinute: minute,
    };
  }
  return {
    id: crypto.randomUUID(),
    label: p.label,
    kind: p.kind,
    sides: 10,
    modifier,
    target: p.target,
    ...resolveCyberCheck(modifier, p.target, random),
    campaignMinute: minute,
  };
}
export function applyCyberDamage(
  s: CyberpunkState,
  raw: number,
  o: {
    location?: "body" | "head";
    halfArmor?: boolean;
    ignoreArmor?: boolean;
    ablation?: number;
    critical?: boolean;
    power?: boolean;
  } = {},
) {
  if (!Number.isFinite(raw) || raw < 0) throw Error("Dano inválido.");
  const location = o.location ?? "body",
    sp = s.armor[location],
    effective = o.ignoreArmor ? 0 : o.halfArmor ? Math.ceil(sp / 2) : sp,
    penetration = Math.max(0, Math.trunc(raw) - effective),
    bonus = o.critical ? (o.power && s.era === 2077 ? 10 : 5) : 0,
    damage = penetration * (location === "head" ? 2 : 1) + bonus,
    armor = { ...s.armor };
  if (penetration > 0 && !o.ignoreArmor)
    armor[location] = Math.max(0, sp - (o.ablation ?? 1));
  return {
    ...s,
    hp: Math.max(0, s.hp - damage),
    armor,
    inventory: s.inventory.map((i) =>
      i.id === s.equippedArmor?.[location]
        ? { ...i, [location === "body" ? "bodySp" : "headSp"]: armor[location] }
        : i,
    ),
    deathPenalty: s.deathPenalty + (s.hp === 0 && damage > 0 ? 1 : 0),
    injuries:
      o.critical || (s.hp === 0 && damage > 0)
        ? [...s.injuries, "Ferimento crítico — determinar na tabela"]
        : s.injuries,
  };
}
export function newCyberState(
  era: CyberpunkEra,
  stats: Stats,
  role: string,
  skills: Record<string, number>,
): CyberpunkState {
  const maxHp = maxHitPoints(stats),
    maxHumanity = stats.emp * 10;
  return {
    version: 1,
    era,
    stats: { ...stats },
    skills: { ...skills },
    nativeLanguage: "",
    role,
    roleRank: 4,
    history: "",
    hp: maxHp,
    maxHp,
    humanity: maxHumanity,
    maxHumanity,
    luck: stats.luck,
    eddies: 2550,
    ip: 0,
    reputation: 0,
    armor: { body: 0, head: 0 },
    injuries: [],
    deathPenalty: 0,
    dead: false,
    inventory: [],
    places: [],
    locationId: "",
    cityEvents: [],
    rolls: [],
    net: { turn: 1, actionsUsed: 0, meatAction: false, targets: [] },
  };
}
export function skillCost(s: Record<string, number>, d: Set<string>) {
  return Object.entries(s).reduce((n, [k, v]) => n + v * (d.has(k) ? 2 : 1), 0);
}
export function validateBuild(
  stats: Stats,
  skills: Record<string, number>,
  d: Set<string>,
) {
  const e: string[] = [];
  if (
    STAT_KEYS.some(
      (k) => !Number.isInteger(stats[k]) || stats[k] < 2 || stats[k] > 8,
    ) ||
    STAT_KEYS.reduce((n, k) => n + stats[k], 0) !== 62
  )
    e.push("Distribua 62 pontos de atributos, entre 2 e 8.");
  if (
    Object.values(skills).some((n) => !Number.isInteger(n) || n < 0 || n > 6) ||
    skillCost(skills, d) !== 86
  )
    e.push("Distribua 86 pontos de perícia, com máximo 6 e custos x2.");
  if (BASIC_SKILLS.some((k) => (skills[k] ?? 0) < 2))
    e.push("As 13 perícias básicas exigem pelo menos 2 níveis.");
  return e;
}
export function cyberDate(
  era: CyberpunkEra,
  minute: number,
  calendar?: CampaignCalendarDefinition,
) {
  const epoch =
    (calendar ? gregorianEpochMs(calendar) : undefined) ??
    Date.UTC(era, 0, 1, 20);
  return new Date(epoch + minute * 60000).toLocaleString("pt-BR", {
    timeZone: "UTC",
    dateStyle: "short",
    timeStyle: "short",
  });
}
