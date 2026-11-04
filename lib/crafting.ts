export const CRAFTING_STATE_VERSION = 1;

export type CraftDiscipline = "mundane" | "enchantment" | "alchemy";
export type CraftRarity = "common" | "uncommon" | "rare" | "very-rare" | "legendary";
export type CraftRecipeLayout = "shaped" | "shapeless";
export type CraftLearnedFrom = "discovery" | "teacher" | "book" | "scroll" | "other";

export type CraftProgress = { xp: number };

export type CraftInventoryItem = {
  id: string;
  name: string;
  qty: number;
  detail: string;
  icon: string;
  sourceId?: string;
  rarity?: CraftRarity;
  art?: string;
  crafted?: boolean;
  [key: string]: unknown;
};

export type CraftIngredient = {
  slot: number;
  sourceId?: string;
  itemId?: string;
  itemName: string;
  quantity: number;
};

export type CraftResultTemplate = {
  id?: string;
  sourceId?: string;
  name: string;
  detail: string;
  icon: string;
  art?: string;
  rarity: CraftRarity;
  quantity: number;
  patch?: Record<string, unknown>;
};

export type CraftRecipe = {
  id: string;
  name: string;
  discipline: CraftDiscipline;
  layout: CraftRecipeLayout;
  ingredients: CraftIngredient[];
  result: CraftResultTemplate;
  baseSlot?: number;
  learnedFrom: CraftLearnedFrom;
  learnedAt: string;
};

export type CraftAttempt = {
  id: string;
  discipline: CraftDiscipline;
  ingredients: CraftIngredient[];
  intent?: string;
  recipeId?: string;
  stage: "review" | "awaiting-roll";
  requestedAt: string;
  rarity?: CraftRarity;
  dc?: number;
  successChance?: number;
  pendingRollId?: string;
};

