"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildContextPacket,
  createCampaignRestartSnapshot,
  chooseDeathMove,
  ensureGameStateCrafting,
  ensureGameStateCharacterModel,
  ensureGameStateTimeline,
  executeCommand,
  GameState,
  initialState,
  Message,
  resolveLastGloryDeath,
  resolvePendingRoll,
  spendDeathRecoveryPoint,
  timelineNeedsNarrativeSynthesis,
  timelineWithoutLegacyGeneratedEntries,
  type DiceType,
  type CharacterState,
  type CharacterTracker,
  type InventoryItem,
  restartCampaignFromSnapshot,
  undoLatest,
} from "@/lib/game";
import {
  readCloudCredentialsForCampaign,
  removeCloudMetadataForCampaign,
  writeCloudCredentialsForCampaign,
  useCloudSync,
} from "@/hooks/useCloudSync";
import { useOracleBridge } from "@/hooks/useOracleBridge";
import { buildCampaignOpeningPrompt, extractNarration, extractRefusal, gmInstructions } from "@/lib/gm";
import { runGmTurn } from "@/lib/gmTurn";
import { buildSceneImagePrompt, buildSceneSnapshot, formatNarrationText, latestGmMessage } from "@/lib/scene";
import { buildSceneWebImageSearchPrompt, describeSceneWebImageError, extractSceneWebImage } from "@/lib/sceneWebImage";
import DaggerheartCompendium from "@/components/DaggerheartCompendium";
import CompendiumArt from "@/components/CompendiumArt";
import EquipmentArt from "@/components/EquipmentArt";
import NewCampaignWizard, { type NewCampaignResult } from "@/components/NewCampaignWizard";
import DaggerheartLevelUpWizard from "@/components/DaggerheartLevelUpWizard";
import { TRAIT_LABELS, TRAIT_ORDER } from "@/lib/characterCreation/daggerheart";
import {
  availableBeastformsForCharacter,
  canUseBeastform,
  daggerheartTierForLevel,
  effectiveCharacterEvasion,
  effectiveCharacterTraits,
} from "@/lib/daggerheartCharacter";
import {
  completePendingDaggerheartLevelUp,
  type DaggerheartLevelUpPlan,
} from "@/lib/daggerheartAdvancement";
import { daggerheartCompendium, mechanicsSummary, type CompendiumEntry } from "@/lib/compendium/daggerheart";
import {
  campaignMinuteFromDate,
  createCampaignTimeState,
  deriveCampaignDateTime,
  formatCampaignDateTime,
  getMoonPhases,
  remainingDuration,
  setCampaignTime,
  setCampaignWeather,
  updateCalendarEvent,
  type CampaignCalendarEvent,
  type CampaignTimeState,
  type WeatherCondition,
} from "@/lib/campaignTime";
import {
  ACTIVE_CAMPAIGN_KEY,
  campaignActivityAt,
  type CampaignLibraryEntry,
  migrateLegacyCampaign,
  readCampaignLibrary,
  sortCampaigns,
  writeCampaignLibrary,
} from "@/lib/campaignLibrary";
import DiceOverlay from "@/components/DiceOverlay";
import DiceAppearanceSettings from "@/components/DiceAppearanceSettings";
import CampaignTimeline from "@/components/CampaignTimeline";
import CraftingWorkshop, { type CraftingWorkshopSlot } from "@/components/CraftingWorkshop";
import {
  buildTimelineSynthesisPrompt,
  mergeTimelineEntries,
  parseTimelineSynthesis,
  TIMELINE_SCHEMA_VERSION,
  upsertManualTimelineEntry,
} from "@/lib/timeline";
import {
  beginCraftAttempt,
  canCraftRarity,
  craftLevelForXp,
  craftSuccessChanceFor,
  createInitialCraftingState,
  findMatchingRecipe,
  rejectCraftAttempt,
  resolveCraftAttempt,
  type CraftDiscipline,
  type CraftIngredient,
  type CraftRarity,
} from "@/lib/crafting";
import { countOccupiedCraftSlots } from "@/lib/craftingUi";
import {
  dualityFormulaFromCommand,
  normalizeDiceAppearanceFonts,
  parseDiceFormula,
  rollDice,
  type DiceAppearanceOverrides,
  type DiceAppearanceRole,
  type DiceRollResult,
  type DieSides,
} from "@/lib/dice";

type View = "session" | "character" | "craft" | "world" | "memory";
type AppScreen = "home" | "campaigns" | "campaign" | "newCampaign" | "compendium" | "settings" | "diceAppearance";
type CampaignAction = {
  type: "restart" | "delete";
  campaignId: string;
  step: 0 | 1;
} | null;

const DICE_ORDER: Array<{ type: DiceType; sides: DieSides; label: string }> = [
  { type: "d2", sides: 2, label: "d2 · moeda" },
  { type: "d4", sides: 4, label: "d4" },
  { type: "d6", sides: 6, label: "d6" },
  { type: "d8", sides: 8, label: "d8" },
  { type: "d10", sides: 10, label: "d10" },
  { type: "d12", sides: 12, label: "d12" },
  { type: "d20", sides: 20, label: "d20" },
  { type: "d100", sides: 100, label: "d100" },
];
const DICE_APPEARANCE_STORAGE_KEY = "oraclerpg.dice-appearance.v1";
// Sign in with GPT plan sharing does not expose image generation yet.
// Re-enable this flag when the tool becomes available; the underlying scene-image flow remains intact.
const SCENE_IMAGE_BUTTON_ENABLED = false;

type DiceCounts = Record<DieSides, number>;

function emptyDiceCounts(): DiceCounts {
  return { 2: 0, 4: 0, 6: 0, 8: 0, 10: 0, 12: 0, 20: 0, 100: 0 };
}

function formulaFromDiceCounts(counts: DiceCounts) {
  return DICE_ORDER
    .filter(({ sides }) => counts[sides] > 0)
    .map(({ sides }) => `${counts[sides]}d${sides}`)
    .join("+");
}

function countsFromFormula(formula: string) {
  const counts = emptyDiceCounts();
  const parsed = parseDiceFormula(formula);
  for (const term of parsed.terms) {
    if (term.sign > 0) counts[term.sides] += term.count;
  }
  return counts;
}

function readDiceAppearanceOverrides(): DiceAppearanceOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DICE_APPEARANCE_STORAGE_KEY);
    return normalizeDiceAppearanceFonts(raw ? JSON.parse(raw) as DiceAppearanceOverrides : {});
  } catch {
    return normalizeDiceAppearanceFonts({});
  }
}

function DiceTray({
  open,
  pendingFormula,
  allowedDice,
  pendingKind,
  daggerheart,
  onRoll,
}: {
  open: boolean;
  pendingFormula?: string;
  allowedDice?: DiceType[];
  pendingKind?: string;
  daggerheart: boolean;
  onRoll: (formula: string, duality: boolean) => void;
}) {
  const [counts, setCounts] = useState<DiceCounts>(emptyDiceCounts);
  const [duality, setDuality] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (pendingFormula) {
      try {
        setCounts(countsFromFormula(pendingFormula));
      } catch {
        setCounts(emptyDiceCounts());
      }
      setDuality(pendingKind === "duality");
    } else if (allowedDice?.length) {
      const next = emptyDiceCounts();
      if (pendingKind === "duality" && allowedDice.includes("d12")) next[12] = 2;
      setCounts(next);
      setDuality(pendingKind === "duality");
    }
  }, [open, pendingFormula, pendingKind, allowedDice]);

  if (!open) return null;

  const exactPending = Boolean(pendingFormula);
  const allowedSet = allowedDice?.length ? new Set(allowedDice) : null;
  const builtFormula = exactPending ? pendingFormula! : formulaFromDiceCounts(counts);
  const canRoll = Boolean(builtFormula);

  function changeCount(sides: DieSides, amount: number) {
    if (exactPending) return;
    const dieType = `d${sides}` as DiceType;
    if (allowedSet && !allowedSet.has(dieType)) return;
    if (duality && sides === 12) setDuality(false);
    setCounts((current) => ({
      ...current,
      [sides]: Math.max(0, Math.min(99, current[sides] + amount)),
    }));
  }

  function chooseDuality() {
    if (!daggerheart || exactPending) return;
    const next = emptyDiceCounts();
    next[12] = 2;
    setCounts(next);
    setDuality(true);
  }

  return (
    <div className="diceTray" onClick={(event) => event.stopPropagation()}>
      <div className="diceTrayHead">
        <div><small>ROLADOR</small><strong>{pendingFormula ? "Rolagem solicitada" : "Monte sua rolagem"}</strong></div>
      </div>

      {pendingFormula && <div className="dicePendingFormula"><small>FÓRMULA</small><b>{pendingFormula}</b></div>}
      <div className="diceRows">
        {DICE_ORDER.map(({ type, sides, label }) => {
          const disabled = exactPending || Boolean(allowedSet && !allowedSet.has(type));
          return (
            <div className={`diceRow ${disabled ? "disabled" : ""}`} key={type}>
              <button type="button" onClick={() => changeCount(sides, -1)} disabled={disabled || counts[sides] <= 0}>−</button>
              <div><strong>{label}</strong><span>{counts[sides]}</span></div>
              <button type="button" onClick={() => changeCount(sides, 1)} disabled={disabled}>+</button>
            </div>
          );
        })}
      </div>
      {daggerheart && !exactPending && (
        <button type="button" className={`dualityQuick ${duality ? "active" : ""}`} onClick={chooseDuality}>
          <span>◐</span><div><b>Dualidade</b><small>1d12 Esperança + 1d12 Medo · /dr</small></div>
        </button>
      )}
      <button type="button" className="diceRollButton" disabled={!canRoll} onClick={() => canRoll && onRoll(builtFormula, duality || pendingKind === "duality")}>ROLL</button>
    </div>
  );
}

function Resource({
  label,
  value,
  max,
  kind,
  onAdjust,
}: {
  label: string;
  value: number;
  max: number;
  kind: "hp" | "hope" | "stress" | "armor";
  onAdjust: (kind: "hp" | "hope" | "stress" | "armor", amount: number) => void;
}) {
  return (
    <div className="resource">
      <div className="resourceTop"><span>{label}</span><strong>{value}<em>/{max}</em></strong></div>
      <div className="ticks">
        {Array.from({ length: max }).map((_, index) => <i className={index < value ? "filled" : ""} key={index} />)}
      </div>
      <div className="microActions">
        <button onClick={() => onAdjust(kind, -1)} aria-label={`Diminuir ${label}`}>−</button>
        <button onClick={() => onAdjust(kind, 1)} aria-label={`Aumentar ${label}`}>+</button>
      </div>
    </div>
  );
}

function AvatarSigil() {
  return (
    <div className="avatarSigil" aria-hidden="true">
      <span className="orbit orbitA" />
      <span className="orbit orbitB" />
      <span className="eye">◈</span>
    </div>
  );
}

function ActionInlineText({ text }: { text: string }) {
  const parts: Array<{ text: string; action: boolean }> = [];
  let cursor = 0;
  let action = false;

  while (cursor < text.length) {
    const marker = text.indexOf("**", cursor);
    if (marker < 0) {
      parts.push({ text: text.slice(cursor), action });
      break;
    }
    if (marker > cursor) parts.push({ text: text.slice(cursor, marker), action });
    action = !action;
    cursor = marker + 2;
  }

  return (
    <>
      {parts.map((part, index) => (
        <span className={part.action ? "characterActionText" : undefined} key={index}>{part.text}</span>
      ))}
    </>
  );
}

function MessageText({ text, actionSyntax = false }: { text: string; actionSyntax?: boolean }) {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className="messageText">
      {blocks.map((block, index) => (
        <p key={index}>{actionSyntax ? <ActionInlineText text={block} /> : block}</p>
      ))}
    </div>
  );
}

function selectionOffsets(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return { start: root.textContent?.length || 0, end: root.textContent?.length || 0 };
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    const end = root.textContent?.length || 0;
    return { start: end, end };
  }
  const startRange = range.cloneRange();
  startRange.selectNodeContents(root);
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = range.cloneRange();
  endRange.selectNodeContents(root);
  endRange.setEnd(range.endContainer, range.endOffset);
  return { start: startRange.toString().length, end: endRange.toString().length };
}

function restoreCaret(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  while (node) {
    const size = node.textContent?.length || 0;
    if (remaining <= size) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= size;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function renderComposerMarkup(root: HTMLElement, value: string, caret?: number) {
  root.replaceChildren();
  let cursor = 0;
  let action = false;
  while (cursor < value.length) {
    const marker = value.indexOf("**", cursor);
    const chunkEnd = marker < 0 ? value.length : marker;
    if (chunkEnd > cursor) {
      const span = document.createElement("span");
      if (action) span.className = "composerActionText";
      span.textContent = value.slice(cursor, chunkEnd);
      root.append(span);
    }
    if (marker < 0) break;
    const delimiter = document.createElement("span");
    delimiter.className = "composerActionDelimiter";
    delimiter.textContent = "**";
    root.append(delimiter);
    action = !action;
    cursor = marker + 2;
  }
  if (!value) root.append(document.createTextNode(""));
  if (caret !== undefined) restoreCaret(root, caret);
}

function ActionComposer({
  value,
  onChange,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  placeholder: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastDomValue = useRef("");
  const lastSelection = useRef({ start: 0, end: 0 });

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === lastDomValue.current) return;
    lastDomValue.current = value;
    renderComposerMarkup(editor, value);
  }, [value]);

  function syncFromDom() {
    const editor = editorRef.current;
    if (!editor) return;
    const offsets = selectionOffsets(editor);
    const caret = offsets.start;
    lastSelection.current = offsets;
    const next = editor.textContent || "";
    lastDomValue.current = next;
    renderComposerMarkup(editor, next, caret);
    onChange(next);
  }

  function insertActionMarkers() {
    const editor = editorRef.current;
    if (!editor || disabled) return;
    const savedSelection = lastSelection.current;
    editor.focus();
    const currentSelection = selectionOffsets(editor);
    const { start, end } = currentSelection.start === currentSelection.end && currentSelection.start === 0 && value.length
      ? savedSelection
      : currentSelection;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + "**" + selected + "**" + value.slice(end);
    const nextCaret = selected ? end + 4 : start + 2;
    lastSelection.current = { start: nextCaret, end: nextCaret };
    lastDomValue.current = next;
    renderComposerMarkup(editor, next, nextCaret);
    onChange(next);
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.closest("form")?.requestSubmit();
    }
  }

  return (
    <>
      <button
        type="button"
        className="actionFormatButton"
        title="Marcar ação do personagem"
        aria-label="Marcar ação do personagem"
        onMouseDown={(event) => event.preventDefault()}
        onClick={insertActionMarkers}
        disabled={disabled}
      >*</button>
      <div
        ref={editorRef}
        className={"composerEditor " + (!value ? "empty" : "")}
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        aria-label="Mensagem do jogador"
        data-placeholder={placeholder}
        onInput={syncFromDom}
        onKeyUp={() => {
          const editor = editorRef.current;
          if (editor) lastSelection.current = selectionOffsets(editor);
        }}
        onMouseUp={() => {
          const editor = editorRef.current;
          if (editor) lastSelection.current = selectionOffsets(editor);
        }}
        onBlur={() => {
          const editor = editorRef.current;
          if (editor) lastSelection.current = selectionOffsets(editor);
        }}
        onKeyDown={onEditorKeyDown}
        suppressContentEditableWarning
      />
    </>
  );
}

function findCompendiumEntry(id?: string, name?: string) {
  if (id) {
    const exact = daggerheartCompendium.entries.find((entry) => entry.id === id || entry.sourceId === id);
    if (exact) return exact;
  }
  if (!name) return undefined;
  const normalized = name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
  return daggerheartCompendium.entries.find((entry) =>
    entry.name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR") === normalized
    || entry.originalName?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR") === normalized
  );
}

function SheetExpandableCard({
  icon,
  title,
  subtitle,
  entry,
  description,
  badge,
  equipment,
}: {
  icon: string;
  title: string;
  subtitle: string;
  entry?: CompendiumEntry;
  description?: string;
  badge?: string;
  equipment?: InventoryItem;
}) {
  const body = description?.trim() || entry?.description?.trim() || "";
  const mechanics = entry ? mechanicsSummary(entry) : [];
  const canExpand = Boolean(body || mechanics.length);
  const visual = equipment
    ? <EquipmentArt item={equipment} className="sheetEntryArt" />
    : <CompendiumArt entry={entry} className="sheetEntryArt" fallback={<b>{icon}</b>} />;

  if (!canExpand) {
    return (
      <article className="miniCard">
        <span className="sheetEntryVisual">{visual}</span>
        <div><h3>{title}</h3><p>{subtitle}</p></div>
        {badge && <strong>{badge}</strong>}
      </article>
    );
  }

  return (
    <details className="sheetExpandableCard">
      <summary>
        <span className="sheetEntryVisual">{visual}</span>
        <div><h3>{title}</h3><p>{subtitle}</p></div>
        <span className={"sheetExpandHint " + (badge ? "badge" : "chevron")}>{badge || "⌄"}</span>
      </summary>
      <div className="sheetExpandableBody">
        {mechanics.length > 0 && (
          <div className="sheetMechanics">
            {mechanics.map((item, index) => (
              <span className={"mechanicChip " + item.kind} key={item.kind + item.label + index}>{item.label}</span>
            ))}
          </div>
        )}
        {body && <p>{body}</p>}
      </div>
    </details>
  );
}

function syncStateSummary(value: GameState) {
  const timestamps = [
    ...value.messages.map((entry) => entry.createdAt),
    ...value.events.map((entry) => entry.createdAt),
    ...value.memories.map((entry) => entry.createdAt),
  ]
    .map((entry) => Date.parse(entry))
    .filter((entry) => Number.isFinite(entry));
  const latest = timestamps.length ? new Date(Math.max(...timestamps)) : null;
  return {
    messages: value.messages.length,
    events: value.events.length,
    latestLabel: latest ? latest.toLocaleString("pt-BR") : "sem atividade registrada",
  };
}

const WEATHER_VISUAL: Record<WeatherCondition, { icon: string; label: string }> = {
  clear: { icon: "☀", label: "Ensolarado" },
  "partly-cloudy": { icon: "⛅", label: "Sol entre nuvens" },
  cloudy: { icon: "☁", label: "Nublado" },
  rain: { icon: "🌧", label: "Chovendo" },
  storm: { icon: "⛈", label: "Tempestade" },
  snow: { icon: "❄", label: "Nevando" },
  fog: { icon: "≋", label: "Neblina" },
  wind: { icon: "〰", label: "Ventando" },
  custom: { icon: "◈", label: "Clima incomum" },
};

function ensureCampaignTime(state: GameState, seed: string) {
  if ((state as GameState & { time?: CampaignTimeState }).time) return state;
  return {
    ...state,
    time: createCampaignTimeState({ seed }),
  };
}

