export type SessionRestRule = {
  useLimit?: number;
  refreshAt?: "longRestEnd";
  expiresAt?: "longRestStart";
  initializesAt?: "longRestEnd";
};

/** Oracle house rule. Source files stay unchanged; imports use one shared conversion. */
export function sessionRuleText(text: string): string {
  return text
    .replace(/no\s+in[ií]cio\s+(?:de\s+cada|da)\s+sess[aã]o/gi, "Ao terminar um descanso longo")
    .replace(/no\s+fim\s+(?:de\s+cada|da)\s+sess[aã]o/gi, "Ao iniciar um descanso longo")
    .replace(/at[eé]\s+o\s+fim\s+(?:de\s+cada|da)\s+sess[aã]o/gi, match => `${match[0] === "A" ? "Até" : "até"} iniciar um descanso longo`)
    .replace(/at[eé]\s+a\s+pr[oó]xima\s+sess[aã]o/gi, "até terminar o próximo descanso longo")
    .replace(/por\s+sess[aã]o/gi, "por descanso longo")
    .replace(/at the (?:start|beginning) of (?:each |the )?session/gi, "after completing a long rest")
    .replace(/at the end of (?:each |the )?session/gi, "when starting a long rest")
    .replace(/until the end of (?:the )?session/gi, "until starting a long rest")
    .replace(/per session/gi, "per long rest");
}

export function applySessionRestRule<T extends {
  sourceId?: string; description: string; mechanics: { frequency: string[] }; sessionRest?: SessionRestRule;
}>(entry: T): T & { sessionRest?: SessionRestRule } {
  if (!/sess[aã]o|session/i.test(entry.description)) return entry;
  const text = entry.description.replace(/\s+/g, " ");
  const rule: SessionRestRule = {};
  const limited = /\b(uma|duas|tr[eê]s) vez(?:es)? por sess[aã]o/i.exec(text);
  if (limited && !["Invigoration", "Reliable Backup"].includes(entry.sourceId || "")) {
    rule.useLimit = /tr[eê]s/i.test(limited[1]) ? 3 : limited[1].toLowerCase() === "duas" ? 2 : 1;
  }
  if (/adicional por sess[aã]o/i.test(text)) rule.useLimit = 1;
  if (rule.useLimit) rule.refreshAt = "longRestEnd";
  if (/fim (?:de cada|da) sess[aã]o/i.test(text)) rule.expiresAt = "longRestStart";
  if (/in[ií]cio (?:de cada|da) sess[aã]o/i.test(text)) rule.initializesAt = "longRestEnd";
  return {
    ...entry,
    description: sessionRuleText(entry.description),
    mechanics: { ...entry.mechanics, frequency: [...new Set(entry.mechanics.frequency.map(sessionRuleText))] },
    sessionRest: rule,
  };
}