export function normalizeCraftIntent(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

export type CraftingState = {
  version: 1;
  progress: Record<CraftDiscipline, CraftProgress>;
  recipes: CraftRecipe[];
  pendingAttempt?: CraftAttempt;
};

export type CraftRollPlan = {
  level: number;
  rarity: Exclude<CraftRarity, "legendary">;
  dc: number;
  successChance: number;
  formula: string;
  system: "daggerheart" | "d20";
};

const DISCIPLINES: CraftDiscipline[] = ["mundane", "enchantment", "alchemy"];
const BASE_RARITIES: Array<Exclude<CraftRarity, "legendary">> = ["common", "uncommon", "rare", "very-rare"];
const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3250] as const;
const RARITY_ORDER: CraftRarity[] = ["common", "uncommon", "rare", "very-rare", "legendary"];
const XP_BY_RARITY: Record<CraftRarity, number> = {
  common: 20,
  uncommon: 30,
  rare: 45,
  "very-rare": 65,
  legendary: 90,
};
const DH_DC: Record<Exclude<CraftRarity, "legendary">, number> = {
  common: 14,
  uncommon: 17,
  rare: 20,
  "very-rare": 23,
};
const D20_DC: Record<Exclude<CraftRarity, "legendary">, number> = {
  common: 11,
  uncommon: 14,
  rare: 17,
  "very-rare": 20,
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function itemMatchesIngredient(item: CraftInventoryItem, ingredient: CraftIngredient) {
  if (ingredient.sourceId && item.sourceId) return ingredient.sourceId === item.sourceId;
  if (ingredient.itemId && item.id && ingredient.itemId === item.id) return true;
  return normalizeName(ingredient.itemName) === normalizeName(item.name);
}

function ingredientIdentityEquivalent(a: CraftIngredient, b: CraftIngredient) {
  if (a.sourceId && b.sourceId) return a.sourceId === b.sourceId;
  if (a.itemId && b.itemId && a.itemId === b.itemId) return true;
  return normalizeName(a.itemName) === normalizeName(b.itemName);
}

function ingredientsEquivalent(a: CraftIngredient, b: CraftIngredient) {
  return ingredientIdentityEquivalent(a, b) && a.quantity === b.quantity;
}

function validateAttemptInventory(inventory: CraftInventoryItem[], ingredients: CraftIngredient[]) {
  if (!ingredients.length) throw new Error("A tentativa de craft precisa de pelo menos um item do inventário.");
  const remaining = inventory.map((item) => ({ item, remaining: Math.max(0, Math.trunc(Number(item.qty) || 0)) }));
  for (const ingredient of ingredients) {
    let needed = Math.max(1, Math.trunc(Number(ingredient.quantity) || 1));
    const candidates = remaining
      .filter((entry) => entry.remaining > 0 && itemMatchesIngredient(entry.item, ingredient))
      .sort((a, b) => Number(b.item.id === ingredient.itemId) - Number(a.item.id === ingredient.itemId));
    for (const candidate of candidates) {
      if (needed <= 0) break;
      const used = Math.min(needed, candidate.remaining);
      candidate.remaining -= used;
      needed -= used;
    }
    if (needed > 0) throw new Error(`Quantidade indisponível no inventário para ${ingredient.itemName}.`);
  }
}

function recipeById(crafting: CraftingState, recipeId: string) {
  return crafting.recipes.find((recipe) => recipe.id === recipeId);
}

function rarityIndex(rarity: CraftRarity) {
  return RARITY_ORDER.indexOf(rarity);
}

function isBaseRarity(rarity: CraftRarity): rarity is Exclude<CraftRarity, "legendary"> {
  return BASE_RARITIES.includes(rarity as Exclude<CraftRarity, "legendary">);
}

function formatRarity(rarity: CraftRarity) {
  return ({
    common: "Comum",
    uncommon: "Incomum",
    rare: "Raro",
    "very-rare": "Muito raro",
    legendary: "Lendário",
  } as Record<CraftRarity, string>)[rarity];
}

function daggerheartChance(level: number, dc: number) {
  let success = 0;
  for (let a = 1; a <= 12; a += 1) {
    for (let b = 1; b <= 12; b += 1) {
      if (a === b || a + b + level >= dc) success += 1;
    }
  }
  return Math.round((success / 144) * 1000) / 10;
}

function d20Chance(level: number, dc: number) {
  let success = 0;
  for (let die = 1; die <= 20; die += 1) {
    if (die === 20 || die + level >= dc) success += 1;
  }
  return Math.round((success / 20) * 1000) / 10;
}

function generatedId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeResultPatch(patch: Record<string, unknown> | undefined, allowDisplayFields: boolean) {
  if (!patch) return {};
  const protectedKeys = new Set(["id", "sourceId", "qty", "rarity", "crafted"]);
  const displayKeys = new Set(["name", "detail", "icon", "art"]);
  return Object.fromEntries(Object.entries(patch).filter(([key]) =>
    !protectedKeys.has(key) && (allowDisplayFields || !displayKeys.has(key))
  ));
}

export function createInitialCraftingState(): CraftingState {
  return {
    version: CRAFTING_STATE_VERSION,
    progress: {
      mundane: { xp: 0 },
      enchantment: { xp: 0 },
      alchemy: { xp: 0 },
    },
    recipes: [],
  };
}

export function ensureCraftingState(value: unknown): CraftingState {
  if (value && typeof value === "object") {
    const source = value as Partial<CraftingState> & { progress?: Partial<Record<CraftDiscipline, CraftProgress>> };
    const validProgress = DISCIPLINES.every((discipline) => Number.isFinite(Number(source.progress?.[discipline]?.xp)));
    if (source.version === CRAFTING_STATE_VERSION && validProgress && Array.isArray(source.recipes)) {
      return source as CraftingState;
    }
    return {
      version: CRAFTING_STATE_VERSION,
      progress: {
        mundane: { xp: Math.max(0, Number(source.progress?.mundane?.xp) || 0) },
        enchantment: { xp: Math.max(0, Number(source.progress?.enchantment?.xp) || 0) },
        alchemy: { xp: Math.max(0, Number(source.progress?.alchemy?.xp) || 0) },
      },
      recipes: Array.isArray(source.recipes) ? clone(source.recipes) : [],
      ...(source.pendingAttempt ? { pendingAttempt: clone(source.pendingAttempt) } : {}),
    };
  }
  return createInitialCraftingState();
}

export function craftLevelForXp(xp: number) {
  const safe = Math.max(0, Number(xp) || 0);
  let level = 0;
  for (let index = 1; index < XP_LEVELS.length; index += 1) {
    if (safe >= XP_LEVELS[index]) level = index;
  }
  return Math.min(10, level);
}

export function craftXpForLevel(level: number) {
  return XP_LEVELS[Math.max(0, Math.min(10, Math.trunc(level)))] ?? XP_LEVELS[10];
}

export function rarityCapForLevel(level: number): Exclude<CraftRarity, "legendary"> {
  if (level >= 8) return "very-rare";
  if (level >= 5) return "rare";
  if (level >= 2) return "uncommon";
  return "common";
}

export function canCraftRarity(level: number, rarity: CraftRarity) {
  if (rarity === "legendary") return false;
  return rarityIndex(rarity) <= rarityIndex(rarityCapForLevel(level));
}

export function upgradeCraftRarity(rarity: CraftRarity): CraftRarity {
  const index = rarityIndex(rarity);
  return RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, Math.max(0, index + 1))];
}