function createRandomCampaignTime(seed: string) {
  const base = createCampaignTimeState({ seed });
  const monthIndex = Math.floor(Math.random() * base.calendar.months.length);
  const month = base.calendar.months[monthIndex];
  const year = base.calendar.epochYear + Math.floor(Math.random() * 24);
  const day = 1 + Math.floor(Math.random() * month.days);
  const hour = 7 + Math.floor(Math.random() * 13);
  const minute = [0, 10, 15, 20, 30, 40, 45, 50][Math.floor(Math.random() * 8)];
  let next = setCampaignTime(base, { year, monthIndex, day, hour, minute });
  const weatherOptions: Array<{ condition: WeatherCondition; label: string }> = [
    { condition: "clear", label: "Céu limpo" },
    { condition: "partly-cloudy", label: "Sol entre nuvens" },
    { condition: "cloudy", label: "Nublado" },
    { condition: "fog", label: "Neblina leve" },
    { condition: "wind", label: "Vento constante" },
  ];
  const initialWeather = weatherOptions[Math.floor(Math.random() * weatherOptions.length)];
  next = setCampaignWeather(next, initialWeather);
  return next;
}

function moonGlyph(phase: string) {
  return ({
    new: "●",
    "waxing-crescent": "◔",
    "first-quarter": "◐",
    "waxing-gibbous": "◕",
    full: "○",
    "waning-gibbous": "◕",
    "last-quarter": "◑",
    "waning-crescent": "◒",
  } as Record<string, string>)[phase] || "○";
}

function formatCampaignDuration(minutes: number) {
  const total = Math.max(0, Math.abs(Math.trunc(minutes)));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  const chunks = [];
  if (days) chunks.push(`${days}d`);
  if (hours) chunks.push(`${hours}h`);
  if (mins || !chunks.length) chunks.push(`${mins}min`);
  return chunks.join(" ");
}

function shiftCalendarMonth(time: CampaignTimeState, year: number, monthIndex: number, delta: number) {
  let nextYear = year;
  let nextMonth = monthIndex + delta;
  while (nextMonth < 0) {
    nextYear -= 1;
    nextMonth += time.calendar.months.length;
  }
  while (nextMonth >= time.calendar.months.length) {
    nextYear += 1;
    nextMonth -= time.calendar.months.length;
  }
  if (nextYear < time.calendar.epochYear) return { year: time.calendar.epochYear, monthIndex: 0 };
  return { year: nextYear, monthIndex: nextMonth };
}

function eventsForCalendarDay(time: CampaignTimeState, year: number, monthIndex: number, day: number) {
  const start = campaignMinuteFromDate(time.calendar, { year, monthIndex, day, hour: 0, minute: 0 });
  const end = start + 1440;
  return time.events.filter((event) => {
    const eventEnd = event.endCampaignMinute ?? event.startCampaignMinute;
    return event.startCampaignMinute < end && eventEnd >= start;
  });
}

function CampaignClockBar({ time, onOpenCalendar }: { time: CampaignTimeState; onOpenCalendar: () => void }) {
  const current = deriveCampaignDateTime(time);
  const weatherVisual = WEATHER_VISUAL[time.weather.condition] || WEATHER_VISUAL.custom;
  const skyIcon = current.period === "night" && time.weather.condition === "clear"
    ? "☾"
    : current.period === "night" && time.weather.condition === "partly-cloudy"
      ? "☾☁"
      : weatherVisual.icon;
  const timeLabel = `${String(current.hour).padStart(2, "0")}:${String(current.minute).padStart(2, "0")}`;
  return (
    <div className={`campaignClockBar period-${current.period} weather-${time.weather.condition}`}>
      <button className="campaignClockDate" onClick={onOpenCalendar} title="Abrir calendário da campanha">
        <span>
          <small>{time.calendar.name}</small>
          <strong>{current.day} de {current.month.name}</strong>
        </span>
        <b aria-hidden="true">▦</b>
      </button>
      <div className="campaignWeatherWindow" title={time.weather.description || time.weather.label}>
        <span className="campaignWeatherSky">
          <i>{skyIcon}</i>
        </span>
        <small>{time.weather.label || weatherVisual.label}</small>
      </div>
      <div className="campaignClockTime">
        <small>{current.weekday.name}</small>
        <strong>{timeLabel}</strong>
      </div>
    </div>
  );
}

function CalendarEventRow({ event, time }: { event: CampaignCalendarEvent; time: CampaignTimeState }) {
  const starts = formatCampaignDateTime(time, event.startCampaignMinute, { includeWeekday: false, includeTime: true });
  const ends = event.endCampaignMinute === undefined
    ? null
    : formatCampaignDateTime(time, event.endCampaignMinute, { includeWeekday: false, includeTime: true });
  const remaining = event.endCampaignMinute === undefined ? null : remainingDuration(time, event);
  return (
    <article className={`calendarEventRow kind-${event.kind || "custom"} ${event.completed ? "completed" : ""}`}>
      <b>{event.kind === "quest" ? "!" : event.kind === "effect" ? "✦" : event.kind === "appointment" ? "⌛" : "◉"}</b>
      <div>
        <small>{event.kind === "quest" ? "MISSÃO" : event.kind === "effect" ? "EFEITO" : event.kind === "appointment" ? "COMPROMISSO" : "EVENTO"}</small>
        <strong>{event.title}</strong>
        <p>{event.description || (ends ? `${starts} → ${ends}` : starts)}</p>
      </div>
      {remaining && !event.completed && <span className={remaining.expired ? "expired" : ""}>{remaining.expired ? "Prazo encerrado" : formatCampaignDuration(remaining.signedMinutes)}</span>}
    </article>
  );
}

