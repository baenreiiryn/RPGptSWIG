export type CyberpunkEra = 2045 | 2077;
export type Stat =
  | "int"
  | "ref"
  | "dex"
  | "tech"
  | "cool"
  | "will"
  | "luck"
  | "move"
  | "body"
  | "emp";
export type Stats = Record<Stat, number>;
export type CyberItem = {
  id: string;
  sourceId: string;
  name: string;
  type: string;
  qty: number;
  installed?: boolean;
  parentId?: string;
  ammo?: number;
  bodySp?: number;
  headSp?: number;
  armorPenalty?: number;
  activeUntil?: number;
  cooldownUntil?: number;
};
export type Place = {
  id: string;
  name: string;
  district: string;
  address: string;
  x: number;
  y: number;
  era: CyberpunkEra;
  precision: "district" | "landmark" | "custom";
  category?: string;
  streetPosition?: { x: number; y: number };
  mapLayer?: "atlas" | "streets";
  referenceUrl?: string;
};
export type CityEvent = {
  id: string;
  title: string;
  text: string;
  placeId: string;
  campaignMinute: number;
  npcIds: string[];
  questIds: string[];
};
export type CyberRoll = {
  id: string;
  label: string;
  kind: "skill" | "interface" | "damage" | "death" | "custom" | "humanity";
  dice: number[];
  sides: number;
  modifier: number;
  total: number;
  target?: number;
  success?: boolean;
  critical?: boolean;
  campaignMinute: number;
};
export type HackTarget = {
  id: string;
  name: string;
  neuroport: boolean;
  visible: boolean;
  distance: number;
  will: number;
  selfIce: number;
  breached: number;
  connected: boolean;
  aware: boolean;
  blockedUntil?: number;
  lastHackTurn?: number;
  effects: { name: string; expires: number }[];
};
export type CyberPendingRoll = {
  id: string;
  label: string;
  kind: CyberRoll["kind"];
  stat?: Stat;
  skill?: string;
  modifier?: number;
  target?: number;
  count?: number;
  sides?: 6 | 10;
  targetId?: string;
  netAction?: "jack" | "breach" | "quickhack";
  quickhackId?: string;
  itemId?: string;
  parentId?: string;
};
export type CyberpunkState = {
  version: 1;
  era: CyberpunkEra;
  stats: Stats;
  skills: Record<string, number>;
  nativeLanguage: string;
  role: string;
  roleRank: number;
  history: string;
  preferredQuickhacks?: string[];
  hp: number;
  maxHp: number;
  humanity: number;
  maxHumanity: number;
  luck: number;
  eddies: number;
  ip: number;
  reputation: number;
  armor: { body: number; head: number };
  equippedArmor?: { body?: string; head?: string };
  injuries: string[];
  deathPenalty: number;
  dead: boolean;
  inventory: CyberItem[];
  places: Place[];
  locationId: string;
  cityEvents: CityEvent[];
  rolls: CyberRoll[];
  pending?: CyberPendingRoll;
  net: {
    turn: number;
    actionsUsed: number;
    meatAction: boolean;
    physicalAttacks?: number;
    physicalLimit?: number;
    targets: HackTarget[];
  };
  recovery?: {
    text: string;
    input: unknown[];
    applied: { callId: string; name: string; args: string; result: unknown }[];
  };
};