export function craftSuccessChanceFor(
  level: number,
  rarity: CraftRarity,
  system: "daggerheart" | "d20" = "daggerheart",
) {
  if (!isBaseRarity(rarity)) throw new Error("Lendário não possui uma dificuldade-base de craft.");
  const safeLevel = Math.max(0, Math.min(10, Math.trunc(level)));
  const dc = (system === "daggerheart" ? DH_DC : D20_DC)[rarity];
  return {
    dc,
    successChance: system === "daggerheart" ? daggerheartChance(safeLevel, dc) : d20Chance(safeLevel, dc),
    formula: system === "daggerheart"
      ? `2d12${safeLevel ? `+${safeLevel}` : ""}`
      : `1d20${safeLevel ? `+${safeLevel}` : ""}`,
  };
}

export function beginCraftAttempt(
  value: CraftingState,
  inventory: CraftInventoryItem[],
  input: Omit<CraftAttempt, "stage"> & { stage?: CraftAttempt["stage"] },
) {
  const crafting = clone(ensureCraftingState(value));
  validateAttemptInventory(inventory, input.ingredients);
  if (crafting.pendingAttempt) {
    throw new Error("Já existe uma tentativa de craft em andamento. Resolva ou cancele a tentativa atual antes de iniciar outra.");
  }
  const attempt: CraftAttempt = {
    ...clone(input),
    ingredients: clone(input.ingredients),
    ...(normalizeCraftIntent(input.intent) ? { intent: normalizeCraftIntent(input.intent) } : {}),
    stage: input.stage ?? "review",
  };
  crafting.pendingAttempt = attempt;
  return { crafting, attempt };
}

export function findMatchingRecipe(
  recipes: CraftRecipe[],
  discipline: CraftDiscipline,
  ingredients: CraftIngredient[],
) {
  return recipes.find((recipe) => {
    if (recipe.discipline !== discipline) return false;
    if (recipe.layout === "shaped") {
      if (recipe.ingredients.length !== ingredients.length) return false;
      return recipe.ingredients.every((expected) => {
        const actual = ingredients.find((entry) => entry.slot === expected.slot);
        return Boolean(actual && ingredientsEquivalent(expected, actual));
      });
    }
    const remaining = ingredients.map((ingredient) => ({ ...ingredient, quantity: Math.max(0, ingredient.quantity) }));
    for (const expected of recipe.ingredients) {
      let needed = Math.max(0, expected.quantity);
      for (const actual of remaining) {
        if (needed <= 0) break;
        if (actual.quantity <= 0 || !ingredientIdentityEquivalent(expected, actual)) continue;
        const used = Math.min(needed, actual.quantity);
        needed -= used;
        actual.quantity -= used;
      }
      if (needed > 0) return false;
    }
    return remaining.every((ingredient) => ingredient.quantity === 0);
  });
}