function CampaignCalendarModal({ time, onClose }: { time: CampaignTimeState; onClose: () => void }) {
  const current = deriveCampaignDateTime(time);
  const [cursor, setCursor] = useState(() => ({ year: current.year, monthIndex: current.monthIndex }));
  const [selectedMinute, setSelectedMinute] = useState(time.campaignMinute);
  const month = time.calendar.months[cursor.monthIndex];
  const firstMinute = campaignMinuteFromDate(time.calendar, { year: cursor.year, monthIndex: cursor.monthIndex, day: 1 });
  const firstWeekday = deriveCampaignDateTime(time.calendar, firstMinute).weekdayIndex;
  const selectedDate = deriveCampaignDateTime(time, selectedMinute);
  const selectedEvents = eventsForCalendarDay(time, selectedDate.year, selectedDate.monthIndex, selectedDate.day);
  const selectedMoons = getMoonPhases(time, selectedMinute);
  const upcoming = time.events
    .filter((event) => !event.completed && (event.endCampaignMinute ?? event.startCampaignMinute) >= time.campaignMinute)
    .sort((a, b) => (a.endCampaignMinute ?? a.startCampaignMinute) - (b.endCampaignMinute ?? b.startCampaignMinute))
    .slice(0, 6);
  const calendarColumns = { gridTemplateColumns: `repeat(${time.calendar.weekdays.length}, minmax(0, 1fr))` };

  return (
    <div className="modalBackdrop calendarBackdrop" onClick={onClose}>
      <section className="campaignCalendarModal" onClick={(event) => event.stopPropagation()}>
        <header className="campaignCalendarHeader">
          <div>
            <small>CALENDÁRIO DA CAMPANHA</small>
            <h2>{time.calendar.name}</h2>
            <p>{time.calendar.weekdays.length} dias por semana · {time.calendar.months.length} meses por ano · {time.calendar.moons.length} {time.calendar.moons.length === 1 ? "lua" : "luas"}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar calendário">×</button>
        </header>

        <div className="campaignCalendarBody">
          <section className="calendarMonthPanel">
            <div className="calendarMonthNav">
              <button onClick={() => setCursor((value) => shiftCalendarMonth(time, value.year, value.monthIndex, -1))}>‹</button>
              <div><small>ANO {cursor.year}</small><strong>{month.name}</strong><span>{month.days} dias</span></div>
              <button onClick={() => setCursor((value) => shiftCalendarMonth(time, value.year, value.monthIndex, 1))}>›</button>
            </div>
            <div className="calendarWeekdays" style={calendarColumns}>
              {time.calendar.weekdays.map((weekday) => <span key={weekday.id}>{weekday.name.slice(0, 3)}</span>)}
            </div>
            <div className="calendarDays" style={calendarColumns}>
              {Array.from({ length: firstWeekday }).map((_, index) => <span className="calendarDayBlank" key={`blank-${index}`} />)}
              {Array.from({ length: month.days }, (_, index) => index + 1).map((day) => {
                const minute = campaignMinuteFromDate(time.calendar, { year: cursor.year, monthIndex: cursor.monthIndex, day });
                const dayEvents = eventsForCalendarDay(time, cursor.year, cursor.monthIndex, day);
                const isToday = cursor.year === current.year && cursor.monthIndex === current.monthIndex && day === current.day;
                const isSelected = cursor.year === selectedDate.year && cursor.monthIndex === selectedDate.monthIndex && day === selectedDate.day;
                const hasDeadline = dayEvents.some((event) => event.endCampaignMinute !== undefined && deriveCampaignDateTime(time, event.endCampaignMinute).absoluteDay === deriveCampaignDateTime(time, minute).absoluteDay);
                return (
                  <button
                    className={`calendarDay ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${dayEvents.length ? "hasEvents" : ""}`}
                    onClick={() => setSelectedMinute(minute)}
                    key={day}
                  >
                    <span>{day}</span>
                    {dayEvents.length > 0 && <i>{hasDeadline ? "!" : "•"}</i>}
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="calendarDetailPanel">
            <div className="calendarSelectedDate">
              <small>{selectedDate.weekday.name.toUpperCase()}</small>
              <h3>{selectedDate.day} de {selectedDate.month.name}</h3>
              <span>Ano {selectedDate.year}</span>
            </div>

            <div className="calendarMoonList">
              <small>CICLO {selectedMoons.length === 1 ? "DA LUA" : "DAS LUAS"}</small>
              {selectedMoons.map((moon) => (
                <div className="calendarMoon" key={moon.moon.id}>
                  <b>{moonGlyph(moon.phase)}</b>
                  <span><strong>{moon.moon.name}</strong><small>{moon.label} · {Math.round(moon.illumination * 100)}%</small></span>
                </div>
              ))}
            </div>

            <div className="calendarDayEvents">
              <div className="calendarDetailTitle"><small>EVENTOS DESTE DIA</small><span>{selectedEvents.length}</span></div>
              {selectedEvents.length ? selectedEvents.map((event) => <CalendarEventRow event={event} time={time} key={event.id} />) : <p>Nada marcado para este dia.</p>}
            </div>

            <div className="calendarUpcoming">
              <div className="calendarDetailTitle"><small>PRÓXIMOS PRAZOS</small><span>{upcoming.length}</span></div>
              {upcoming.length ? upcoming.map((event) => <CalendarEventRow event={event} time={time} key={event.id} />) : <p>Nenhum prazo futuro registrado.</p>}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

export default function OracleApp() {
  const [state, setState] = useState<GameState>(initialState);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [view, setView] = useState<View>("session");
  const [characterSheetMode, setCharacterSheetMode] = useState<"character" | "companion" | "beastforms">("character");
  const [memoryMode, setMemoryMode] = useState<"timeline" | "details">("timeline");
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignLibraryEntry[]>([]);
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const activeCampaignIdRef = useRef<string | null>(null);
  const campaignEpochRef = useRef(0);
  const campaignsRef = useRef<CampaignLibraryEntry[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [pairInput, setPairInput] = useState("");
  const [syncNote, setSyncNote] = useState("");
  const [gmBusy, setGmBusy] = useState(false);
  const gmRunningRef = useRef(false);
  const [gmError, setGmError] = useState("");
  const [openingNarrationError, setOpeningNarrationError] = useState("");
  const [replacementCampaignId, setReplacementCampaignId] = useState<string | null>(null);
  const [trackerInfo, setTrackerInfo] = useState<CharacterTracker | null>(null);
  const [trackerEditor, setTrackerEditor] = useState<CharacterTracker | null>(null);
  const trackerPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackerLongPressRef = useRef(false);
  const [imageMessageId, setImageMessageId] = useState<string | null>(null);
  const [imageNote, setImageNote] = useState("");
  const [sceneImageBusy, setSceneImageBusy] = useState(false);
  const [sceneImageError, setSceneImageError] = useState("");
  const [sceneImageRetryNonce, setSceneImageRetryNonce] = useState(0);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showDiceTray, setShowDiceTray] = useState(false);
  const [diceAppearances, setDiceAppearances] = useState<DiceAppearanceOverrides>({});
  const [activeDiceRoll, setActiveDiceRoll] = useState<DiceRollResult | null>(null);
  const [diceNote, setDiceNote] = useState("");
  const diceRollSourcesRef = useRef(new Map<string, "tray" | "slash">());
  const diceRollPendingRefsRef = useRef(new Map<string, string | null>());
  const diceRollCampaignRefsRef = useRef(new Map<string, { campaignId: string | null; epoch: number }>());
  const processedDiceRollsRef = useRef(new Set<string>());
  const stateRef = useRef(state);
  const [campaignAction, setCampaignAction] = useState<CampaignAction>(null);
  const [campaignActionError, setCampaignActionError] = useState("");
  const timelineSynthesisInFlightRef = useRef<string | null>(null);
  const sceneImageSearchInFlightRef = useRef<string | null>(null);
  const sceneImageFailedRef = useRef<string | null>(null);
  const openingNarrationAttemptRef = useRef<string | null>(null);
  const openingNarrationFailedRef = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setCharacterSheetMode("character");
  }, [activeCampaignId, state.character.name]);

  useEffect(() => {
    if (activeCampaignIdRef.current === activeCampaignId) return;
    activeCampaignIdRef.current = activeCampaignId;
    campaignEpochRef.current += 1;
    setActiveDiceRoll(null);
    setShowDiceTray(false);
    setSceneImageBusy(false);
    setSceneImageError("");
    setSceneImageRetryNonce(0);
    sceneImageSearchInFlightRef.current = null;
    sceneImageFailedRef.current = null;
    openingNarrationAttemptRef.current = null;
    openingNarrationFailedRef.current = null;
    setOpeningNarrationError("");
    diceRollSourcesRef.current.clear();
    diceRollPendingRefsRef.current.clear();
    diceRollCampaignRefsRef.current.clear();
  }, [activeCampaignId]);

  useEffect(() => {
    setDiceAppearances(readDiceAppearanceOverrides());
  }, []);

  useEffect(() => {
    if (view !== "memory") setMemoryMode("timeline");
    if (view === "session") return;
    setShowDiceTray(false);
    setShowCalendar(false);
  }, [view]);

  useEffect(() => {
    let savedCampaigns = readCampaignLibrary();
    if (!savedCampaigns.length) {
      const migrated = migrateLegacyCampaign();
      if (migrated) savedCampaigns = [migrated];
    }
    const normalizedCampaigns = savedCampaigns.map((entry) => {
      const normalizedState = ensureGameStateCrafting(ensureGameStateTimeline(ensureGameStateCharacterModel(
        ensureCampaignTime(entry.state, `legacy:${entry.state.campaign.name}:${entry.state.campaign.system}`),
      )));
      return normalizedState === entry.state ? entry : { ...entry, state: normalizedState };
    });
    const sorted = sortCampaigns(normalizedCampaigns);
    if (normalizedCampaigns.some((entry, index) => entry !== savedCampaigns[index])) {
      writeCampaignLibrary(sorted);
    }
    campaignsRef.current = sorted;
    setCampaigns(sorted);

    const preferredId = localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
    const active = sorted.find((entry) => entry.id === preferredId) || sorted[0] || null;
    if (active) {
      setActiveCampaignId(active.id);
      setState(active.state);
      localStorage.setItem(ACTIVE_CAMPAIGN_KEY, active.id);
    } else {
      localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !activeCampaignId) return;
    const normalized = ensureGameStateCrafting(ensureGameStateTimeline(ensureGameStateCharacterModel(
      ensureCampaignTime(state, `legacy:${state.campaign.name}:${state.campaign.system}`),
    )));
    if (normalized !== state) setState(normalized);
  }, [ready, activeCampaignId, state]);

  useEffect(() => {
    campaignsRef.current = campaigns;
  }, [campaigns]);

  useEffect(() => {
    if (!ready || !activeCampaignId) return;
    const persist = () => {
      try {
        const current = campaignsRef.current;
        const existing = current.find((entry) => entry.id === activeCampaignId);
        if (!existing) return;
        const next = current.map((entry) =>
          entry.id === activeCampaignId
            ? {
                ...entry,
                state,
                updatedAt: new Date().toISOString(),
              }
            : entry,
        );
        campaignsRef.current = next;
        setCampaigns(next);
        writeCampaignLibrary(next);
        localStorage.setItem(ACTIVE_CAMPAIGN_KEY, activeCampaignId);
      } catch {}
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persist();
    };
    persist();
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ready, activeCampaignId, state]);

  const hasSavedCampaign = campaigns.length > 0;
  const cloud = useCloudSync(state, setState, ready, activeCampaignId);
  const bridge = useOracleBridge();

  async function synthesizeTimelineForState(sourceState: GameState) {
    if (!bridge.account?.connected || !bridge.model) return [];
    const response = await bridge.respond({
      model: bridge.model,
      instructions: [
        "Você organiza uma cronologia histórica para uma campanha de RPG.",
        "Retorne somente JSON válido, sem markdown, comentários ou texto fora do JSON.",
        "Não copie blocos narrativos inteiros: transforme-os em acontecimentos atômicos e datados.",
      ].join("\n"),
      input: [{
        role: "user",
        content: buildTimelineSynthesisPrompt(sourceState),
      }],
    });
    const text = extractNarration(response).trim();
    return parseTimelineSynthesis(text, sourceState.time);
  }

  useEffect(() => {
    if (!ready || !activeCampaignId || !bridge.account?.connected || !bridge.model) return;
    if (!state.messages.some((message) => message.role === "gm")) return;
    if (!timelineNeedsNarrativeSynthesis(state)) return;
    const requestKey = `${activeCampaignId}:${state.timelineVersion ?? 0}:${state.campaign.name}`;
    if (timelineSynthesisInFlightRef.current === requestKey) return;
    timelineSynthesisInFlightRef.current = requestKey;
    const epoch = campaignEpochRef.current;

    void (async () => {
      try {
        const generated = await synthesizeTimelineForState(state);
        if (!generated.length) return;
        if (activeCampaignIdRef.current !== activeCampaignId || campaignEpochRef.current !== epoch) return;
        setState((current) => {
          if (!timelineNeedsNarrativeSynthesis(current)) return current;
          return {
            ...current,
            timeline: mergeTimelineEntries(current.time, timelineWithoutLegacyGeneratedEntries(current), generated),
            timelineVersion: TIMELINE_SCHEMA_VERSION,
          };
        });
      } catch {
        // Keep the cleaned timeline and retry the synthesis on a future connected render.
      } finally {
        if (timelineSynthesisInFlightRef.current === requestKey) timelineSynthesisInFlightRef.current = null;
      }
    })();
  }, [
    ready,
    activeCampaignId,
    bridge.account?.connected,
    bridge.model,
    state.messages.length,
    state.timelineVersion,
    state.campaign.adventureHook,
    state.character.daggerheart?.history,
    state.memories.length,
  ]);

  const contextPreview = useMemo(() => buildContextPacket(state), [state]);
  const lastGmMessage = useMemo(() => latestGmMessage(state.messages), [state.messages]);
  const hasGmNarration = useMemo(() => state.messages.some((message) => message.role === "gm"), [state.messages]);
  const characterTrackers = state.character.daggerheart?.trackers || [];
  const diceTrackers = characterTrackers.filter((tracker) => tracker.kind === "die" || tracker.kind === "dicePool");
  const effectiveTraits = useMemo(() => effectiveCharacterTraits(state.character), [state.character]);
  const effectiveEvasion = useMemo(() => effectiveCharacterEvasion(state.character), [state.character]);
  const animalCompanion = state.character.daggerheart?.animalCompanion;
  const showingCompanionSheet = Boolean(animalCompanion && characterSheetMode === "companion");
  const hasBeastform = state.campaign.system === "Daggerheart" && canUseBeastform(state.character);
  const showingBeastformSheet = hasBeastform && characterSheetMode === "beastforms";
  const showingCharacterSheet = !showingCompanionSheet && !showingBeastformSheet;
  const beastformTier = daggerheartTierForLevel(state.character.level);
  const availableBeastforms = hasBeastform ? availableBeastformsForCharacter(state.character, daggerheartCompendium.entries) : [];
  const deathBlocksActions = Boolean(
    state.character.conditions.includes("Inconsciente")
    || ["choice", "avoiding", "risking", "risk-recovery", "dead"].includes(state.character.death?.status || ""),
  );
  const playerActionsBlocked = deathBlocksActions || Boolean(state.pendingLevelUp);
  const sceneImageErrorInfo = useMemo(
    () => sceneImageError ? describeSceneWebImageError(sceneImageError) : null,
    [sceneImageError],
  );
  const currentSceneVisual = state.sceneVisual?.scene === state.campaign.scene ? state.sceneVisual : null;
  const imageMessage = useMemo(
    () => state.messages.find((message) => message.id === imageMessageId),
    [imageMessageId, state.messages],
  );
  const latestUnansweredPlayer = useMemo(() => {
    let playerIndex = -1;
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      if (state.messages[index].role === "player") {
        playerIndex = index;
        break;
      }
    }
    if (playerIndex < 0) return null;
    const answered = state.messages.slice(playerIndex + 1).some((message) => message.role === "gm");
    return answered ? null : state.messages[playerIndex];
  }, [state.messages]);

  useEffect(() => {
    if (!ready || screen !== "campaign" || view !== "session" || !activeCampaignId) return;
    if (bridge.status !== "ready" || !bridge.account?.connected || !bridge.model || gmBusy || gmRunningRef.current) return;
    if (hasGmNarration) return;
    const key = `${activeCampaignId}:${campaignEpochRef.current}:opening`;
    if (openingNarrationAttemptRef.current === key) return;
    void startCampaignOpening(state, "creation");
  }, [
    activeCampaignId,
    bridge.account?.connected,
    bridge.model,
    bridge.status,
    gmBusy,
    ready,
    screen,
    hasGmNarration,
    view,
  ]);

  useEffect(() => {
    if (bridge.status !== "ready" || !bridge.account?.connected || !bridge.model) return;
    if (!activeCampaignId || screen !== "campaign" || view !== "session") return;
    if (hasGmNarration) return;
    const key = `${activeCampaignId}:${campaignEpochRef.current}:opening`;
    if (openingNarrationFailedRef.current !== key) return;
    openingNarrationFailedRef.current = null;
    openingNarrationAttemptRef.current = null;
    setOpeningNarrationError("");
    void startCampaignOpening(stateRef.current, "creation");
  }, [bridge.status, bridge.account?.connected, bridge.model, hasGmNarration]);

  useEffect(() => {
    if (!ready || screen !== "campaign" || view !== "session" || !activeCampaignId) return;
    if (!bridge.account?.connected || !bridge.model) return;
    if (gmBusy || gmRunningRef.current) return;
    if (!hasGmNarration) return;
    if (state.sceneVisual?.scene === state.campaign.scene) return;

    const scene = state.campaign.scene.trim();
    if (!scene) return;
    const requestKey = `${activeCampaignId}:${campaignEpochRef.current}:${bridge.model}:${scene}`;
    if (sceneImageSearchInFlightRef.current === requestKey || sceneImageFailedRef.current === requestKey) return;

    const runCampaignId = activeCampaignId;
    const runCampaignEpoch = campaignEpochRef.current;
    const query = buildSceneWebImageSearchPrompt({
      scene,
      narration: lastGmMessage?.text,
      tone: state.campaign.tone,
    });
    sceneImageSearchInFlightRef.current = requestKey;
    setSceneImageBusy(true);
    setSceneImageError("");

    void (async () => {
      try {
        const response = await bridge.respond({
          model: bridge.model,
          instructions: [
            "Você seleciona referências visuais reais da web para o painel de cena de um RPG.",
            "Use obrigatoriamente a ferramenta de busca web fornecida. Não invente URLs.",
            "Priorize imagens do ambiente/local, sem procurar uma representação exata dos personagens do jogador.",
          ].join("\n"),
          input: [{ role: "user", content: query }],
          tools: [{
            type: "web_search",
            search_content_types: ["image"],
            image_settings: { max_results: 6, caption: true },
          }],
          include: ["web_search_call.results"],
          toolChoice: "required",
        });
        const visual = extractSceneWebImage(response, scene, query);
        if (!visual) throw new Error("A busca não retornou uma imagem utilizável.");
        if (activeCampaignIdRef.current !== runCampaignId || campaignEpochRef.current !== runCampaignEpoch) return;
        sceneImageFailedRef.current = null;
        setState((current) => current.campaign.scene === scene
          ? { ...current, sceneVisual: visual }
          : current);
      } catch (error) {
        if (activeCampaignIdRef.current !== runCampaignId || campaignEpochRef.current !== runCampaignEpoch) return;
        sceneImageFailedRef.current = requestKey;
        setSceneImageError(error instanceof Error ? error.message : "Não foi possível buscar uma imagem para esta cena.");
      } finally {
        if (sceneImageSearchInFlightRef.current === requestKey) sceneImageSearchInFlightRef.current = null;
        if (activeCampaignIdRef.current === runCampaignId && campaignEpochRef.current === runCampaignEpoch) {
          setSceneImageBusy(false);
        }
      }
    })();
  }, [
    activeCampaignId,
    bridge.account?.connected,
    bridge.model,
    gmBusy,
    hasGmNarration,
    lastGmMessage?.id,
    ready,
    screen,
    state.campaign.scene,
    state.campaign.tone,
    state.sceneVisual?.scene,
    view,
    sceneImageRetryNonce,
  ]);

  const cloudLabel = ({
    local: "somente local",
    connecting: "conectando",
    synced: "sincronizado",
    syncing: "salvando",
    offline: "offline",
    conflict: "conflito",
    error: "erro",
  } as const)[cloud.status];

  const newCampaignAi = {
    connected: Boolean(bridge.account?.connected),
    model: bridge.model,
    respond: bridge.respond,
    onConnect: bridge.connect,
  };

  async function createCloudCampaign() {
    setSyncNote("");
    try {
      await cloud.createCloud();
      setSyncNote("Campanha criada na nuvem. Use o código abaixo no outro dispositivo.");
    } catch {
      setSyncNote("Não foi possível ativar a sincronização.");
    }
  }

  async function joinCloudCampaign() {
    setSyncNote("");
    try {
      if (activeCampaignId) {
        await cloud.joinCloud(pairInput);
      } else {
        const imported = await cloud.importCloud(pairInput);
        const normalizedState = ensureGameStateCrafting(ensureGameStateTimeline(ensureGameStateCharacterModel(
          ensureCampaignTime(imported.state, `cloud:${imported.state.campaign.name}:${imported.state.campaign.system}`),
        )));
        const existing = campaignsRef.current.find((entry) =>
          readCloudCredentialsForCampaign(entry.id)?.campaignId === imported.credentials.campaignId,
        );
        const localCampaignId = existing?.id || crypto.randomUUID();
        const now = imported.updatedAt || campaignActivityAt(normalizedState);
        const record: CampaignLibraryEntry = existing
          ? { ...existing, state: normalizedState, updatedAt: now }
          : { id: localCampaignId, state: normalizedState, createdAt: now, updatedAt: now };
        const nextLibrary = sortCampaigns([
          ...campaignsRef.current.filter((entry) => entry.id !== localCampaignId),
          record,
        ]);
        writeCloudCredentialsForCampaign(localCampaignId, imported.credentials);
        campaignsRef.current = nextLibrary;
        setCampaigns(nextLibrary);
        writeCampaignLibrary(nextLibrary);
        localStorage.setItem(ACTIVE_CAMPAIGN_KEY, localCampaignId);
        campaignEpochRef.current += 1;
        activeCampaignIdRef.current = localCampaignId;
        stateRef.current = normalizedState;
        setActiveCampaignId(localCampaignId);
        setState(normalizedState);
        setScreen("campaign");
        setView("session");
        setShowSync(false);
      }
      setPairInput("");
      setSyncNote(activeCampaignId ? "Campanha sincronizada neste dispositivo." : "Campanha importada da nuvem.");
    } catch (error) {
      setSyncNote(error instanceof Error ? error.message : "Código inválido.");
    }
  }

  async function copyPairCode() {
    if (!cloud.pairCode) return;
    await navigator.clipboard.writeText(cloud.pairCode);
    setSyncNote("Código copiado.");
  }

  async function prepareSceneImage(message: Message) {
    const snapshot = message.sceneSnapshot || buildSceneSnapshot(state, message.text);
    const prompt = buildSceneImagePrompt(snapshot);
    setState((current) => ({
      ...current,
      messages: current.messages.map((entry) =>
        entry.id === message.id
          ? {
              ...entry,
              sceneSnapshot: snapshot,
              imageDraft: {
                prompt,
                status: "unavailable",
                provider: "chatgpt-plan-sharing",
                createdAt: new Date().toISOString(),
              },
            }
          : entry,
      ),
    }));
    setImageMessageId(message.id);
    setImageNote("");
  }

  async function copySceneImagePrompt() {
    if (!imageMessage?.imageDraft?.prompt) return;
    await navigator.clipboard.writeText(imageMessage.imageDraft.prompt);
    setImageNote("Prompt da cena copiado.");
  }

  function openCampaignLibrary() {
    if (!hasSavedCampaign) return;
    setScreen("campaigns");
  }

  function openCampaign(campaignId: string) {
    const entry = campaignsRef.current.find((campaign) => campaign.id === campaignId);
    if (!entry) return;
    const normalizedState = ensureGameStateCrafting(ensureGameStateTimeline(ensureGameStateCharacterModel(
      ensureCampaignTime(entry.state, `legacy:${entry.state.campaign.name}:${entry.state.campaign.system}`),
    )));
    campaignEpochRef.current += 1;
    activeCampaignIdRef.current = entry.id;
    setActiveDiceRoll(null);
    setShowDiceTray(false);
    setSceneImageBusy(false);
    setSceneImageError("");
    setSceneImageRetryNonce(0);
    setOpeningNarrationError("");
    sceneImageSearchInFlightRef.current = null;
    sceneImageFailedRef.current = null;
    openingNarrationAttemptRef.current = null;
    openingNarrationFailedRef.current = null;
    diceRollSourcesRef.current.clear();
    diceRollPendingRefsRef.current.clear();
    diceRollCampaignRefsRef.current.clear();
    stateRef.current = normalizedState;
    setActiveCampaignId(entry.id);
    setState(normalizedState);
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, entry.id);
    setView("session");
    setScreen("campaign");
  }

  function characterFromNewCampaignResult(result: NewCampaignResult): CharacterState {
    return structuredClone(result.resolvedCharacter) as CharacterState;
  }

  async function finishNewCampaign(result: NewCampaignResult) {
    const createdAt = new Date().toISOString();
    const characterName = result.character.name.trim() || "Novo personagem";
    const campaignName = result.campaignName.trim() || "Nova campanha";
    const scene = "Prólogo · Cena inicial";
    const campaignTime = createRandomCampaignTime(`${campaignName}:${crypto.randomUUID()}`);
    const memories: GameState["memories"] = [];
    const remember = (kind: GameState["memories"][number]["kind"], text: string) => {
      memories.push({ id: crypto.randomUUID(), kind, text, createdAt, campaignMinute: campaignTime.campaignMinute });
    };

    remember(
      "fact",
      `${characterName} é ${result.classEntry.name} (${result.subclassEntry.name}), de herança ${result.ancestry.primary.name}${result.ancestry.secondary ? ` e ${result.ancestry.secondary.name}` : ""}, da comunidade ${result.community.entry.name}.`,
    );
    remember("fact", `Sistema da campanha: ${result.system}. Tom definido: ${result.tone}.`);
    if (result.adventureHook?.trim()) {
      remember("event", `Gancho inicial da aventura: ${result.adventureHook.trim()}`);
    }
    if (result.classFeatures.length) {
      remember("fact", `Características de classe de ${characterName}: ${result.classFeatures.map((feature) => feature.name).join(", ")}.`);
    }
    if (result.subclassFeatures.length) {
      remember("fact", `Características de subclasse de ${characterName}: ${result.subclassFeatures.map((feature) => feature.name).join(", ")}.`);
    }
    if (result.ancestry.features.length) {
      remember("fact", `Características de ancestralidade de ${characterName}: ${result.ancestry.features.map((feature) => feature.name).join(", ")}.`);
    }
    if (result.community.features.length) {
      remember("fact", `Característica de comunidade de ${characterName}: ${result.community.features.map((feature) => feature.name).join(", ")}.`);
    }
    remember(
      "fact",
      `Traços de ${characterName}: ${TRAIT_ORDER.map((trait) => `${TRAIT_LABELS[trait]} ${result.traits[trait] >= 0 ? "+" : ""}${result.traits[trait]}`).join(", ")}.`,
    );
    remember("fact", `Experiências iniciais de ${characterName}: ${result.experiences.map((experience) => `${experience} +2`).join("; ")}.`);
    remember("fact", `Cartas de domínio iniciais de ${characterName}: ${result.domainCards.map((card) => `${card.name} (${card.domain})`).join("; ")}.`);
    if (result.equipment.length) {
      remember("fact", `Equipamento inicial de ${characterName}: ${result.equipment.map((item) => item.name).join(", ")}.`);
    }
    remember("event", result.character.history.trim()
      ? `História de ${characterName}: ${result.character.history.trim()}`
      : `${characterName} inicia sua jornada em ${campaignName}.`);

    if (result.character.appearance?.trim()) {
      remember("visual", `Aparência de ${characterName}: ${result.character.appearance.trim()}`);
    } else if (result.character.image) {
      remember("visual", `${characterName} possui uma imagem de referência visual registrada na ficha.`);
    }

    for (const companion of result.companions) {
      const connection = companion.connection.trim();
      remember(
        "fact",
        connection
          ? `${companion.name} (${companion.role}) acompanha o grupo. Vínculo com ${characterName}: ${connection}`
          : `${companion.name} (${companion.role}) acompanha o grupo e acabou de conhecer ${characterName}.`,
      );
      if (companion.appearance?.trim()) {
        remember("visual", `Aparência de ${companion.name}: ${companion.appearance.trim()}`);
      }
    }

    if (result.animalCompanion) {
      remember(
        "fact",
        `${result.animalCompanion.name} é o companheiro animal de ${characterName}${result.animalCompanion.kind ? ` (${result.animalCompanion.kind})` : ""}.`,
      );
      if (result.animalCompanion.appearance?.trim()) {
        remember("visual", `Aparência de ${result.animalCompanion.name}: ${result.animalCompanion.appearance.trim()}`);
      } else if (result.animalCompanion.image) {
        remember("visual", `${result.animalCompanion.name} possui uma imagem de referência visual registrada na ficha.`);
      }
    }

    const next: GameState = {
      resourceModelVersion: 2,
      campaign: {
        name: campaignName,
        system: result.system,
        tone: result.tone,
        adventureHook: result.adventureHook?.trim() || undefined,
        session: 1,
        scene,
      },
      time: campaignTime,
      character: characterFromNewCampaignResult(result),
      inventory: result.equipment,
      crafting: createInitialCraftingState(),
      quests: [],
      npcs: result.companions.map((companion) => ({
        id: companion.id,
        name: companion.name,
        role: companion.role,
        relation: "friendly" as const,
        location: scene,
        appearance: companion.appearance.trim() || undefined,
      })),
      memories,
      timeline: [],
      timelineVersion: 1,
      messages: [],
      events: [],
    };
    try {
      const generatedTimeline = await synthesizeTimelineForState(next);
      if (generatedTimeline.length) {
        next.timeline = generatedTimeline;
        next.timelineVersion = TIMELINE_SCHEMA_VERSION;
      }
    } catch {}
    if (!next.timeline.length) {
      next.timeline = [{
        id: crypto.randomUUID(),
        title: "Início da campanha",
        description: `${characterName} chega ao ponto em que a aventura de ${campaignName} começa.`,
        campaignMinute: campaignTime.campaignMinute,
        createdAt,
        kind: "milestone",
        tags: ["Início"],
        visibility: "public",
        importance: "major",
      }];
    }
    next.campaign.restartSnapshot = createCampaignRestartSnapshot(next);
    const localCampaignId = crypto.randomUUID();
    const record: CampaignLibraryEntry = {
      id: localCampaignId,
      state: next,
      createdAt,
      updatedAt: createdAt,
    };
    const nextLibrary = sortCampaigns([...campaignsRef.current, record]);
    campaignsRef.current = nextLibrary;
    setCampaigns(nextLibrary);
    writeCampaignLibrary(nextLibrary);
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, localCampaignId);
    campaignEpochRef.current += 1;
    activeCampaignIdRef.current = localCampaignId;
    setSceneImageBusy(false);
    setSceneImageError("");
    setSceneImageRetryNonce(0);
    setOpeningNarrationError("");
    sceneImageSearchInFlightRef.current = null;
    sceneImageFailedRef.current = null;
    openingNarrationAttemptRef.current = null;
    openingNarrationFailedRef.current = null;
    stateRef.current = next;
    setActiveCampaignId(localCampaignId);
    setState(next);
    setView("session");
    setScreen("campaign");
    await startCampaignOpening(next, "creation");
  }

  async function finishCharacterReplacement(result: NewCampaignResult) {
    const current = stateRef.current;
    const oldCharacter = current.character;
    const createdAt = new Date().toISOString();
    const replacement = characterFromNewCampaignResult(result);
    const deathMemory = {
      id: crypto.randomUUID(),
      kind: "event" as const,
      text: `${oldCharacter.name} morreu durante a campanha. A história continua sem apagar o que aconteceu.`,
      createdAt,
      campaignMinute: current.time.campaignMinute,
    };
    const arrivalMemory = {
      id: crypto.randomUUID(),
      kind: "event" as const,
      text: `${replacement.name}, ${replacement.archetype} de nível ${replacement.level}, passa a integrar a campanha após a morte de ${oldCharacter.name}.`,
      createdAt,
      campaignMinute: current.time.campaignMinute,
    };
    const newNpcs = result.companions.map((companion) => ({
      id: companion.id,
      name: companion.name,
      role: companion.role,
      relation: "friendly" as const,
      location: current.campaign.scene,
      appearance: companion.appearance.trim() || undefined,
    }));
    const existingNpcIds = new Set(newNpcs.map((npc) => npc.id));
    const next: GameState = {
      ...current,
      resourceModelVersion: 2,
      character: replacement,
      inventory: result.equipment,
      crafting: createInitialCraftingState(),
      npcs: [...current.npcs.filter((npc) => !existingNpcIds.has(npc.id)), ...newNpcs],
      memories: [arrivalMemory, deathMemory, ...current.memories],
      timeline: [
        ...(current.timeline || []),
        {
          id: crypto.randomUUID(),
          title: `Morte de ${oldCharacter.name}`,
          description: `${oldCharacter.name} atravessou o véu da morte.`,
          campaignMinute: current.time.campaignMinute,
          createdAt,
          kind: "milestone",
          tags: ["Morte"],
          visibility: "public",
          importance: "major",
        },
        {
          id: crypto.randomUUID(),
          title: `Chegada de ${replacement.name}`,
          description: `${replacement.name} entra na história no nível ${replacement.level}.`,
          campaignMinute: current.time.campaignMinute,
          createdAt,
          kind: "relationship",
          tags: ["Personagem"],
          visibility: "public",
          importance: "major",
        },
      ],
      pendingRoll: undefined,
      gmRecovery: undefined,
    };
    replacementCampaignId && setReplacementCampaignId(null);
    stateRef.current = next;
    setState(next);
    setInput("");
    setGmError("");
    setView("session");
    setScreen("campaign");
    if (bridge.status === "ready" && bridge.account?.connected && bridge.model) {
      await runGmNarration(
        next,
        [
          "ENTRADA DE NOVO PERSONAGEM APÓS A MORTE DO PERSONAGEM ANTERIOR.",
          `${oldCharacter.name} morreu e não deve ser ressuscitado ou tratado como se ainda estivesse agindo.`,
          `O novo personagem é ${replacement.name}, ${replacement.archetype}, nível ${replacement.level}.`,
          result.character.history.trim() ? `História do novo personagem: ${result.character.history.trim()}` : "",
          `A cena atual permanece ${current.campaign.scene}. Integre ${replacement.name} organicamente à história em andamento, preservando missões, NPCs, memória, tempo e consequências da campanha.`,
          "O jogador ainda não declarou uma ação com o novo personagem. Não peça uma rolagem e não decida ações por ele; narre apenas uma entrada plausível que devolva o controle ao jogador.",
        ].filter(Boolean).join("\n"),
        false,
      );
    }
  }

  function goHome() {
    setActiveDiceRoll(null);
    setShowDiceTray(false);
    diceRollSourcesRef.current.clear();
    diceRollPendingRefsRef.current.clear();
    diceRollCampaignRefsRef.current.clear();
    setScreen("home");
    setView("session");
  }

  async function restartCampaign(campaignId: string) {
    const target = campaignsRef.current.find((entry) => entry.id === campaignId);
    if (!target) return;
    const restarted = restartCampaignFromSnapshot(target.state);
    const updatedAt = new Date().toISOString();
    const next = campaignsRef.current.map((entry) =>
      entry.id === campaignId
        ? { ...entry, state: restarted, updatedAt }
        : entry,
    );
    campaignsRef.current = next;
    setCampaigns(next);
    writeCampaignLibrary(next);
    campaignEpochRef.current += 1;
    activeCampaignIdRef.current = campaignId;
    timelineSynthesisInFlightRef.current = null;
    sceneImageSearchInFlightRef.current = null;
    sceneImageFailedRef.current = null;
    openingNarrationAttemptRef.current = null;
    openingNarrationFailedRef.current = null;
    setActiveCampaignId(campaignId);
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, campaignId);
    setActiveDiceRoll(null);
    setShowDiceTray(false);
    setSceneImageBusy(false);
    setSceneImageError("");
    setSceneImageRetryNonce(0);
    setOpeningNarrationError("");
    diceRollSourcesRef.current.clear();
    diceRollPendingRefsRef.current.clear();
    diceRollCampaignRefsRef.current.clear();
    stateRef.current = restarted;
    setState(restarted);
    setInput("");
    setGmError("");
    setImageMessageId(null);
    setImageNote("");
    setView("session");
    setScreen("campaign");
    setCampaignAction(null);
    await startCampaignOpening(restarted, "restart");
  }

  async function deleteCampaign(campaignId: string) {
    const credentials = readCloudCredentialsForCampaign(campaignId);
    if (credentials) {
      try {
        const response = await fetch(`/api/campaigns/${credentials.campaignId}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${credentials.syncKey}` },
        });
        if (!response.ok && response.status !== 404) {
          setCampaignActionError("Não foi possível excluir a cópia da nuvem. Verifique a conexão e tente novamente.");
          return;
        }
      } catch {
        setCampaignActionError("Não foi possível falar com a nuvem. A campanha não foi excluída.");
        return;
      }
    }
    removeCloudMetadataForCampaign(campaignId);

    const next = campaignsRef.current.filter((entry) => entry.id !== campaignId);
    campaignsRef.current = next;
    setCampaigns(next);
    writeCampaignLibrary(next);

    if (activeCampaignId === campaignId) {
      setActiveDiceRoll(null);
      setShowDiceTray(false);
      diceRollSourcesRef.current.clear();
      diceRollPendingRefsRef.current.clear();
      diceRollCampaignRefsRef.current.clear();
      const replacement = sortCampaigns(next)[0] || null;
      if (replacement) {
        campaignEpochRef.current += 1;
        activeCampaignIdRef.current = replacement.id;
        stateRef.current = replacement.state;
        setActiveCampaignId(replacement.id);
        setState(replacement.state);
        localStorage.setItem(ACTIVE_CAMPAIGN_KEY, replacement.id);
      } else {
        campaignEpochRef.current += 1;
        activeCampaignIdRef.current = null;
        stateRef.current = initialState;
        setActiveCampaignId(null);
        setState(initialState);
        localStorage.removeItem(ACTIVE_CAMPAIGN_KEY);
      }
    }
    setCampaignAction(null);
  }

  function connectChatGPT() {
    setShowConnect(true);
  }

  async function logoutChatGPT() {
    await bridge.logout();
    setShowConnect(false);
  }

  function adjust(resource: "hp" | "hope" | "stress" | "armor", amount: number) {
    setState((current) => executeCommand(current, { type: "adjust", resource, amount }));
  }

  function updateTrackerAsPlayer(trackerId: string, amount: number) {
    const current = stateRef.current;
    const currentTracker = current.character.daggerheart?.trackers?.find((entry) => entry.id === trackerId);
    const effectiveAmount = currentTracker?.kind === "die" && amount > 0 && currentTracker.value >= currentTracker.max
      ? -currentTracker.value
      : amount;
    const next = executeCommand(current, { type: "tracker", trackerId, value: effectiveAmount, mode: "adjust" }, "player");
    stateRef.current = next;
    setState(next);
    const refreshed = next.character.daggerheart?.trackers?.find((entry) => entry.id === trackerId) || null;
    setTrackerEditor(refreshed);
  }

  function beginTrackerPress(tracker: CharacterTracker) {
    if (trackerPressTimerRef.current) clearTimeout(trackerPressTimerRef.current);
    trackerLongPressRef.current = false;
    trackerPressTimerRef.current = setTimeout(() => {
      trackerLongPressRef.current = true;
      setTrackerInfo(null);
      setTrackerEditor(stateRef.current.character.daggerheart?.trackers?.find((entry) => entry.id === tracker.id) || tracker);
    }, 1000);
  }

  function endTrackerPress(tracker: CharacterTracker) {
    if (trackerPressTimerRef.current) clearTimeout(trackerPressTimerRef.current);
    trackerPressTimerRef.current = null;
    if (!trackerLongPressRef.current) setTrackerInfo(tracker);
    trackerLongPressRef.current = false;
  }

  function cancelTrackerPress() {
    if (trackerPressTimerRef.current) clearTimeout(trackerPressTimerRef.current);
    trackerPressTimerRef.current = null;
    trackerLongPressRef.current = false;
  }

  function selectDeathMove(move: "avoid" | "glory" | "risk") {
    const next = chooseDeathMove(stateRef.current, move);
    stateRef.current = next;
    setState(next);
    if (next.pendingRoll?.purpose === "death-avoid") startDiceRoll(next.pendingRoll.formula || "1d12", "tray", false);
    if (next.pendingRoll?.purpose === "death-risk") startDiceRoll(next.pendingRoll.formula || "2d12", "tray", true);
  }

  function completeMilestoneLevelUp(plan: DaggerheartLevelUpPlan) {
    const current = stateRef.current;
    const pending = current.pendingLevelUp;
    const choice = plan[0];
    if (!pending || !choice) return;
    const completed = completePendingDaggerheartLevelUp(current, choice);
    if (completed.result.ok !== true) {
      const errors = Array.isArray(completed.result.errors)
        ? completed.result.errors.map(String).join(" ")
        : String(completed.result.error || "Não foi possível concluir a subida de nível.");
      setGmError(errors);
      return;
    }
    const nextLevel = completed.state.character.level;
    const milestone = completed.state.milestones?.find((entry) => entry.id === pending.milestoneId);
    const next: GameState = {
      ...completed.state,
      messages: [
        ...completed.state.messages,
        {
          id: crypto.randomUUID(),
          role: "system",
          text: `Milestone concluído: ${completed.state.character.name} alcançou o nível ${nextLevel}.`,
          createdAt: new Date().toISOString(),
          campaignMinute: completed.state.time.campaignMinute,
        },
      ],
      timeline: [
        ...(completed.state.timeline || []),
        {
          id: crypto.randomUUID(),
          title: milestone?.title || `Nível ${nextLevel}`,
          description: milestone?.reason || `${completed.state.character.name} alcançou o nível ${nextLevel}.`,
          campaignMinute: completed.state.time.campaignMinute,
          createdAt: new Date().toISOString(),
          kind: "milestone",
          tags: ["Milestone", `Nível ${nextLevel}`],
          visibility: "public",
          importance: "major",
        },
      ],
    };
    stateRef.current = next;
    setState(next);
    setGmError("");
  }

  function spendRiskRecovery(resource: "hp" | "stress") {
    const next = spendDeathRecoveryPoint(stateRef.current, resource);
    stateRef.current = next;
    setState(next);
  }

  function updateDiceAppearances(next: DiceAppearanceOverrides) {
    const normalized = normalizeDiceAppearanceFonts(next);
    setDiceAppearances(normalized);
    try {
      localStorage.setItem(DICE_APPEARANCE_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Appearance preferences are device-local and non-critical.
    }
  }

  function pendingAllowsFormula(formula: string, current: GameState) {
    const parsed = parseDiceFormula(formula);
    const pending = current.pendingRoll;
    if (!pending) return parsed;
    if (pending.formula) {
      const requested = parseDiceFormula(pending.formula);
      if (requested.normalized !== parsed.normalized) {
        throw new Error(`O Mestre pediu ${requested.normalized}. Use essa fórmula para continuar a cena.`);
      }
    }
    if (pending.allowedDice?.length) {
      const allowed = new Set(pending.allowedDice);
      const invalid = parsed.terms.find((term) => !allowed.has(`d${term.sides}` as DiceType));
      if (invalid) throw new Error(`Essa rolagem aceita apenas: ${pending.allowedDice.join(", ")}.`);
    }
    return parsed;
  }

  function dualityResultLabel(result: DiceRollResult) {
    const hope = result.dice.find((die) => die.appearance === "hope");
    const fear = result.dice.find((die) => die.appearance === "fear");
    if (!hope || !fear) return undefined;
    if (hope.value === fear.value) return `Crítico de Dualidade · Esperança ${hope.value} / Medo ${fear.value}`;
    return hope.value > fear.value
      ? `Com Esperança · ${hope.value} contra ${fear.value}`
      : `Com Medo · ${fear.value} contra ${hope.value}`;
  }

  function startDiceRoll(formula: string, source: "tray" | "slash", duality = false) {
    if (gmRunningRef.current) {
      setDiceNote("Aguarde o Mestre terminar a narração antes de rolar.");
      return;
    }
    if (activeDiceRoll) {
      setDiceNote("Aguarde a rolagem atual terminar.");
      return;
    }
    try {
      const current = stateRef.current;
      const parsed = pendingAllowsFormula(formula, current);
      const useDuality = duality || current.pendingRoll?.rollKind === "duality";
      let appearanceByDie: DiceAppearanceRole[] | undefined;
      if (useDuality) {
        const positiveD12Count = parsed.terms
          .filter((term) => term.sign > 0 && term.sides === 12)
          .reduce((total, term) => total + term.count, 0);
        if (positiveD12Count !== 2) {
          throw new Error("Uma rolagem de Dualidade precisa conter exatamente 2d12: um de Esperança e um de Medo.");
        }
        appearanceByDie = [];
        let d12Index = 0;
        for (const term of parsed.terms) {
          for (let die = 0; die < term.count; die += 1) {
            if (term.sides === 12 && term.sign > 0 && d12Index < 2) {
              appearanceByDie.push(d12Index === 0 ? "hope" : "fear");
              d12Index += 1;
            } else {
              appearanceByDie.push("normal");
            }
          }
        }
      }
      const result = rollDice(parsed, { appearanceByDie });
      diceRollSourcesRef.current.set(result.id, source);
      diceRollPendingRefsRef.current.set(result.id, current.pendingRoll?.id ?? null);
      diceRollCampaignRefsRef.current.set(result.id, {
        campaignId: activeCampaignIdRef.current,
        epoch: campaignEpochRef.current,
      });
      setDiceNote("");
      setActiveDiceRoll(result);
      setShowDiceTray(false);
    } catch (error) {
      setDiceNote(error instanceof Error ? error.message : "Não foi possível preparar a rolagem.");
      setShowDiceTray(true);
    }
  }

  async function finishDiceRoll(result: DiceRollResult, visualError?: Error) {
    if (processedDiceRollsRef.current.has(result.id)) return;
    processedDiceRollsRef.current.add(result.id);
    setActiveDiceRoll(null);
    const source = diceRollSourcesRef.current.get(result.id) || "tray";
    diceRollSourcesRef.current.delete(result.id);
    const expectedPendingRollId = diceRollPendingRefsRef.current.get(result.id) ?? null;
    diceRollPendingRefsRef.current.delete(result.id);
    const rollCampaign = diceRollCampaignRefsRef.current.get(result.id);
    diceRollCampaignRefsRef.current.delete(result.id);
    if (
      !rollCampaign
      || rollCampaign.campaignId !== activeCampaignIdRef.current
      || rollCampaign.epoch !== campaignEpochRef.current
    ) {
      setDiceNote("A rolagem foi descartada porque a campanha mudou antes de ela terminar.");
      return;
    }

    const current = stateRef.current;
    const diceSummary = result.dice.map((die) => `d${die.sides}: ${die.value}`).join(", ");
    const dualityLabel = dualityResultLabel(result);
    const hopeDie = result.dice.find((die) => die.appearance === "hope");
    const fearDie = result.dice.find((die) => die.appearance === "fear");
    const dualityCritical = current.pendingRoll?.rollKind === "duality"
      && hopeDie !== undefined
      && fearDie !== undefined
      && hopeDie.value === fearDie.value;
    const resultLine = `${result.normalized} → ${result.total}${diceSummary ? ` (${diceSummary})` : ""}${dualityLabel ? ` · ${dualityLabel}` : ""}`;
    const rollMessage: Message = {
      id: crypto.randomUUID(),
      role: "system",
      text: `🎲 ${resultLine}`,
      createdAt: new Date().toISOString(),
      campaignMinute: current.time.campaignMinute,
    };

    const matchesPendingRoll = current.pendingRoll?.id === expectedPendingRollId && expectedPendingRollId !== null;
    if (!matchesPendingRoll) {
      const next = { ...current, messages: [...current.messages, rollMessage] };
      stateRef.current = next;
      setState(next);
      if (current.pendingRoll && expectedPendingRollId !== current.pendingRoll.id) {
        setDiceNote("A rolagem terminou, mas o Mestre pediu outra rolagem depois que ela começou. Faça a rolagem solicitada para continuar.");
      }
      if (visualError) setDiceNote("A animação 3D não pôde ser exibida, mas o resultado da rolagem foi preservado.");
      return;
    }

    const craftAttempt = current.crafting?.pendingAttempt;
    const resolvesCraft = Boolean(
      craftAttempt
      && craftAttempt.stage === "awaiting-roll"
      && craftAttempt.pendingRollId === expectedPendingRollId
      && craftAttempt.recipeId,
    );
    let next = resolvePendingRoll(current, expectedPendingRollId, {
      total: result.total,
      formula: result.normalized,
      dice: result.dice.map((die) => ({
        die: `d${die.sides}` as DiceType,
        value: die.value,
        label: die.appearance === "hope" ? "Esperança" : die.appearance === "fear" ? "Medo" : undefined,
      })),
      modifier: result.modifier,
      result: dualityLabel,
      success: dualityCritical ? true : undefined,
      source,
    });
    let craftNarration = "";
    if (resolvesCraft && craftAttempt?.recipeId) {
      const recipe = current.crafting.recipes.find((entry) => entry.id === craftAttempt.recipeId);
      if (recipe) {
        try {
          const craftSystem = current.campaign.system.toLocaleLowerCase("pt-BR").includes("daggerheart")
            ? "daggerheart" as const
            : "d20" as const;
          const craftDice = craftSystem === "daggerheart"
            ? result.dice.filter((die) => die.sides === 12).map((die) => die.value).slice(0, 2)
            : result.dice.filter((die) => die.sides === 20).map((die) => die.value).slice(0, 1);
          const resolvedCraft = resolveCraftAttempt(current.crafting, current.inventory, recipe, {
            system: craftSystem,
            dice: craftDice,
          });
          const crafting = resolvedCraft.success
            ? resolvedCraft.crafting
            : rejectCraftAttempt(resolvedCraft.crafting, craftAttempt.id);
          next = { ...next, crafting, inventory: resolvedCraft.inventory };
          craftNarration = resolvedCraft.success
            ? `CRAFT RESOLVIDO PELO MOTOR: SUCESSO${resolvedCraft.critical ? " CRÍTICO" : ""}. ${recipe.name} foi produzido como ${resolvedCraft.finalRarity}; ${resolvedCraft.xpAwarded} XP de ${recipe.discipline} foram concedidos. Os ingredientes já foram consumidos e o resultado já está no inventário. Narre apenas a consequência, sem repetir ferramentas.`
            : `CRAFT RESOLVIDO PELO MOTOR: FALHA. Nenhum material foi consumido e nenhum XP foi concedido. Narre a falha sem alterar inventário ou pedir nova rolagem automaticamente.`;
        } catch (error) {
          next = { ...next, crafting: rejectCraftAttempt(current.crafting, craftAttempt.id) };
          craftNarration = `A resolução do craft foi cancelada com segurança porque o estado mudou: ${error instanceof Error ? error.message : "erro de validação"}. Não consuma materiais.`;
        }
      }
    }
    const withMessage: GameState = { ...next, messages: [...next.messages, rollMessage] };
    stateRef.current = withMessage;
    setState(withMessage);
    if (visualError) setDiceNote("A animação 3D falhou, mas o resultado foi enviado ao Mestre.");

    const latestRoll = withMessage.rollHistory?.at(-1);
    const outcome = latestRoll?.outcome === "success"
      ? "SUCESSO"
      : latestRoll?.outcome === "failure"
        ? "FALHA"
        : "SEM DESFECHO AUTOMÁTICO";
    await runGmNarration(
      withMessage,
      `RESULTADO DA ROLAGEM SOLICITADA: ${resultLine}. Resultado contra o alvo: ${outcome}. ${craftNarration} Continue exatamente do ponto em que a cena aguardava esta rolagem.`,
      !craftNarration,
    );
  }

  function toggleQuestStatus(questId: string) {
    setState((current) => {
      const quest = current.quests.find((entry) => entry.id === questId);
      if (!quest) return current;
      const nextStatus = quest.status === "active" ? "completed" : "active";
      let next = executeCommand(current, { type: "quest", questId, status: nextStatus });
      const linkedEvent = next.time.events.find((entry) => entry.sourceId === questId);
      if (linkedEvent) {
        next = {
          ...next,
          time: updateCalendarEvent(next.time, linkedEvent.id, { completed: nextStatus === "completed" }),
        };
      }
      return next;
    });
  }

  async function startCraftAttempt(discipline: CraftDiscipline, selectedSlots: CraftingWorkshopSlot[], intent: string) {
    if (gmBusy || gmRunningRef.current || activeDiceRoll || stateRef.current.pendingRoll) return;
    if (countOccupiedCraftSlots(selectedSlots) < 2) return;
    if (bridge.status !== "ready" || !bridge.account?.connected || !bridge.model) {
      setShowConnect(true);
      return;
    }
    const current = ensureGameStateCrafting(stateRef.current);
    const ingredients: CraftIngredient[] = selectedSlots.map((slot) => ({
      slot: slot.slot,
      ...(slot.sourceId ? { sourceId: slot.sourceId } : {}),
      ...(slot.itemId ? { itemId: slot.itemId } : {}),
      itemName: slot.itemName,
      quantity: slot.quantity,
    }));
    try {
      const knownRecipe = findMatchingRecipe(current.crafting.recipes, discipline, ingredients);
      const started = beginCraftAttempt(current.crafting, current.inventory, {
        id: crypto.randomUUID(),
        discipline,
        ingredients,
        ...(intent.trim() ? { intent: intent.trim().slice(0, 500) } : {}),
        ...(knownRecipe ? { recipeId: knownRecipe.id } : {}),
        requestedAt: new Date().toISOString(),
      });
      const working: GameState = { ...current, crafting: started.crafting };
      stateRef.current = working;
      setState(working);
      setView("session");
      const exactGrid = ingredients
        .sort((a, b) => a.slot - b.slot)
        .map((ingredient) => `slot ${ingredient.slot + 1}: ${ingredient.itemName} ×${ingredient.quantity}`)
        .join("; ");
      const craftSystem = current.campaign.system.toLocaleLowerCase("pt-BR").includes("daggerheart") ? "daggerheart" as const : "d20" as const;
      const craftLevel = craftLevelForXp(current.crafting.progress[discipline].xp);
      const rarityLabels: Record<CraftRarity, string> = {
        common: "Comum",
        uncommon: "Incomum",
        rare: "Raro",
        "very-rare": "Muito raro",
        legendary: "Lendário",
      };
      const chanceTable = (["common", "uncommon", "rare", "very-rare"] as CraftRarity[])
        .filter((rarity) => canCraftRarity(craftLevel, rarity))
        .map((rarity) => {
          const profile = craftSuccessChanceFor(craftLevel, rarity, craftSystem);
          return `${rarityLabels[rarity]}: ${profile.successChance}% (${profile.formula}, CD ${profile.dc})`;
        })
        .join("; ");
      await runGmNarration(
        working,
        [
          "SOLICITAÇÃO DE CRAFTING DO JOGADOR.",
          `Disciplina: ${discipline}. Nível de craft: ${craftLevel}.`,
          `Grid exato: ${exactGrid}.`,
          started.attempt.intent
            ? `INTENÇÃO DECLARADA PELO JOGADOR: ${started.attempt.intent}`
            : "O jogador não descreveu uma intenção específica; avalie apenas pelos materiais e pela disciplina.",
          `Chances de sucesso permitidas pelo nível atual: ${chanceTable}.`,
          knownRecipe
            ? `A combinação corresponde à receita conhecida ${knownRecipe.name} (recipeId=${knownRecipe.id}). Valide o estado e use craft_request_roll.`
            : "A combinação não corresponde a uma receita conhecida. Avalie se ela faz sentido. Se fizer, registre a descoberta com craft_recipe_learn usando fromPendingAttempt=true e depois use craft_request_roll. Se não fizer, use craft_reject_attempt.",
          "Não narre sucesso ou falha antes de a rolagem ser resolvida.",
        ].join("\n"),
        true,
      );
      const afterNarration = stateRef.current;
      if (
        afterNarration.crafting.pendingAttempt?.id === started.attempt.id
        && afterNarration.crafting.pendingAttempt.stage === "review"
        && !afterNarration.pendingRoll
      ) {
        const unlocked = {
          ...afterNarration,
          crafting: rejectCraftAttempt(afterNarration.crafting, started.attempt.id),
        };
        stateRef.current = unlocked;
        setState(unlocked);
      }
    } catch (error) {
      setGmError(error instanceof Error ? error.message : "Não foi possível iniciar o crafting.");
    }
  }

  async function startCampaignOpening(working: GameState, source: "creation" | "restart") {
    if (working.messages.some((message) => message.role === "gm")) return;
    if (bridge.status !== "ready" || !bridge.account?.connected || !bridge.model) {
      setShowConnect(true);
      return;
    }
    const campaignId = activeCampaignIdRef.current;
    if (!campaignId) return;
    const key = `${campaignId}:${campaignEpochRef.current}:opening`;
    if (openingNarrationAttemptRef.current === key || gmRunningRef.current) return;
    openingNarrationAttemptRef.current = key;
    openingNarrationFailedRef.current = null;
    setOpeningNarrationError("");
    setGmError("");
    await runGmNarration(
      working,
      buildCampaignOpeningPrompt(working, source),
      true,
      ["scene_set", "set_weather"],
    );
    if (stateRef.current.messages.some((message) => message.role === "gm")) {
      openingNarrationFailedRef.current = null;
      setOpeningNarrationError("");
      return;
    }
    openingNarrationFailedRef.current = key;
    setOpeningNarrationError("Não foi possível iniciar a primeira cena. Você pode tentar novamente.");
  }

  function retryCampaignOpening() {
    openingNarrationAttemptRef.current = null;
    openingNarrationFailedRef.current = null;
    setOpeningNarrationError("");
    void startCampaignOpening(stateRef.current, "creation");
  }

  async function runGmNarration(
    working: GameState,
    text: string,
    allowTools = true,
    allowedToolNames?: string[],
    finalizeLastGlory = false,
  ) {
    if (bridge.status !== "ready" || !bridge.account?.connected || !bridge.model) {
      const deferred: GameState = {
        ...working,
        gmRecovery: working.gmRecovery?.text === text ? working.gmRecovery : {
          text, allowTools, allowedToolNames, finalizeLastGlory, appliedTools: [],
        },
      };
      stateRef.current = deferred;
      setState(deferred);
      setGmError("A resposta do Mestre está aguardando conexão. Seu progresso foi preservado.");
      setShowConnect(true);
      return;
    }
    if (gmRunningRef.current) return;

    gmRunningRef.current = true;
    const runCampaignId = activeCampaignIdRef.current;
    const runCampaignEpoch = campaignEpochRef.current;
    const runIsCurrent = () =>
      activeCampaignIdRef.current === runCampaignId
      && campaignEpochRef.current === runCampaignEpoch;
    setGmBusy(true);
    setGmError("");
    setShowDiceTray(false);
    try {
      const result = await runGmTurn(working, text, bridge.respond, {
        model: bridge.model,
        allowTools,
        allowedToolNames,
        finalizeLastGlory,
        isCurrent: runIsCurrent,
        onProgress: (next) => {
          if (!runIsCurrent()) return;
          working = next;
          stateRef.current = next;
          setState(next);
        },
      });
      if (!runIsCurrent()) return;
      working = result.state;
      let narration = result.narration || result.refusal;
      if (!narration) throw new Error("O Mestre não retornou uma mensagem narrativa. Retome a resposta para continuar.");
      narration = formatNarrationText(narration);
      const sceneSnapshot = buildSceneSnapshot(working, narration);
      working = {
        ...working,
        messages: [
          ...working.messages,
          {
            id: crypto.randomUUID(),
            role: "gm",
            text: narration,
            createdAt: new Date().toISOString(),
            campaignMinute: working.time.campaignMinute,
            sceneSnapshot,
          },
        ],
      };
      if (finalizeLastGlory && working.character.death?.status === "last-glory") {
        working = resolveLastGloryDeath(working);
      }
      stateRef.current = working;
      setState(working);
    } catch (error) {
      if (!runIsCurrent()) return;
      const message = error instanceof Error ? error.message : "Falha ao consultar o Mestre.";
      setGmError(message);
      const current = stateRef.current;
      const failed: GameState = {
        ...current,
        gmRecovery: current.gmRecovery || working.gmRecovery || {
          text, allowTools, allowedToolNames, finalizeLastGlory, appliedTools: [],
        },
        messages: [
          ...current.messages,
          { id: crypto.randomUUID(), role: "system", text: `Mestre IA indisponível: ${message}`, createdAt: new Date().toISOString(), campaignMinute: current.time.campaignMinute },
        ],
      };
      stateRef.current = failed;
      setState(failed);
    } finally {
      gmRunningRef.current = false;
      setGmBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || gmBusy || gmRunningRef.current || playerActionsBlocked) return;

    const dualityFormula = dualityFormulaFromCommand(text);
    if (dualityFormula) {
      if (state.campaign.system !== "Daggerheart") {
        setInput("");
        setDiceNote("O comando /dr está disponível apenas em campanhas Daggerheart.");
        return;
      }
      setInput("");
      setGmError("");
      const requestedFormula = state.pendingRoll?.rollKind === "duality" && state.pendingRoll.formula
        ? state.pendingRoll.formula
        : dualityFormula;
      startDiceRoll(requestedFormula, "slash", true);
      return;
    }

    if (/^\/r\b/i.test(text)) {
      setInput("");
      setGmError("");
      startDiceRoll(text, "slash", state.pendingRoll?.rollKind === "duality");
      return;
    }

    if (activeDiceRoll) {
      setDiceNote("Aguarde a rolagem terminar antes de enviar uma nova ação ao Mestre.");
      return;
    }

    if (state.pendingRoll) {
      setGmError(`O Mestre está aguardando: ${state.pendingRoll.label}. Role os dados pelo ícone ou use /r.`);
      return;
    }
    if (stateRef.current.gmRecovery) {
      if (/^(?:continu(?:a|ar|e)|(?:gere|gerar|tente|tentar)\s+novamente|retom(?:e|ar))\b/i.test(text)) {
        setInput("");
        await retryGmNarration();
      } else {
        setGmError("Retome a resposta pendente do Mestre antes de enviar uma nova ação.");
      }
      return;
    }

    const playerMessage = { id: crypto.randomUUID(), role: "player" as const, text, createdAt: new Date().toISOString(), campaignMinute: state.time.campaignMinute };
    const working: GameState = { ...state, messages: [...state.messages, playerMessage] };
    setState(working);
    stateRef.current = working;
    setInput("");
    setGmError("");

    if (bridge.status !== "ready" || !bridge.account?.connected || !bridge.model) {
      setShowConnect(true);
      return;
    }
    await runGmNarration(working, text, true, undefined, working.character.death?.status === "last-glory");
  }

  async function retryGmNarration() {
    if (gmBusy || gmRunningRef.current || activeDiceRoll || stateRef.current.pendingRoll) return;
    const working = stateRef.current;
    const recovery = working.gmRecovery;
    if (!recovery) return;
    await runGmNarration(working, recovery.text, recovery.allowTools, recovery.allowedToolNames, recovery.finalizeLastGlory);
  }

  async function regenerateNarration(message: Message) {
    if (gmBusy || gmRunningRef.current || activeDiceRoll || message.role !== "player") return;
    if (stateRef.current.gmRecovery) {
      await retryGmNarration();
      return;
    }
    if (bridge.status !== "ready" || !bridge.account?.connected || !bridge.model) {
      setShowConnect(true);
      return;
    }
    const playerIndex = state.messages.findIndex((entry) => entry.id === message.id);
    if (playerIndex < 0) return;
    const playerTime = Date.parse(message.createdAt);
    const persistentChangesAlreadyApplied = state.events.some((event) =>
      event.actor === "gm-ai"
      && Number.isFinite(playerTime)
      && Date.parse(event.createdAt) >= playerTime
    );
    const working: GameState = {
      ...state,
      messages: state.messages.slice(0, playerIndex + 1),
    };
    setGmError("");
    stateRef.current = working;
    setState(working);
    await runGmNarration(working, message.text, true,
      persistentChangesAlreadyApplied ? ["request_player_roll", "memory_search"] : undefined);
  }

  if (screen === "home") {
    return (
      <main className="appShell homeShell">
        <div className="ambient ambientOne" />
        <div className="ambient ambientTwo" />
        <section className="homeScreen">
          <div className="homeBrand">
            <div className="homeSigil"><img src="/oracle-mark.svg" alt="" /></div>
            <small>ORACLE RPG</small>
            <h1>Onde histórias<br />ganham memória.</h1>
            <p>Campanhas persistentes conduzidas pelo seu Mestre IA.</p>
          </div>

          <div className="homeMenu">
            <button className="homeMenuCard primaryCard" onClick={() => setScreen("newCampaign")}>
              <span className="homeMenuIcon">✦</span>
              <div><strong>Nova campanha</strong><small>Comece uma nova história</small></div>
              <b>›</b>
            </button>

            <button className="homeMenuCard" onClick={openCampaignLibrary} disabled={!hasSavedCampaign}>
              <span className="homeMenuIcon">◈</span>
              <div>
                <strong>Continuar campanha</strong>
                <small>{hasSavedCampaign ? `${campaigns.length} ${campaigns.length === 1 ? "campanha salva" : "campanhas salvas"}` : "Nenhuma campanha salva"}</small>
              </div>
              <b>›</b>
            </button>

            <button className="homeMenuCard" onClick={() => setScreen("compendium")}>
              <span className="homeMenuIcon">⌘</span>
              <div><strong>Compêndio</strong><small>Regras, criaturas, itens e magias</small></div>
              <b>›</b>
            </button>

            <button className="homeMenuCard" onClick={() => setScreen("settings")}>
              <span className="homeMenuIcon">⚙</span>
              <div><strong>Configurações</strong><small>ChatGPT, nuvem e preferências</small></div>
              <b>›</b>
            </button>
          </div>

          <div className="homeFooter">
            <span className={bridge.account?.connected ? "onlineDot connected" : "onlineDot"} />
            {bridge.account?.connected ? "ChatGPT conectado" : "Mestre IA desconectado"}
          </div>
        </section>
      </main>
    );
  }

  if (screen === "campaigns") {
    const orderedCampaigns = sortCampaigns(campaigns);
    const actionTarget = campaignAction
      ? orderedCampaigns.find((entry) => entry.id === campaignAction.campaignId) || null
      : null;

    return (
      <main className="appShell campaignLibraryShell">
        <div className="ambient ambientOne" />
        <div className="ambient ambientTwo" />
        <header className="menuPageHeader">
          <button className="backButton" onClick={goHome}>‹</button>
          <div><small>SUAS HISTÓRIAS</small><strong>Continuar campanha</strong></div>
        </header>
        <section className="campaignLibraryContent">
          <div className="campaignLibraryIntro">
            <div>
              <small>ARQUIVO DO ORACLE</small>
              <h1>Escolha uma campanha.</h1>
              <p>Cada campanha mantém ficha, memória, mensagens e sincronização de forma independente.</p>
            </div>
            <button className="campaignLibraryNew" onClick={() => setScreen("newCampaign")}>✦ Nova campanha</button>
          </div>

          <div className="campaignLibraryList">
            {orderedCampaigns.map((entry) => {
              const campaignState = entry.state;
              const portrait = campaignState.character.daggerheart?.image;
              const activity = campaignActivityAt(campaignState);
              const cloudLinked = Boolean(readCloudCredentialsForCampaign(entry.id));
              return (
                <article className={"campaignLibraryCard " + (entry.id === activeCampaignId ? "active" : "")} key={entry.id}>
                  <div className="campaignLibraryPortrait">
                    {portrait
                      ? <img src={portrait} alt="" />
                      : <span>{campaignState.character.name.slice(0, 1).toUpperCase()}</span>}
                  </div>
                  <div className="campaignLibraryMain">
                    <div className="campaignLibraryTitleRow">
                      <div>
                        <small>{campaignState.campaign.system} · Sessão {campaignState.campaign.session}</small>
                        <h2>{campaignState.campaign.name}</h2>
                      </div>
                      {cloudLinked && <em>☁ Nuvem</em>}
                    </div>
                    <p>{campaignState.character.name} · {campaignState.character.archetype}</p>
                    <div className="campaignLibraryMeta">
                      <span>◉ {campaignState.messages.length} mensagens</span>
                      <span>◇ {campaignState.memories.length} memórias</span>
                      <span>Última atividade: {new Date(activity).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="campaignLibraryActions">
                    <button className="open" onClick={() => openCampaign(entry.id)}>Abrir campanha</button>
                    <button
                      className="restart"
                      onClick={() => {
                        setCampaignActionError("");
                        setCampaignAction({ type: "restart", campaignId: entry.id, step: 0 });
                      }}
                    >↺ Recomeçar</button>
                    <button
                      className="delete"
                      onClick={() => {
                        setCampaignActionError("");
                        setCampaignAction({ type: "delete", campaignId: entry.id, step: 0 });
                      }}
                    >Excluir</button>
                  </div>
                </article>
              );
            })}
            {!orderedCampaigns.length && (
              <div className="campaignLibraryEmpty">
                <b>◇</b>
                <h3>Nenhuma campanha salva</h3>
                <p>Crie uma nova campanha para começar uma história.</p>
              </div>
            )}
          </div>

          {actionTarget && campaignAction && (
            <div className="modalBackdrop" onClick={() => {
              setCampaignAction(null);
              setCampaignActionError("");
            }}>
              <section className="connectModal campaignActionModal" onClick={(event) => event.stopPropagation()}>
                <div className={"campaignActionIcon " + campaignAction.type}>{campaignAction.type === "restart" ? "↺" : "×"}</div>
                <small>{campaignAction.type === "restart" ? "RECOMEÇAR CAMPANHA" : "EXCLUIR CAMPANHA"}</small>
                <h2>
                  {campaignAction.type === "restart"
                    ? campaignAction.step === 0 ? "Voltar esta campanha ao início?" : "Apagar todo o progresso desta campanha?"
                    : campaignAction.step === 0 ? "Excluir esta campanha?" : "Esta exclusão é permanente."}
                </h2>
                {campaignAction.type === "restart" ? (
                  campaignAction.step === 0 ? (
                    <>
                      <p>
                        <b>{actionTarget.state.campaign.name}</b> voltará ao momento em que a criação do personagem terminou.
                        As outras campanhas não serão alteradas.
                      </p>
                      <div className="restartWhatResets">
                        <span>✦ Mensagens posteriores serão removidas</span>
                        <span>◉ Memórias posteriores serão removidas</span>
                        <span>◇ Ficha, recursos e inventário voltarão ao estado inicial</span>
                        <span>⌘ NPCs e missões criados depois serão removidos</span>
                      </div>
                      <button
                        className="dangerGhost restartContinue"
                        onClick={() => setCampaignAction({ ...campaignAction, step: 1 })}
                      >Continuar</button>
                    </>
                  ) : (
                    <>
                      <p>Somente <b>{actionTarget.state.campaign.name}</b> será reiniciada. O estado reiniciado será sincronizado com a nuvem quando essa campanha for aberta.</p>
                      <button className="restartConfirmDanger" onClick={() => void restartCampaign(actionTarget.id)}>Sim, recomeçar esta campanha</button>
                      <button className="ghost" onClick={() => setCampaignAction({ ...campaignAction, step: 0 })}>Voltar</button>
                    </>
                  )
                ) : (
                  campaignAction.step === 0 ? (
                    <>
                      <p>
                        Isso removerá <b>{actionTarget.state.campaign.name}</b> da lista deste dispositivo
                        {readCloudCredentialsForCampaign(actionTarget.id) ? " e também tentará remover a cópia sincronizada da nuvem." : "."}
                      </p>
                      <button
                        className="dangerGhost restartContinue"
                        onClick={() => setCampaignAction({ ...campaignAction, step: 1 })}
                      >Continuar</button>
                    </>
                  ) : (
                    <>
                      <p>Ficha, mensagens, memórias e progresso desta campanha serão removidos. As demais campanhas permanecem intactas.</p>
                      <button className="restartConfirmDanger" onClick={() => void deleteCampaign(actionTarget.id)}>Sim, excluir esta campanha</button>
                      <button className="ghost" onClick={() => setCampaignAction({ ...campaignAction, step: 0 })}>Voltar</button>
                    </>
                  )
                )}
                {campaignActionError && <p className="modalNote">{campaignActionError}</p>}
                <button className="closeText" onClick={() => {
                  setCampaignAction(null);
                  setCampaignActionError("");
                }}>Cancelar</button>
              </section>
            </div>
          )}
        </section>
      </main>
    );
  }

  if (screen === "newCampaign") {
    const replacing = Boolean(replacementCampaignId);
    const replacementState = replacementCampaignId
      ? campaignsRef.current.find((entry) => entry.id === replacementCampaignId)?.state || stateRef.current
      : null;
    return (
      <NewCampaignWizard
        ai={newCampaignAi}
        mode={replacing ? "replacement" : "new"}
        fixedLevel={replacementState?.character.level}
        campaignDefaults={replacementState ? {
          name: replacementState.campaign.name,
          tone: replacementState.campaign.tone || "Personalizado",
          adventureHook: replacementState.campaign.adventureHook,
        } : undefined}
        onBack={replacing ? () => {
          setReplacementCampaignId(null);
          setView("session");
          setScreen("campaign");
        } : goHome}
        onComplete={replacing ? finishCharacterReplacement : finishNewCampaign}
      />
    );
  }

  if (screen === "compendium") {
    return <DaggerheartCompendium onBack={goHome} />;
  }

  if (screen === "diceAppearance") {
    return (
      <DiceAppearanceSettings
        daggerheart={state.campaign.system === "Daggerheart"}
        appearances={diceAppearances}
        onChange={updateDiceAppearances}
        onBack={() => setScreen("settings")}
      />
    );
  }

  if (screen === "settings") {
    return (
      <main className="appShell menuPageShell">
        <div className="ambient ambientOne" />
        <div className="ambient ambientTwo" />
        <header className="menuPageHeader">
          <button className="backButton" onClick={goHome}>‹</button>
          <div><small>ORACLE RPG</small><strong>Configurações</strong></div>
        </header>
        <section className="menuPageContent">
          <div className="menuPageIntro"><small>PREFERÊNCIAS</small><h1>Seu Oracle, do seu jeito.</h1></div>
          <div className="settingsList">
            <button onClick={connectChatGPT}>
              <span className="settingsIcon">✦</span>
              <div><strong>ChatGPT</strong><small>{bridge.account?.connected ? bridge.account.name || bridge.account.email || "Conectado" : "Conectar Mestre IA"}</small></div>
              <em className={bridge.account?.connected ? "statusConnected" : ""}>{bridge.account?.connected ? "Conectado" : "Configurar"}</em>
            </button>
            <button onClick={() => setShowSync(true)}>
              <span className="settingsIcon">☁</span>
              <div><strong>Sincronização</strong><small>{activeCampaignId ? "Campanha ativa entre seus dispositivos" : "Importe uma campanha de outro dispositivo"}</small></div>
              <em>{activeCampaignId ? cloudLabel : "Importar"}</em>
            </button>
            <button onClick={() => setScreen("diceAppearance")}>
              <span className="settingsIcon">◆</span>
              <div><strong>Aparência dos dados</strong><small>Temas, texturas, fontes, materiais e presets 3D</small></div>
              <em>Personalizar</em>
            </button>
            <div className="settingsInfo">
              <span className="settingsIcon">ⓘ</span>
              <div><strong>OracleRPG SWIG</strong><small>Sign in with ChatGPT · canal standalone</small></div>
              <em>v0.2.6+</em>
            </div>
          </div>
        </section>

        {showSync && (
          <div className="modalBackdrop" onClick={() => setShowSync(false)}>
            <section className="connectModal syncModal" onClick={(e) => e.stopPropagation()}>
              <img src="/oracle-mark.svg" alt="" />
              <small>SINCRONIZAÇÃO</small>
              <h2>Campanha em todos os seus dispositivos</h2>
              {!cloud.credentials ? (
                <>
                  <p>{activeCampaignId ? "Crie uma campanha sincronizada ou abra uma existente usando o código de pareamento." : "Cole o código de pareamento de outro dispositivo para trazer a campanha da nuvem."}</p>
                  {activeCampaignId && (
                    <>
                      <button className="primary enabled" onClick={createCloudCampaign}>Ativar sincronização</button>
                      <div className="divider"><span>ou</span></div>
                    </>
                  )}
                  <label className="pairField"><span>Código existente</span><input value={pairInput} onChange={(event) => setPairInput(event.target.value)} placeholder="campaign-id.chave" /></label>
                  <button className="ghost" onClick={joinCloudCampaign} disabled={!pairInput.trim()}>{activeCampaignId ? "Abrir campanha sincronizada" : "Importar campanha da nuvem"}</button>
                </>
              ) : (
                <>
                  <div className="syncState"><i className={cloud.status} /><div><small>ESTADO DA NUVEM</small><strong>{cloudLabel}</strong></div></div>
                  <button className="pairCode" onClick={copyPairCode}>{cloud.pairCode}</button>
                  <button className="ghost" onClick={() => cloud.fetchRemote()}>Atualizar agora</button>
                </>
              )}
              {syncNote && <p className="modalNote">{syncNote}</p>}
              <button className="closeText" onClick={() => setShowSync(false)}>Fechar</button>
            </section>
          </div>
        )}

        {showConnect && (
          <div className="modalBackdrop" onClick={() => setShowConnect(false)}>
            <section className="connectModal" onClick={(e) => e.stopPropagation()}>
              <img src="/oracle-mark.svg" alt="" />
              <small>MESTRE IA</small>
              <h2>{bridge.account?.connected ? "ChatGPT conectado" : "Conectar com ChatGPT"}</h2>
              {bridge.account?.connected ? (
                <>
                  <p>Conectado como <b>{bridge.account.name || bridge.account.email || "conta ChatGPT"}</b>.</p>
                  <button className="ghost" onClick={logoutChatGPT}>Desconectar</button>
                </>
              ) : bridge.status === "ready" ? (
                <button className="primary enabled" onClick={() => bridge.connect()}>Continuar com ChatGPT</button>
              ) : (
                <p>O runtime local do Oracle ainda não foi detectado.</p>
              )}
              <button className="closeText" onClick={() => setShowConnect(false)}>Fechar</button>
            </section>
          </div>
        )}

      </main>
    );
  }

  return (
    <main className="appShell">
      <div className="ambient ambientOne" />
      <div className="ambient ambientTwo" />

      <header className="topbar">
        <button className="brand brandButton" onClick={goHome}>
          <img src="/oracle-mark.svg" alt="" />
          <div><b>ORACLE</b><span>RPG</span></div>
        </button>
        <div className="campaignTitle">
          <small>{state.campaign.system} · Sessão {state.campaign.session}</small>
          <strong>{state.campaign.name}</strong>
        </div>
        <div className="topActions">
          <button className={`cloudStatus ${cloud.status}`} onClick={() => setShowSync(true)}>
            <i /> Nuvem <span>{cloudLabel}</span>
          </button>
          <button className={`connection ${bridge.account?.connected ? "connected" : ""}`} onClick={connectChatGPT}>
            <i /> ChatGPT <span>{bridge.account?.connected ? "conectado" : bridge.status === "missing" ? "bridge offline" : "conectar"}</span>
          </button>
        </div>
      </header>

      <nav className="mobileNav">
        {([
          ["session", "✦", "Sessão"],
          ["character", "◇", "Ficha"],
          ["craft", "⚒", "Craft"],
          ["world", "⌘", "Mundo"],
          ["memory", "◉", "Memória"],
        ] as const).map(([id, icon, label]) => (
          <button className={view === id ? "active" : ""} onClick={() => setView(id)} key={id}><b>{icon}</b>{label}</button>
        ))}
      </nav>

      <section className="workspace">
        <aside className="rail">
          <button className={view === "session" ? "active" : ""} onClick={() => setView("session")}><b>✦</b><span>Sessão</span></button>
          <button className={view === "character" ? "active" : ""} onClick={() => setView("character")}><b>◇</b><span>Personagem</span></button>
          <button className={view === "craft" ? "active" : ""} onClick={() => setView("craft")}><b>⚒</b><span>Craft</span></button>
          <button className={view === "world" ? "active" : ""} onClick={() => setView("world")}><b>⌘</b><span>Mundo</span></button>
          <button className={view === "memory" ? "active" : ""} onClick={() => setView("memory")}><b>◉</b><span>Memória</span></button>
          <div className="railBottom"><button onClick={() => setShowSync(true)}><b>⚙</b><span>Configurar</span></button></div>
        </aside>

        <section className="content">
          {view === "session" && (
            <div className="sessionView">
              <div className="sessionHud">
                <CampaignClockBar time={state.time} onOpenCalendar={() => setShowCalendar(true)} />
                <div className="sessionDiceControl">
                  <button
                    className={`sessionDiceButton ${showDiceTray ? "active" : ""} ${state.pendingRoll ? "pending" : ""}`}
                    type="button"
                    title="Abrir dados"
                    aria-label="Abrir dados"
                    disabled={gmBusy || Boolean(activeDiceRoll)}
                    onClick={() => setShowDiceTray((value) => !value)}
                  >
                    <span>⚄</span>
                    {state.pendingRoll && <i />}
                  </button>
                  <DiceTray
                    open={showDiceTray}
                    pendingFormula={state.pendingRoll?.formula}
                    allowedDice={state.pendingRoll?.allowedDice}
                    pendingKind={state.pendingRoll?.rollKind}
                    daggerheart={state.campaign.system === "Daggerheart"}
                    onRoll={(formula, duality) => startDiceRoll(formula, "tray", duality)}
                  />
                </div>
              </div>
              <div className="sessionGrid">
                <section className="chatPanel panel">
                <div className="panelHeading">
                  <div><small>CENA ATUAL</small><h1>{state.campaign.scene}</h1></div>
                  <span className="livePill">● AO VIVO</span>
                </div>
                <div className={`sceneArt ${currentSceneVisual ? "hasSceneImage" : ""}`}>
                  {currentSceneVisual ? (
                    <>
                      <img
                        src={currentSceneVisual.imageUrl}
                        alt={currentSceneVisual.caption || `Referência visual para ${state.campaign.scene}`}
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          const fallback = currentSceneVisual.thumbnailUrl;
                          if (fallback && event.currentTarget.src !== fallback) {
                            event.currentTarget.src = fallback;
                          } else {
                            event.currentTarget.style.display = "none";
                          }
                        }}
                      />
                      <div className="sceneImageShade" aria-hidden="true" />
                      <div className="sceneImageMeta">
                        <span>REFERÊNCIA VISUAL · WEB</span>
                        <a href={currentSceneVisual.sourceUrl} target="_blank" rel="noreferrer noopener">
                          Fonte ↗
                        </a>
                      </div>
                      {currentSceneVisual.caption && <p className="sceneImageCaption">{currentSceneVisual.caption}</p>}
                    </>
                  ) : (
                    <>
                      <div className="sceneMoon" />
                      <div className="sceneDoor"><span>◈</span></div>
                      <div className="sceneFog" />
                      <p>{sceneImageBusy ? "BUSCANDO REFERÊNCIA DA CENA…" : sceneImageError ? "REFERÊNCIA VISUAL INDISPONÍVEL" : "AGUARDANDO REFERÊNCIA DA CENA"}</p>
                      {sceneImageErrorInfo && !sceneImageBusy && (
                        <div className="sceneImageErrorDetail" data-category={sceneImageErrorInfo.category} title={sceneImageErrorInfo.detail}>
                          <strong>{sceneImageErrorInfo.title}</strong>
                          <small>{sceneImageErrorInfo.detail}</small>
                        </div>
                      )}
                      {sceneImageError && !sceneImageBusy && (
                        <button
                          type="button"
                          className="sceneImageRetryButton"
                          onClick={() => {
                            sceneImageFailedRef.current = null;
                            setSceneImageError("");
                            setSceneImageRetryNonce((value) => value + 1);
                          }}
                        >
                          Tentar novamente
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="messages">
                  {state.messages.map((message) => (
                    <article className={`message ${message.role}`} key={message.id}>
                      <div className="messageAvatar">{message.role === "gm" ? "◈" : state.character.name.slice(0, 1).toUpperCase()}</div>
                      <div className="messageBody">
                        <small>{message.role === "gm" ? "ORACLE · MESTRE" : message.role === "player" ? state.character.name : "SISTEMA"}</small>
                        <MessageText text={message.text} actionSyntax={message.role === "player"} />
                        {SCENE_IMAGE_BUTTON_ENABLED && message.role === "gm" && lastGmMessage?.id === message.id && (
                          <button className="sceneImageButton" onClick={() => prepareSceneImage(message)}>
                            <span>✦</span> Gerar imagem da cena
                          </button>
                        )}
                        {message.role === "player" && latestUnansweredPlayer?.id === message.id && !state.pendingRoll && !state.gmRecovery && (
                          <button className="regenerateNarrationButton" onClick={() => void regenerateNarration(message)} disabled={gmBusy}>
                            <span>↻</span> {gmBusy ? "Gerando narração…" : "Regenerar narração do Mestre"}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                  {!hasGmNarration && openingNarrationError && !gmBusy && (
                    <button type="button" className="openingRetryButton" onClick={retryCampaignOpening}>
                      <span>↻</span>
                      Tentar iniciar a primeira cena novamente
                    </button>
                  )}
                </div>
                {state.gmRecovery && !state.pendingRoll && !gmBusy && (
                  <button type="button" className="openingRetryButton" onClick={() => void retryGmNarration()} disabled={Boolean(activeDiceRoll)}>
                    <span>↻</span> Retomar resposta do Mestre
                  </button>
                )}
                {state.pendingRoll && (
                  <div className="pendingRollBanner">
                    <b>🎲</b>
                    <div>
                      <small>AGUARDANDO SUA ROLAGEM</small>
                      <strong>{state.pendingRoll.label}</strong>
                      <p>{state.pendingRoll.reason}</p>
                      <span>
                        {state.pendingRoll.formula
                          ? state.pendingRoll.formula
                          : `Dados permitidos: ${state.pendingRoll.allowedDice?.join(", ") || "livre"}`}
                        {state.pendingRoll.target !== undefined ? ` · CD ${state.pendingRoll.target}` : ""}
                      </span>
                    </div>
                    <button type="button" disabled={gmBusy || Boolean(activeDiceRoll)} onClick={() => setShowDiceTray(true)}>Rolar agora</button>
                  </div>
                )}
                {diceTrackers.length > 0 && (
                  <div className="sessionTrackerStrip" aria-label="Trackers de dados do personagem">
                    {diceTrackers.map((tracker) => (
                      <button
                        type="button"
                        className={`sessionTrackerDie ${tracker.active || tracker.kind === "dicePool" ? "active" : ""}`}
                        key={tracker.id}
                        aria-label={`${tracker.name}. Toque para detalhes; segure por um segundo para editar.`}
                        onPointerDown={() => beginTrackerPress(tracker)}
                        onPointerUp={() => endTrackerPress(tracker)}
                        onPointerLeave={cancelTrackerPress}
                        onPointerCancel={cancelTrackerPress}
                        onContextMenu={(event) => event.preventDefault()}
                      >
                        <span>d{tracker.dieSides || tracker.max}</span>
                        <b>
                          {tracker.kind === "dicePool"
                            ? tracker.dice?.length
                              ? tracker.dice.join(" · ")
                              : `×${tracker.value}`
                            : tracker.active
                              ? tracker.value
                              : "—"}
                        </b>
                      </button>
                    ))}
                  </div>
                )}
                {state.character.death?.status === "choice" && (
                  <div className="deathMovePrompt" role="dialog" aria-modal="true" aria-label="Movimento de morte">
                    <small>MOVIMENTO DE MORTE</small>
                    <h2>Seu último Ponto de Vida foi marcado.</h2>
                    <p>Escolha como seu personagem encara o véu da morte.</p>
                    <div className="deathMoveChoices">
                      <button type="button" onClick={() => selectDeathMove("avoid")}>
                        <strong>Evitar a Morte</strong>
                        <span>Caia inconsciente e role o Dado de Esperança; uma Cicatriz pode reduzir permanentemente seus espaços de Esperança.</span>
                      </button>
                      <button type="button" onClick={() => selectDeathMove("glory")}>
                        <strong>Glória Final</strong>
                        <span>Faça uma última ação com crítico automático e então atravesse o véu.</span>
                      </button>
                      <button type="button" onClick={() => selectDeathMove("risk")}>
                        <strong>Arriscar Tudo</strong>
                        <span>Role os Dados de Dualidade: Esperança pode mantê-lo de pé; Medo significa morte.</span>
                      </button>
                    </div>
                  </div>
                )}
                {state.character.death?.status === "risk-recovery" && (
                  <div className="deathMovePrompt recovery" role="dialog" aria-modal="true" aria-label="Recuperação de Arriscar Tudo">
                    <small>ARRISCAR TUDO · ESPERANÇA</small>
                    <h2>Distribua {state.character.death.recoveryPoints || 0} ponto(s) de recuperação.</h2>
                    <p>Escolha, ponto a ponto, entre limpar PV marcado ou Fadiga.</p>
                    <div className="riskRecoveryChoices">
                      <button type="button" disabled={state.character.hp <= 0} onClick={() => spendRiskRecovery("hp")}>−1 PV marcado <b>{state.character.hp}/{state.character.maxHp}</b></button>
                      <button type="button" disabled={state.character.stress <= 0} onClick={() => spendRiskRecovery("stress")}>−1 Fadiga <b>{state.character.stress}/{state.character.maxStress}</b></button>
                    </div>
                  </div>
                )}
                <form className="composer" onSubmit={submit}>
                  <ActionComposer
                    value={input}
                    onChange={setInput}
                    placeholder={gmBusy
                      ? "O Mestre está narrando..."
                      : state.pendingLevelUp
                        ? `Conclua a subida para o nível ${state.pendingLevelUp.targetLevel} antes de agir.`
                      : state.character.death?.status === "dead"
                        ? "A jornada deste personagem terminou."
                        : state.character.conditions.includes("Inconsciente")
                          ? "Seu personagem está inconsciente."
                          : ["choice", "avoiding", "risking", "risk-recovery"].includes(state.character.death?.status || "")
                            ? "Resolva o movimento de morte antes de agir."
                            : !hasGmNarration
                              ? "Aguardando a primeira cena do Mestre..."
                        : state.pendingRoll
                          ? `Role ${state.pendingRoll.formula || "os dados pedidos"} com /r ou pelo ícone de dado`
                          : "O que você faz?"}
                    disabled={gmBusy || !hasGmNarration || playerActionsBlocked}
                  />
                  <button className="send" type="submit" disabled={gmBusy || !hasGmNarration || playerActionsBlocked}>{gmBusy ? "…" : "➤"}</button>
                </form>
                <div className="composerHint"><span>{gmError ? gmError : "O estado da campanha é salvo no OracleRPG."}</span><span>{bridge.model || "Mestre local"}</span></div>
                </section>

                <aside className="characterPanel panel">
                <div className="characterHero">
                  {state.character.daggerheart?.image
                    ? <img className="characterHeroPortrait" src={state.character.daggerheart.image} alt={`Retrato de ${state.character.name}`} />
                    : <AvatarSigil />}
                  <div><small>PERSONAGEM ATIVO</small><h2>{state.character.name}</h2><p>{state.character.archetype}</p></div>
                  <button>•••</button>
                </div>
                <div className="resourceGrid">
                  <Resource label="Pontos de Vida" value={state.character.hp} max={state.character.maxHp} kind="hp" onAdjust={adjust} />
                  <Resource label="Esperança" value={state.character.hope} max={state.character.maxHope} kind="hope" onAdjust={adjust} />
                  <Resource label={state.campaign.system === "Daggerheart" ? "Fadiga" : "Estresse"} value={state.character.stress} max={state.character.maxStress} kind="stress" onAdjust={adjust} />
                  <Resource label="Armadura" value={state.character.armor} max={state.character.maxArmor} kind="armor" onAdjust={adjust} />
                </div>
                <div className="conditions">
                  <div className="sectionTitle"><span>Condições</span><button onClick={() => setState((s) => executeCommand(s, { type: "condition", name: "Oculta", active: !s.character.conditions.includes("Oculta") }))}>＋</button></div>
                  <div className="chips">{state.character.conditions.length ? state.character.conditions.map((c) => <span key={c}>◌ {c}</span>) : <em>Nenhuma condição</em>}</div>
                </div>
                <div className="inventory">
                  <div className="sectionTitle"><span>Inventário</span><small>{state.inventory.reduce((sum, i) => sum + i.qty, 0)} itens</small></div>
                  {state.inventory.map((item) => {
                    return (
                      <div className="itemRow" key={item.id}>
                        <span className="itemRowVisual"><EquipmentArt item={item} className="itemRowArt" /></span>
                        <div><strong>{item.name}</strong><small>{item.detail}</small></div>
                        <div className="qty">
                          <button onClick={() => setState((s) => executeCommand(s, { type: "inventory", itemId: item.id, amount: -1 }))}>−</button>
                          <span>{item.qty}</span>
                          <button onClick={() => setState((s) => executeCommand(s, { type: "inventory", itemId: item.id, amount: 1 }))}>+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {state.events.length > 0 && (
                  <button className="undo" onClick={() => setState((s) => undoLatest(s))}>↶ Desfazer · {state.events[0].label}</button>
                )}
                </aside>
              </div>
            </div>
          )}

          {view === "character" && (
            <section className="widePanel panel">
              {animalCompanion || hasBeastform ? (
                <div className="characterSheetTabs" role="tablist" aria-label="Ficha ativa" onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]')];
                  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
                  if (index < 0) return;
                  event.preventDefault();
                  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                  tabs[nextIndex]?.click();
                  tabs[nextIndex]?.focus();
                }}>
                  <button
                    type="button"
                    role="tab"
                    id="character-sheet-tab"
                    aria-controls="character-sheet-panel"
                    aria-selected={showingCharacterSheet}
                    tabIndex={showingCharacterSheet ? 0 : -1}
                    className={showingCharacterSheet ? "active" : ""}
                    onClick={() => setCharacterSheetMode("character")}
                  >Personagem</button>
                  {animalCompanion && (
                  <button
                    type="button"
                    role="tab"
                    id="companion-sheet-tab"
                    aria-controls="companion-sheet-panel"
                    aria-selected={showingCompanionSheet}
                    tabIndex={showingCompanionSheet ? 0 : -1}
                    className={showingCompanionSheet ? "active" : ""}
                    onClick={() => setCharacterSheetMode("companion")}
                  >Companheiro</button>
                  )}
                  {hasBeastform && (
                    <button
                      type="button"
                      role="tab"
                      id="beastform-sheet-tab"
                      aria-controls="beastform-sheet-panel"
                      aria-selected={showingBeastformSheet}
                      tabIndex={showingBeastformSheet ? 0 : -1}
                      className={showingBeastformSheet ? "active" : ""}
                      onClick={() => setCharacterSheetMode("beastforms")}
                    >Formas de Fera</button>
                  )}
                </div>
              ) : <div className="eyebrow">PERSONAGEM</div>}
              {showingCompanionSheet && animalCompanion && (
                <div className="companionSheetView" id="companion-sheet-panel" role="tabpanel" aria-labelledby="companion-sheet-tab">
                  <div className="profileTop companionProfileTop">
                    {animalCompanion.image ? (
                      <img
                        className="characterSheetPortrait"
                        src={animalCompanion.image}
                        alt={`Retrato de ${animalCompanion.name}`}
                      />
                    ) : <AvatarSigil />}
                    <div>
                      <small className="companionSheetKicker">COMPANHEIRO ANIMAL</small>
                      <h1>{animalCompanion.name}</h1>
                      <p>{animalCompanion.kind || "Companheiro animal"}</p>
                    </div>
                  </div>

                  {animalCompanion.appearance && (
                    <article className="miniCard companionAppearanceCard">
                      <b>◇</b>
                      <div><h3>Aparência</h3><p>{animalCompanion.appearance}</p></div>
                    </article>
                  )}

                  <h3 className="subhead">Características</h3>
                  <div className="companionCoreStats">
                    <article><small>EVASÃO</small><strong>{animalCompanion.evasion}</strong></article>
                    <article><small>FADIGA</small><strong>{animalCompanion.stress} / {animalCompanion.maxStress}</strong></article>
                    <article><small>DANO</small><strong>{state.character.proficiency} × {animalCompanion.damageDie}</strong></article>
                    <article><small>ALCANCE</small><strong>{animalCompanion.range}</strong></article>
                    <article><small>TIPO</small><strong>{animalCompanion.damageType === "magic" ? "Mágico" : "Físico"}</strong></article>
                  </div>

                  <h3 className="subhead">Experiências</h3>
                  <div className="cardGrid">
                    {animalCompanion.experiences.map((experience) => (
                      <article className="miniCard" key={experience.name}>
                        <b>+{experience.bonus}</b>
                        <div><h3>{experience.name}</h3><p>Experiência do companheiro</p></div>
                      </article>
                    ))}
                    {!animalCompanion.experiences.length && (
                      <article className="miniCard companionEmptyCard">
                        <b>◇</b>
                        <div><h3>Sem experiências registradas</h3><p>As experiências iniciais são definidas durante a criação do Patrulheiro Treinador.</p></div>
                      </article>
                    )}
                  </div>

                  {Boolean(animalCompanion.training?.length) && (
                    <>
                      <h3 className="subhead">Treinamento</h3>
                      <div className="cardGrid">
                        {animalCompanion.training!.map((training, index) => (
                          <article className="miniCard" key={`${training}-${index}`}>
                            <b>✦</b>
                            <div><h3>{training}</h3><p>Avanço do companheiro</p></div>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {showingBeastformSheet && (
                <div className="beastformSheetView" id="beastform-sheet-panel" role="tabpanel" aria-labelledby="beastform-sheet-tab">
                  <div className="beastformSheetHeader">
                    <div><small>FORMA DE FERA</small><h1>Formas disponíveis</h1><p>Nível {state.character.level} · Patamar {beastformTier}</p></div>
                    <span>{availableBeastforms.length} formas</span>
                  </div>
                  <p className="beastformSheetHint">Você pode assumir formas do seu patamar ou de patamares inferiores. Abra uma forma para consultar seus animais, atributos, ataques e habilidades.</p>
                  {[1, 2, 3, 4].filter((tier) => tier <= beastformTier).map((tier) => {
                    const forms = availableBeastforms.filter((entry) => entry.beastformTier === tier);
                    if (!forms.length) return null;
                    return <section className="beastformTierGroup" key={tier} aria-label={"Formas de Fera do patamar " + tier}>
                      <h3 className="subhead">Patamar {tier} <span>{forms.length} formas</span></h3>
                      <div className="cardGrid">{forms.map((entry) => (
                        <SheetExpandableCard
                          key={entry.id}
                          icon="♧"
                          title={entry.name}
                          subtitle={entry.description.match(/^Exemplos:\s*(.+)$/m)?.[1] || "Forma de Fera"}
                          entry={entry}
                          description={entry.description}
                        />
                      ))}</div>
                    </section>;
                  })}
                  {!availableBeastforms.length && <p className="beastformSheetHint">Nenhuma forma disponível para este patamar.</p>}
                </div>
              )}
              {showingCharacterSheet && (
                <div id="character-sheet-panel" role={animalCompanion || hasBeastform ? "tabpanel" : undefined} aria-labelledby={animalCompanion || hasBeastform ? "character-sheet-tab" : undefined}>
              <div className="profileTop">
                {state.character.daggerheart?.image ? (
                  <img
                    className="characterSheetPortrait"
                    src={state.character.daggerheart.image}
                    alt={`Retrato de ${state.character.name}`}
                  />
                ) : <AvatarSigil />}
                <div><h1>{state.character.name}</h1><p>{state.character.archetype} · {state.campaign.system}</p></div>
              </div>
              <div className="characterCoreStats">
                <article><small>NÍVEL</small><strong>{state.character.level}</strong></article>
                <article><small>PATAMAR</small><strong>{state.character.tier}</strong></article>
                <article><small>EVASÃO</small><strong>{effectiveEvasion}</strong></article>
                <article><small>PROFICIÊNCIA</small><strong>{state.character.proficiency}</strong></article>
              </div>
              <div className="damageThresholdRuler">
                <div><small>LIMIARES DE DANO</small><strong>Menor</strong><span>&lt; {state.character.damageThresholds.major}</span></div>
                <i />
                <div><strong>Maior</strong><span>{state.character.damageThresholds.major}–{state.character.damageThresholds.severe - 1}</span></div>
                <i />
                <div><strong>Grave</strong><span>≥ {state.character.damageThresholds.severe}</span></div>
              </div>
              {state.character.daggerheart?.transformation && (
                <div className="transformationBanner">
                  <span>✦</span>
                  <div><small>FORMA ATIVA</small><strong>{state.character.daggerheart.transformation.name}</strong><p>{state.character.daggerheart.transformation.notes || "A ficha está exibindo os modificadores temporários desta forma."}</p></div>
                </div>
              )}
              <div className="fourCols">
                <Resource label="PV marcados" value={state.character.hp} max={state.character.maxHp} kind="hp" onAdjust={adjust} />
                <Resource label="Esperança" value={state.character.hope} max={state.character.maxHope} kind="hope" onAdjust={adjust} />
                <Resource label={state.campaign.system === "Daggerheart" ? "Fadiga" : "Estresse"} value={state.character.stress} max={state.character.maxStress} kind="stress" onAdjust={adjust} />
                <Resource label="Armadura" value={state.character.armor} max={state.character.maxArmor} kind="armor" onAdjust={adjust} />
              </div>
              {state.character.daggerheart && (
                <>
                  {characterTrackers.length > 0 && (
                    <>
                      <h3 className="subhead">Trackers</h3>
                      <div className="characterTrackerGrid">
                        {characterTrackers.map((tracker) => (
                          <article className="characterTrackerCard" key={tracker.id}>
                            <div>
                              <small>{tracker.source.type === "classFeature" ? "CLASSE" : tracker.source.type === "subclassFeature" ? "SUBCLASSE" : tracker.source.type === "domainCard" ? "DOMÍNIO" : "TRACKER"}</small>
                              <strong>{tracker.name}</strong>
                            </div>
                            <b>{tracker.kind === "die" ? `d${tracker.dieSides} · ${tracker.active ? tracker.value : "—"}` : tracker.kind === "dicePool" ? `${tracker.value} × d${tracker.dieSides}` : `${tracker.value} / ${tracker.max}`}</b>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                  <h3 className="subhead">Daggerheart</h3>
                  <div className="cardGrid">
                    <SheetExpandableCard
                      icon="◇"
                      title={state.character.daggerheart.class.name}
                      subtitle="Classe"
                      entry={findCompendiumEntry(state.character.daggerheart.class.id, state.character.daggerheart.class.name)}
                    />
                    <SheetExpandableCard
                      icon="△"
                      title={state.character.daggerheart.subclass.name}
                      subtitle="Subclasse"
                      entry={findCompendiumEntry(state.character.daggerheart.subclass.id, state.character.daggerheart.subclass.name)}
                    />
                    <SheetExpandableCard
                      icon="◐"
                      title={state.character.daggerheart.ancestry.secondary
                        ? `${state.character.daggerheart.ancestry.primary.name} + ${state.character.daggerheart.ancestry.secondary.name}`
                        : state.character.daggerheart.ancestry.primary.name}
                      subtitle={state.character.daggerheart.ancestry.mixed ? "Ancestralidade mista" : "Ancestralidade"}
                      description={[
                        findCompendiumEntry(state.character.daggerheart.ancestry.primary.id, state.character.daggerheart.ancestry.primary.name)?.description,
                        state.character.daggerheart.ancestry.secondary
                          ? findCompendiumEntry(state.character.daggerheart.ancestry.secondary.id, state.character.daggerheart.ancestry.secondary.name)?.description
                          : "",
                      ].filter(Boolean).join("\n\n")}
                    />
                    <SheetExpandableCard
                      icon="⌂"
                      title={state.character.daggerheart.community.name}
                      subtitle="Comunidade"
                      entry={findCompendiumEntry(state.character.daggerheart.community.id, state.character.daggerheart.community.name)}
                    />
                  </div>

                  <h3 className="subhead">Traços</h3>
                  <div className="cardGrid">
                    {TRAIT_ORDER.map((trait) => {
                      const value = effectiveTraits?.[trait] ?? state.character.daggerheart!.traits[trait];
                      const transformed = effectiveTraits?.[trait] !== undefined && effectiveTraits[trait] !== state.character.daggerheart!.traits[trait];
                      return (
                        <article className={`miniCard ${transformed ? "transformedStat" : ""}`} key={trait}>
                          <b>{value >= 0 ? "+" : ""}{value}</b>
                          <div><h3>{TRAIT_LABELS[trait]}</h3><p>{transformed ? "Modificado pela forma ativa" : "Traço de personagem"}</p></div>
                        </article>
                      );
                    })}
                  </div>

                  <h3 className="subhead">Características</h3>
                  <div className="cardGrid">
                    {state.character.daggerheart.classFeatures.map((feature) => (
                      <SheetExpandableCard
                        icon="✦"
                        title={feature.name}
                        subtitle="Característica de classe"
                        entry={findCompendiumEntry(feature.id, feature.name)}
                        key={feature.id}
                      />
                    ))}
                    {state.character.daggerheart.subclassFeatures.map((feature) => (
                      <SheetExpandableCard
                        icon="△"
                        title={feature.name}
                        subtitle="Característica de subclasse"
                        entry={findCompendiumEntry(feature.id, feature.name)}
                        key={feature.id}
                      />
                    ))}
                    {state.character.daggerheart.ancestry.features.map((feature) => (
                      <SheetExpandableCard
                        icon="◐"
                        title={feature.name}
                        subtitle="Característica de ancestralidade"
                        entry={findCompendiumEntry(feature.id, feature.name)}
                        key={feature.id}
                      />
                    ))}
                    {state.character.daggerheart.community.features.map((feature) => (
                      <SheetExpandableCard
                        icon="⌂"
                        title={feature.name}
                        subtitle="Característica de comunidade"
                        entry={findCompendiumEntry(feature.id, feature.name)}
                        key={feature.id}
                      />
                    ))}
                  </div>

                  <h3 className="subhead">Experiências</h3>
                  <div className="cardGrid">
                    {state.character.daggerheart.experiences.map((experience) => (
                      <article className="miniCard" key={experience.name}>
                        <b>+{experience.bonus}</b>
                        <div><h3>{experience.name}</h3><p>Experiência inicial</p></div>
                      </article>
                    ))}
                  </div>

                  {state.character.daggerheart.history && (
                    <>
                      <h3 className="subhead">História</h3>
                      <article className="miniCard characterHistoryCard">
                        <b>◉</b>
                        <div><h3>História do personagem</h3><p>{state.character.daggerheart.history}</p></div>
                      </article>
                    </>
                  )}

                  <h3 className="subhead">Cartas de domínio</h3>
                  <div className="cardGrid">
                    {state.character.daggerheart.domainCards.map((card) => (
                      <SheetExpandableCard
                        icon="✦"
                        title={card.name}
                        subtitle={`${card.domain} · Nível ${card.level}`}
                        entry={findCompendiumEntry(card.id, card.name)}
                        key={card.id}
                      />
                    ))}
                  </div>

                  {state.character.daggerheart.connections.length > 0 && (
                    <>
                      <h3 className="subhead">Conexões</h3>
                      <div className="cardGrid">
                        {state.character.daggerheart.connections.map((connection) => {
                          const npc = state.npcs.find((entry) => entry.id === connection.npcId);
                          return (
                            <article className="miniCard" key={connection.npcId}>
                              <b>◇</b>
                              <div><h3>{npc?.name || "Companheiro"}</h3><p>{connection.text}</p></div>
                            </article>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
              <h3 className="subhead">Inventário</h3>
              <div className="cardGrid">
                {state.inventory.map((item) => {
                  const entry = findCompendiumEntry(item.sourceId || item.id, item.name);
                  const description = entry?.description && entry.description !== item.detail
                    ? [item.detail, entry.description].filter(Boolean).join("\n\n")
                    : item.detail;
                  return (
                    <SheetExpandableCard
                      icon={item.icon}
                      title={item.name}
                      subtitle={entry ? entry.type === "weapon" ? "Arma" : entry.type === "armor" ? "Armadura" : entry.type === "consumable" ? "Consumível" : entry.type === "loot" ? "Item de saque" : "Item" : "Item"}
                      entry={entry}
                      equipment={item}
                      description={description}
                      badge={`×${item.qty}`}
                      key={item.id}
                    />
                  );
                })}
              </div>
                </div>
              )}
            </section>
          )}

          {view === "craft" && (
            <CraftingWorkshop
              crafting={state.crafting}
              inventory={state.inventory}
              busy={gmBusy}
              disabled={Boolean(activeDiceRoll || state.pendingRoll)}
              statusText={state.crafting.pendingAttempt?.stage === "awaiting-roll"
                ? "Aguardando a rolagem de crafting."
                : state.crafting.pendingAttempt
                  ? "O Mestre está avaliando a combinação."
                  : undefined}
              onCraft={startCraftAttempt}
              onCancelAttempt={() => {
                const current = stateRef.current;
                const attempt = current.crafting.pendingAttempt;
                if (!attempt || attempt.stage !== "review" || gmBusy || current.pendingRoll) return;
                const next = { ...current, crafting: rejectCraftAttempt(current.crafting, attempt.id) };
                stateRef.current = next;
                setState(next);
              }}
            />
          )}

          {view === "world" && (
            <section className="widePanel panel">
              <div className="eyebrow">MUNDO VIVO</div>
              <h1>NPCs e Missões</h1>
              <div className="worldCols">
                <div><h3 className="subhead">NPCs conhecidos</h3>{state.npcs.map(npc => <article className="npcCard" key={npc.id}><div className={`relation ${npc.relation}`} /><div><h3>{npc.name}</h3><p>{npc.role}</p><small>{npc.location}</small></div><span>{npc.relation}</span></article>)}</div>
                <div>
                  <h3 className="subhead">Missões</h3>
                  {state.quests.map((quest) => {
                    const deadline = quest.deadlineCampaignMinute === undefined ? null : remainingDuration(state.time, quest.deadlineCampaignMinute);
                    return (
                      <article className="questCard" key={quest.id}>
                        <div>
                          <small>{quest.status === "active" ? "EM ANDAMENTO" : "CONCLUÍDA"}</small>
                          <h3>{quest.title}</h3>
                          <p>{quest.stage}</p>
                          {(quest.acceptedAtCampaignMinute !== undefined || quest.deadlineCampaignMinute !== undefined) && (
                            <div className="questTiming">
                              {quest.acceptedAtCampaignMinute !== undefined && (
                                <span>Início · {formatCampaignDateTime(state.time, quest.acceptedAtCampaignMinute, { includeWeekday: false, includeTime: false })}</span>
                              )}
                              {quest.deadlineCampaignMinute !== undefined && (
                                <span className={deadline?.expired && quest.status === "active" ? "expired" : ""}>
                                  Prazo · {formatCampaignDateTime(state.time, quest.deadlineCampaignMinute, { includeWeekday: false, includeTime: true })}
                                  {quest.status === "active" && deadline ? ` · ${deadline.expired ? "encerrado" : `faltam ${formatCampaignDuration(deadline.signedMinutes)}`}` : ""}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <button onClick={() => toggleQuestStatus(quest.id)}>{quest.status === "active" ? "Concluir" : "Reabrir"}</button>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {view === "memory" && (
            memoryMode === "timeline" ? (
              <CampaignTimeline
                entries={(state.timelineVersion ?? 0) < TIMELINE_SCHEMA_VERSION
                  ? timelineWithoutLegacyGeneratedEntries(state)
                  : state.timeline ?? []}
                time={state.time}
                onShowDetails={() => setMemoryMode("details")}
                onSaveEntry={(input, entryId) => {
                  try {
                    const current = stateRef.current;
                    const saved = upsertManualTimelineEntry(current.time, current.timeline ?? [], input, undefined, entryId);
                    const next = { ...current, timeline: saved.timeline };
                    stateRef.current = next;
                    setState(next);
                    return null;
                  } catch (error) {
                    return error instanceof Error ? error.message : "Não foi possível salvar este acontecimento.";
                  }
                }}
              />
            ) : (
              <section className="widePanel panel memoryDetailsPanel">
                <div className="memoryDetailsTop">
                  <div>
                    <div className="eyebrow">MEMÓRIA PERSISTENTE</div>
                    <h1>O Oracle lembra do mundo.</h1>
                    <p>Fatos, eventos, segredos e referências visuais que pertencem à campanha.</p>
                  </div>
                  <button type="button" className="timelineBackButton" onClick={() => setMemoryMode("timeline")}>Linha do tempo</button>
                </div>
                <div className="memoryHeader"><div><p>Esses dados pertencem à campanha, não à janela de contexto do modelo.</p></div><span>{state.memories.length} registros</span></div>
                <div className="memoryList">{state.memories.map((memory) => {
                  const worldDate = memory.campaignMinute === undefined ? null : formatCampaignDateTime(state.time, memory.campaignMinute, { includeWeekday: false, includeTime: true });
                  const elapsed = memory.campaignMinute === undefined ? null : state.time.campaignMinute - memory.campaignMinute;
                  return <article key={memory.id}><b>{memory.kind === "secret" ? "◇" : memory.kind === "event" ? "✦" : memory.kind === "visual" ? "◐" : "◉"}</b><div><small>{memory.kind.toUpperCase()}{worldDate ? ` · ${worldDate}` : ""}{elapsed !== null && elapsed > 0 ? ` · há ${formatCampaignDuration(elapsed)}` : ""}</small><p>{memory.text}</p></div></article>;
                })}</div>
                <details className="contextPreview"><summary>Prévia do pacote de contexto enviado ao Mestre</summary><pre>{JSON.stringify(contextPreview, null, 2)}</pre></details>
              </section>
            )
          )}
        </section>
      </section>

      {trackerInfo && (
        <div className="trackerOverlay" role="presentation" onClick={() => setTrackerInfo(null)}>
          <section className="trackerInfoCard" role="dialog" aria-modal="true" aria-label={trackerInfo.name}>
            <div className="trackerInfoDie">d{trackerInfo.dieSides || trackerInfo.max}</div>
            <small>{trackerInfo.source.type === "classFeature" ? "CARACTERÍSTICA DE CLASSE" : trackerInfo.source.type === "subclassFeature" ? "CARACTERÍSTICA DE SUBCLASSE" : trackerInfo.source.type === "domainCard" ? "CARTA DE DOMÍNIO" : "TRACKER"}</small>
            <h2>{trackerInfo.name}</h2>
            <p>{trackerInfo.description || "Este dado acompanha um recurso persistente da sua característica. O Mestre atualiza o valor conforme as regras e a ficção."}</p>
            <strong>{trackerInfo.kind === "dicePool" ? `${trackerInfo.value} dado(s) disponível(is)` : trackerInfo.active ? `Valor atual: ${trackerInfo.value}` : "Inativo"}</strong>
            <span>Toque em qualquer lugar para fechar.</span>
          </section>
        </div>
      )}

      {trackerEditor && (
        <div className="trackerOverlay" role="presentation" onClick={() => setTrackerEditor(null)}>
          <section className="trackerEditorCard" role="dialog" aria-modal="true" aria-label={`Editar ${trackerEditor.name}`} onClick={(event) => event.stopPropagation()}>
            <small>AJUSTE MANUAL · PRESSÃO LONGA</small>
            <h2>{trackerEditor.name}</h2>
            <p>Use apenas quando o Mestre não tiver atualizado este tracker automaticamente.</p>
            <div className="trackerEditorControls">
              <button type="button" onClick={() => updateTrackerAsPlayer(trackerEditor.id, -1)}>−</button>
              <strong>{trackerEditor.kind === "dicePool" ? trackerEditor.value : trackerEditor.active ? trackerEditor.value : 0}</strong>
              <button type="button" onClick={() => updateTrackerAsPlayer(trackerEditor.id, 1)}>+</button>
            </div>
            <button type="button" className="trackerEditorDone" onClick={() => setTrackerEditor(null)}>Concluir</button>
          </section>
        </div>
      )}

      {state.pendingLevelUp && state.character.death?.status !== "dead" && (
        <DaggerheartLevelUpWizard
          baseCharacter={state.character}
          inventory={state.inventory}
          targetLevel={state.pendingLevelUp.targetLevel}
          mode="modal"
          onComplete={(plan) => completeMilestoneLevelUp(plan)}
        />
      )}

      {state.character.death?.status === "dead" && (
        <div className="characterDeathOverlay" role="dialog" aria-modal="true" aria-label="Personagem morto">
          <section className="characterDeathCard">
            <small>A JORNADA DE {state.character.name.toLocaleUpperCase("pt-BR")} TERMINOU</small>
            <h2>O véu da morte foi atravessado.</h2>
            <p>Esta janela não pode ser fechada. Escolha como a campanha continua.</p>
            <div className="characterDeathActions">
              <button type="button" onClick={() => activeCampaignId && void restartCampaign(activeCampaignId)} disabled={!activeCampaignId}>
                <strong>Recomeçar a campanha</strong>
                <span>Restaura a campanha ao ponto inicial e gera uma nova abertura.</span>
              </button>
              <button type="button" onClick={() => {
                if (!activeCampaignId) return;
                setReplacementCampaignId(activeCampaignId);
                setScreen("newCampaign");
              }} disabled={!activeCampaignId}>
                <strong>Continuar com outro personagem</strong>
                <span>Crie um novo personagem de nível {state.character.level} e preserve o mundo, as missões e as consequências.</span>
              </button>
            </div>
          </section>
        </div>
      )}

      <DiceOverlay
        result={activeDiceRoll}
        appearances={diceAppearances}
        onComplete={(result) => { void finishDiceRoll(result); }}
        onError={(error, result) => { void finishDiceRoll(result, error); }}
      />
      {diceNote && (
        <button className="diceToast" type="button" onClick={() => setDiceNote("")}>{diceNote}</button>
      )}

      {showCalendar && view === "session" && (
        <CampaignCalendarModal time={state.time} onClose={() => setShowCalendar(false)} />
      )}

      {showSync && (
        <div className="modalBackdrop" onClick={() => setShowSync(false)}>
          <section className="connectModal syncModal" onClick={(e) => e.stopPropagation()}>
            <img src="/oracle-mark.svg" alt="" />
            <small>SINCRONIZAÇÃO</small>
            <h2>Campanha em todos os seus dispositivos</h2>
            {!cloud.credentials ? (
              <>
                <p>O Oracle pode guardar a campanha na nuvem sem enviar credenciais do ChatGPT. Você pode criar uma campanha sincronizada ou abrir uma existente usando o código de pareamento.</p>
                <button className="primary enabled" onClick={createCloudCampaign}>Ativar sincronização desta campanha</button>
                <div className="divider"><span>ou</span></div>
                <label className="pairField">
                  <span>Código de outro dispositivo</span>
                  <input value={pairInput} onChange={(event) => setPairInput(event.target.value)} placeholder="campaign-id.chave" />
                </label>
                <button className="ghost" onClick={joinCloudCampaign} disabled={!pairInput.trim()}>Abrir campanha sincronizada</button>
              </>
            ) : (
              <>
                <div className="syncState">
                  <i className={cloud.status} />
                  <div><small>ESTADO DA NUVEM</small><strong>{cloudLabel}</strong></div>
                </div>
                <p>Use este código apenas nos seus dispositivos. Ele funciona como uma chave da campanha e não contém sua conta ChatGPT.</p>
                <button className="pairCode" onClick={copyPairCode} title="Copiar código">{cloud.pairCode}</button>
                {cloud.conflict && (
                  <div className="conflictBox">
                    {(() => {
                      const localSummary = syncStateSummary(state);
                      const remoteSummary = syncStateSummary(cloud.conflict.state);
                      const localLast = Date.parse(state.messages.at(-1)?.createdAt || "");
                      const remoteLast = Date.parse(cloud.conflict.state.messages.at(-1)?.createdAt || "");
                      const localLooksNewer =
                        localSummary.messages > remoteSummary.messages
                        || (
                          localSummary.messages === remoteSummary.messages
                          && Number.isFinite(localLast)
                          && (!Number.isFinite(remoteLast) || localLast > remoteLast)
                        );
                      return (
                        <>
                          <strong>{cloud.conflict.reason === "remote_older" ? "A nuvem parece estar desatualizada." : "Existem alterações diferentes no aparelho e na nuvem."}</strong>
                          <p>Nenhuma versão será descartada automaticamente. Compare antes de escolher.</p>
                          <div className="conflictCompare">
                            <article className={localLooksNewer ? "recommended" : ""}>
                              <small>ESTE DISPOSITIVO {localLooksNewer ? "· MAIS RECENTE" : ""}</small>
                              <b>{localSummary.messages} mensagens</b>
                              <span>Última atividade: {localSummary.latestLabel}</span>
                            </article>
                            <article>
                              <small>NUVEM</small>
                              <b>{remoteSummary.messages} mensagens</b>
                              <span>Última atividade: {remoteSummary.latestLabel}</span>
                            </article>
                          </div>
                          <div className="conflictActions">
                            <button className={localLooksNewer ? "recommended" : ""} onClick={() => cloud.resolveConflict("local")}>Manter este dispositivo</button>
                            <button onClick={() => cloud.resolveConflict("remote")}>Usar versão da nuvem</button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
                {cloud.recovery && cloud.recovery.campaignId === cloud.credentials.campaignId && (
                  <div className="recoveryBox">
                    <div>
                      <small>BACKUP LOCAL DISPONÍVEL</small>
                      <strong>Cópia salva antes de usar a versão da nuvem</strong>
                      <span>{new Date(cloud.recovery.savedAt).toLocaleString("pt-BR")}</span>
                    </div>
                    <button onClick={cloud.restoreRecovery}>Restaurar backup local</button>
                  </div>
                )}
                <button className="ghost" onClick={() => cloud.fetchRemote()}>Atualizar agora</button>
                <button className="dangerGhost" onClick={cloud.disconnectCloud}>Desconectar este dispositivo</button>
              </>
            )}
            {syncNote && <p className="modalNote">{syncNote}</p>}
            <button className="closeText" onClick={() => setShowSync(false)}>Fechar</button>
          </section>
        </div>
      )}

      {showConnect && (
        <div className="modalBackdrop" onClick={() => setShowConnect(false)}>
          <section className="connectModal" onClick={(e) => e.stopPropagation()}>
            <img src="/oracle-mark.svg" alt="" />
            <small>MESTRE IA</small>
            <h2>{bridge.account?.connected ? "ChatGPT conectado" : bridge.status === "missing" ? "Oracle Bridge necessário" : "Conectar com ChatGPT"}</h2>
            {bridge.status === "missing" ? (
              <>
                <p>O plano ChatGPT precisa ser usado pelo runtime local. Inicie o Oracle Bridge neste computador; as credenciais nunca são enviadas ao Vercel ou ao Neon.</p>
                <div className="bridgeCommand"><code>npm install</code><code>npm run bridge</code></div>
                <button className="ghost" onClick={() => bridge.refresh()}>Verificar novamente</button>
              </>
            ) : bridge.account?.connected ? (
              <>
                <p>Conectado localmente como <b>{bridge.account.name || bridge.account.email || "conta ChatGPT"}</b>. O uso da IA conta no limite do próprio plano dessa conta.</p>
                {bridge.models.length > 0 && (
                  <label className="modelPicker">
                    <span>Modelo do Mestre</span>
                    <select value={bridge.model} onChange={(event) => bridge.setModel(event.target.value)}>
                      {bridge.models.map((model) => <option key={model.slug} value={model.slug}>{model.displayName}</option>)}
                    </select>
                  </label>
                )}
                <button className="ghost" onClick={logoutChatGPT}>Desconectar ChatGPT deste dispositivo</button>
              </>
            ) : (
              <>
                <p>O Oracle Bridge está ativo. O login abre no navegador do sistema usando o fluxo open-source oficial; não é necessário API key, empresa ou client secret.</p>
                <button className="primary enabled" onClick={() => bridge.connect()}>Continuar com ChatGPT</button>
              </>
            )}
            <div className="connectFlow"><span>OracleRPG</span><i>→</i><span>Bridge local</span><i>→</i><span>ChatGPT</span></div>
            {bridge.error && <p className="modalNote">{bridge.error}</p>}
            <button className="ghost" onClick={() => setShowConnect(false)}>Continuar em modo manual</button>
          </section>
        </div>
      )}

      {imageMessage && imageMessage.imageDraft && (
        <div className="modalBackdrop" onClick={() => setImageMessageId(null)}>
          <section className="connectModal imageModal" onClick={(event) => event.stopPropagation()}>
            <div className="imageModalIcon">✦</div>
            <small>IMAGEM DA CENA</small>
            <h2>Contexto visual preparado</h2>
            <p>
              O Oracle reuniu a cena, os personagens presentes e as memórias visuais conhecidas.
              A geração de imagem ainda não pode usar o limite do seu plano ChatGPT porque o fluxo
              atual de plan sharing não oferece a tool de image generation.
            </p>
            {imageMessage.sceneSnapshot && (
              <div className="sceneContextCard">
                <strong>{imageMessage.sceneSnapshot.scene}</strong>
                <div className="scenePeople">
                  {imageMessage.sceneSnapshot.participants.map((participant) => (
                    <span key={participant.id}>{participant.name}</span>
                  ))}
                </div>
              </div>
            )}
            <details className="imagePromptPreview">
              <summary>Ver prompt gerado</summary>
              <pre>{imageMessage.imageDraft.prompt}</pre>
            </details>
            <button className="primary enabled" onClick={copySceneImagePrompt}>Copiar prompt da imagem</button>
            {imageNote && <p className="modalNote">{imageNote}</p>}
            <button className="ghost" onClick={() => setImageMessageId(null)}>Fechar</button>
          </section>
        </div>
      )}
    </main>
  );
}