export function awardCraftXp(value: CraftingState, discipline: CraftDiscipline, amount: number) {
  if (!DISCIPLINES.includes(discipline)) throw new Error("Disciplina de craft inválida.");
  const safeAmount = Math.trunc(Number(amount));
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) throw new Error("XP de craft deve ser positivo.");
  if (safeAmount > 200) throw new Error("Uma concessão de XP de craft não pode exceder 200.");
  const crafting = clone(ensureCraftingState(value));
  crafting.progress[discipline].xp += safeAmount;
  return crafting;
}

export function learnCraftRecipe(value: CraftingState, recipe: CraftRecipe) {
  if (recipe.result.rarity === "legendary") {
    throw new Error("Receitas-base Lendárias não são permitidas; Lendário é resultado exclusivo de crítico.");
  }
  if (!BASE_RARITIES.includes(recipe.result.rarity as Exclude<CraftRarity, "legendary">)) {
    throw new Error("Raridade de receita inválida.");
  }
  if (!DISCIPLINES.includes(recipe.discipline)) throw new Error("Disciplina de craft inválida.");
  const usedSlots = new Set<number>();
  for (const ingredient of recipe.ingredients) {
    if (!Number.isInteger(ingredient.slot) || ingredient.slot < 0 || ingredient.slot > 8) {
      throw new Error("Todo ingrediente da receita precisa ocupar um slot válido entre 0 e 8.");
    }
    if (usedSlots.has(ingredient.slot)) {
      throw new Error("Uma receita não pode definir dois ingredientes no mesmo slot físico do grid.");
    }
    usedSlots.add(ingredient.slot);
  }
  if (
    recipe.discipline === "enchantment"
    && (recipe.baseSlot === undefined || !recipe.ingredients.some((ingredient) => ingredient.slot === recipe.baseSlot))
  ) {
    throw new Error("Receitas de Encantamento precisam indicar um baseSlot que contenha o item-base a ser encantado.");
  }
  const crafting = clone(ensureCraftingState(value));
  const duplicate = crafting.recipes.find((entry) => entry.id === recipe.id);
  if (duplicate) return { crafting, learned: false, xpAwarded: 0 };
  crafting.recipes.push(clone(recipe));
  const xpAwarded = recipe.learnedFrom === "discovery" ? 20 : 0;
  if (xpAwarded) crafting.progress[recipe.discipline].xp += xpAwarded;
  return { crafting, learned: true, xpAwarded };
}

export function rejectCraftAttempt(value: CraftingState, attemptId?: string) {
  const state = ensureCraftingState(value);
  if (!state.pendingAttempt) return state;
  if (attemptId && state.pendingAttempt.id !== attemptId) return state;
  const crafting = clone(state);
  delete crafting.pendingAttempt;
  return crafting;
}

export function buildCraftRollPlan(
  value: CraftingState,
  inventory: CraftInventoryItem[],
  recipeId: string,
  system: "daggerheart" | "d20" = "daggerheart",
) {
  const crafting = clone(ensureCraftingState(value));
  const attempt = crafting.pendingAttempt;
  if (!attempt) throw new Error("Não existe tentativa de craft pendente.");
  if (attempt.stage === "awaiting-roll") throw new Error("Esta tentativa já está aguardando uma rolagem.");
  const recipe = recipeById(crafting, recipeId);
  if (!recipe) throw new Error("Receita de craft desconhecida.");
  if (recipe.discipline !== attempt.discipline) throw new Error("A receita pertence a outra disciplina de craft.");
  if (attempt.recipeId && attempt.recipeId !== recipe.id) {
    throw new Error("A receita solicitada não corresponde à receita vinculada a esta tentativa.");
  }
  if (!findMatchingRecipe([recipe], attempt.discipline, attempt.ingredients)) {
    throw new Error("Os ingredientes e posições do grid não correspondem à receita solicitada.");
  }
  validateAttemptInventory(inventory, attempt.ingredients);
  const rarity = recipe.result.rarity;
  if (!isBaseRarity(rarity)) throw new Error("Receita Lendária não pode ser produzida diretamente.");
  const level = craftLevelForXp(crafting.progress[recipe.discipline].xp);
  if (!canCraftRarity(level, rarity)) throw new Error("A raridade desta receita está acima do limite do nível de craft atual.");
  const chance = craftSuccessChanceFor(level, rarity, system);
  const { dc, formula, successChance } = chance;
  attempt.recipeId = recipe.id;
  attempt.rarity = rarity;
  attempt.dc = dc;
  attempt.successChance = successChance;
  attempt.stage = "awaiting-roll";
  const request = {
    label: `Craft: ${recipe.name}`,
    reason: `Concluir ${recipe.name} (${formatRarity(rarity)}).`,
    formula,
    ...(system === "daggerheart" ? { allowedDice: ["d12"] as const } : {}),
    target: dc,
    rollKind: system === "daggerheart" ? "duality" as const : "check" as const,
  };
  const plan: CraftRollPlan = { level, rarity, dc, successChance, formula, system };
  return { crafting, request, plan };
}

export function attachCraftPendingRoll(value: CraftingState, pendingRollId: string) {
  const crafting = clone(ensureCraftingState(value));
  if (!crafting.pendingAttempt || crafting.pendingAttempt.stage !== "awaiting-roll") {
    throw new Error("Não existe tentativa de craft aguardando rolagem.");
  }
  crafting.pendingAttempt.pendingRollId = pendingRollId;
  return crafting;
}

function removeIngredientUnits(
  inventory: CraftInventoryItem[],
  ingredients: CraftIngredient[],
  baseSlot?: number,
) {
  const next = clone(inventory);
  let baseItem: CraftInventoryItem | undefined;
  for (const ingredient of ingredients) {
    let needed = Math.max(1, Math.trunc(Number(ingredient.quantity) || 1));
    const candidates = next
      .filter((item) => item.qty > 0 && itemMatchesIngredient(item, ingredient))
      .sort((a, b) => Number(b.id === ingredient.itemId) - Number(a.id === ingredient.itemId));
    for (const item of candidates) {
      if (needed <= 0) break;
      if (ingredient.slot === baseSlot && !baseItem) baseItem = clone(item);
      const used = Math.min(needed, item.qty);
      item.qty -= used;
      needed -= used;
    }
    if (needed > 0) throw new Error(`O inventário mudou e não possui mais ${ingredient.itemName} em quantidade suficiente.`);
  }
  return { inventory: next.filter((item) => item.qty > 0), baseItem };
}

function stackCompatible(a: CraftInventoryItem, b: CraftInventoryItem) {
  return a.name === b.name
    && a.detail === b.detail
    && a.icon === b.icon
    && (a.rarity || "common") === (b.rarity || "common")
    && (a.sourceId || "") === (b.sourceId || "")
    && (a.art || "") === (b.art || "");
}

function resultItem(recipe: CraftRecipe, finalRarity: CraftRarity, critical: boolean, baseItem?: CraftInventoryItem): CraftInventoryItem {
  if (recipe.discipline === "enchantment" && recipe.baseSlot !== undefined && baseItem) {
    const patch = sanitizeResultPatch(recipe.result.patch, true);
    return {
      ...baseItem,
      ...clone(patch),
      id: baseItem.id,
      name: typeof patch.name === "string" ? patch.name : baseItem.name,
      detail: typeof patch.detail === "string" ? patch.detail : baseItem.detail,
      icon: typeof patch.icon === "string" ? patch.icon : baseItem.icon,
      qty: Math.max(1, recipe.result.quantity || 1),
      rarity: finalRarity,
      crafted: true,
      ...(critical && typeof patch.detail !== "string"
        ? { detail: `${baseItem.detail}${baseItem.detail ? " " : ""}(Obra-prima de crítico.)` }
        : {}),
    };
  }
  return {
    id: recipe.result.id || generatedId("crafted"),
    ...(recipe.result.sourceId ? { sourceId: recipe.result.sourceId } : {}),
    name: recipe.result.name,
    detail: critical ? `${recipe.result.detail}${recipe.result.detail ? " " : ""}(Obra-prima de crítico.)` : recipe.result.detail,
    icon: recipe.result.icon,
    ...(recipe.result.art ? { art: recipe.result.art } : {}),
    qty: Math.max(1, recipe.result.quantity || 1),
    rarity: finalRarity,
    crafted: true,
    ...sanitizeResultPatch(recipe.result.patch, false),
  };
}

export function resolveCraftAttempt(
  value: CraftingState,
  inventory: CraftInventoryItem[],
  recipe: CraftRecipe,
  roll: { system: "daggerheart" | "d20"; dice: number[]; modifier?: number },
) {
  const crafting = clone(ensureCraftingState(value));
  const attempt = crafting.pendingAttempt;
  if (!attempt || attempt.stage !== "awaiting-roll" || attempt.recipeId !== recipe.id) {
    throw new Error("Não existe tentativa pendente correspondente a esta receita.");
  }
  validateAttemptInventory(inventory, attempt.ingredients);
  const level = craftLevelForXp(crafting.progress[recipe.discipline].xp);
  const rarity = recipe.result.rarity;
  if (!isBaseRarity(rarity)) throw new Error("Receita Lendária não pode ser produzida diretamente.");
  const dc = attempt.dc ?? (roll.system === "daggerheart" ? DH_DC[rarity] : D20_DC[rarity]);
  let critical = false;
  let total = level + (Number.isFinite(roll.modifier) ? roll.modifier! : 0);
  if (roll.system === "daggerheart") {
    if (roll.dice.length < 2) throw new Error("Craft Daggerheart precisa dos dois d12 da rolagem de Dualidade.");
    const [a, b] = roll.dice;
    critical = a === b;
    total += a + b;
  } else {
    if (!roll.dice.length) throw new Error("Craft precisa do resultado do d20.");
    critical = roll.dice[0] === 20;
    total += roll.dice[0];
  }
  const success = critical || total >= dc;
  if (!success) {
    attempt.stage = "review";
    delete attempt.pendingRollId;
    delete attempt.dc;
    delete attempt.successChance;
    return { crafting, inventory: clone(inventory), success: false, critical: false, finalRarity: rarity, xpAwarded: 0 };
  }

  const finalRarity = critical ? upgradeCraftRarity(rarity) : rarity;
  const consumed = removeIngredientUnits(inventory, attempt.ingredients, recipe.baseSlot);
  let output = resultItem(recipe, finalRarity, critical, consumed.baseItem);
  const nextInventory = consumed.inventory;
  if (
    recipe.discipline === "enchantment"
    && recipe.baseSlot !== undefined
    && nextInventory.some((entry) => entry.id === output.id)
  ) {
    output = { ...output, id: generatedId("enchanted") };
  }
  const compatible = nextInventory.find((entry) => stackCompatible(entry, output));
  if (compatible && !(recipe.discipline === "enchantment" && recipe.baseSlot !== undefined)) {
    compatible.qty += output.qty;
  } else {
    nextInventory.push(output);
  }
  const xpAwarded = XP_BY_RARITY[finalRarity];
  crafting.progress[recipe.discipline].xp += xpAwarded;
  delete crafting.pendingAttempt;
  return { crafting, inventory: nextInventory, success: true, critical, finalRarity, xpAwarded, output };
}
