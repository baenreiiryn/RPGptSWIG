import assert from "node:assert/strict";
import test from "node:test";

const crafting = await import("../lib/crafting.ts");

const {
  CRAFTING_STATE_VERSION,
  awardCraftXp,
  beginCraftAttempt,
  buildCraftRollPlan,
  craftLevelForXp,
  createInitialCraftingState,
  ensureCraftingState,
  findMatchingRecipe,
  learnCraftRecipe,
  rarityCapForLevel,
  rejectCraftAttempt,
  resolveCraftAttempt,
} = crafting;

const at = "2026-10-21T00:00:00.000Z";

function item(overrides = {}) {
  return {
    id: "iron-1",
    name: "Lingote de Ferro",
    qty: 3,
    detail: "Metal de forja",
    icon: "Fe",
    sourceId: "material:iron",
    ...overrides,
  };
}

function ingredient(overrides = {}) {
  return {
    slot: 0,
    sourceId: "material:iron",
    itemId: "iron-1",
    itemName: "Lingote de Ferro",
    quantity: 1,
    ...overrides,
  };
}

function recipe(overrides = {}) {
  return {
    id: "recipe-sword",
    name: "Espada Forjada",
    discipline: "mundane",
    layout: "shaped",
    ingredients: [ingredient()],
    result: {
      name: "Espada Forjada",
      detail: "Uma lâmina feita na oficina.",
      icon: "⚔",
      rarity: "common",
      quantity: 1,
    },
    learnedFrom: "teacher",
    learnedAt: at,
    ...overrides,
  };
}

test("XP derives levels 0 through 10 at the design thresholds and clamps at 10", () => {
  const cases = [
    [0, 0], [99, 0], [100, 1], [249, 1], [250, 2], [449, 2],
    [450, 3], [699, 3], [700, 4], [999, 4], [1000, 5], [1349, 5],
    [1350, 6], [1749, 6], [1750, 7], [2199, 7], [2200, 8], [2699, 8],
    [2700, 9], [3249, 9], [3250, 10], [999999, 10], [-20, 0],
  ];
  for (const [xp, expected] of cases) assert.equal(craftLevelForXp(xp), expected, `xp=${xp}`);
});

test("rarity cap follows the four level bands", () => {
  assert.equal(rarityCapForLevel(0), "common");
  assert.equal(rarityCapForLevel(1), "common");
  assert.equal(rarityCapForLevel(2), "uncommon");
  assert.equal(rarityCapForLevel(4), "uncommon");
  assert.equal(rarityCapForLevel(5), "rare");
  assert.equal(rarityCapForLevel(7), "rare");
  assert.equal(rarityCapForLevel(8), "very-rare");
  assert.equal(rarityCapForLevel(10), "very-rare");
});

test("initial and legacy crafting state always contain three independent progress tracks", () => {
  const initial = createInitialCraftingState();
  assert.equal(initial.version, CRAFTING_STATE_VERSION);
  assert.deepEqual(initial.progress, {
    mundane: { xp: 0 },
    enchantment: { xp: 0 },
    alchemy: { xp: 0 },
  });
  assert.deepEqual(initial.recipes, []);

  const ensured = ensureCraftingState({
    version: 1,
    progress: { mundane: { xp: 250 } },
    recipes: [],
  });
  assert.equal(ensured.progress.mundane.xp, 250);
  assert.equal(ensured.progress.enchantment.xp, 0);
  assert.equal(ensured.progress.alchemy.xp, 0);
});

test("beginCraftAttempt reserves inventory without allowing the same stack to be over-reserved", () => {
  const state = createInitialCraftingState();
  const inventory = [item({ qty: 2 })];
  const started = beginCraftAttempt(state, inventory, {
    id: "attempt-1",
    discipline: "mundane",
    ingredients: [ingredient({ slot: 0, quantity: 1 }), ingredient({ slot: 1, quantity: 1 })],
    requestedAt: at,
  });
  assert.equal(started.attempt.stage, "review");
  assert.equal(started.crafting.pendingAttempt.id, "attempt-1");
  assert.equal(inventory[0].qty, 2, "reservation must stay pure");

  assert.throws(() => beginCraftAttempt(state, inventory, {
    id: "attempt-too-many",
    discipline: "mundane",
    ingredients: [ingredient({ slot: 0, quantity: 2 }), ingredient({ slot: 1, quantity: 1 })],
    requestedAt: at,
  }), /invent[aá]rio|quantidade|dispon/i);

  assert.throws(() => beginCraftAttempt(started.crafting, inventory, {
    id: "attempt-overwrite-review",
    discipline: "mundane",
    ingredients: [ingredient({ slot: 0, quantity: 1 })],
    requestedAt: at,
  }), /tentativa|pendente|andamento|avali/i, "a review attempt must not be overwritten by a second attempt");
});

test("beginCraftAttempt preserves a trimmed player crafting intent with a safe length cap", () => {
  const state = createInitialCraftingState();
  const inventory = [item({ qty: 2 })];
  const longIntent = `  Quero criar uma lâmina ritual ${"muito ".repeat(120)}resistente.  `;
  const started = beginCraftAttempt(state, inventory, {
    id: "attempt-intent",
    discipline: "mundane",
    ingredients: [ingredient({ slot: 0 }), ingredient({ slot: 1 })],
    requestedAt: at,
    intent: longIntent,
  });
  assert.ok(started.attempt.intent);
  assert.equal(started.attempt.intent, started.attempt.intent.trim());
  assert.ok(started.attempt.intent.length <= 500);
  assert.match(started.attempt.intent, /^Quero criar uma lâmina ritual/);
});

test("recipe matching honors shaped slots, shapeless composition, and canonical identity priority", () => {
  const shaped = recipe({
    id: "shaped",
    ingredients: [ingredient({ slot: 0, itemId: "old-stack" }), ingredient({ slot: 4, sourceId: undefined, itemId: undefined, itemName: "Pó de Fênix" })],
  });
  const shapeless = recipe({
    id: "shapeless",
    layout: "shapeless",
    ingredients: [ingredient({ slot: 0, itemId: "old-stack" }), ingredient({ slot: 4, sourceId: undefined, itemId: undefined, itemName: "Pó de Fênix" })],
  });
  const sameCompositionDifferentSlots = [
    ingredient({ slot: 8, itemId: "new-stack" }),
    ingredient({ slot: 2, sourceId: undefined, itemId: undefined, itemName: "po de fenix" }),
  ];

  assert.equal(findMatchingRecipe([shaped], "mundane", sameCompositionDifferentSlots), undefined);
  assert.equal(findMatchingRecipe([shapeless], "mundane", sameCompositionDifferentSlots)?.id, "shapeless");

  const conflictingCanonical = [ingredient({ slot: 0, sourceId: "material:copper", itemId: "old-stack" }), shaped.ingredients[1]];
  assert.equal(findMatchingRecipe([shapeless], "mundane", conflictingCanonical), undefined,
    "sourceId must win over a coincidentally equal itemId");

  const twoIronShapeless = recipe({
    id: "two-iron-shapeless",
    layout: "shapeless",
    ingredients: [ingredient({ slot: 0, quantity: 1 }), ingredient({ slot: 1, quantity: 1 })],
  });
  assert.equal(findMatchingRecipe([twoIronShapeless], "mundane", [ingredient({ slot: 8, quantity: 2 })])?.id, "two-iron-shapeless",
    "shapeless recipes should compare total composition, not slot grouping");
  assert.equal(findMatchingRecipe([twoIronShapeless], "mundane", [ingredient({ slot: 8, quantity: 3 })]), undefined,
    "extra material changes the shapeless composition");

  const reacquiredByName = recipe({
    id: "reacquired-by-name",
    ingredients: [ingredient({ sourceId: undefined, itemId: "old-stack", itemName: "Lingote de Ferro" })],
  });
  assert.equal(findMatchingRecipe([reacquiredByName], "mundane", [
    ingredient({ slot: 0, sourceId: undefined, itemId: "new-stack", itemName: "Lingote de Ferro" }),
  ])?.id, "reacquired-by-name", "name fallback should survive reacquiring an equivalent item with a new instance id");
});

test("learning a discovered recipe is idempotent and awards discovery XP only once", () => {
  const state = createInitialCraftingState();
  const discovered = recipe({ learnedFrom: "discovery" });
  const first = learnCraftRecipe(state, discovered);
  assert.equal(first.learned, true);
  assert.equal(first.xpAwarded, 20);
  assert.equal(first.crafting.recipes.length, 1);
  assert.equal(first.crafting.progress.mundane.xp, 20);

  const second = learnCraftRecipe(first.crafting, discovered);
  assert.equal(second.learned, false);
  assert.equal(second.xpAwarded, 0);
  assert.equal(second.crafting.recipes.length, 1);
  assert.equal(second.crafting.progress.mundane.xp, 20);

  assert.throws(() => learnCraftRecipe(state, recipe({
    id: "legendary-base",
    result: { ...recipe().result, rarity: "legendary" },
  })), /lend[aá]ri|legendary/i);

  assert.throws(() => learnCraftRecipe(state, recipe({
    id: "invalid-enchantment",
    discipline: "enchantment",
  })), /base|slot|encant/i);

  assert.throws(() => learnCraftRecipe(state, recipe({
    id: "duplicate-slot",
    ingredients: [ingredient({ slot: 0 }), ingredient({ slot: 0, itemId: "second", itemName: "Carvão" })],
  })), /slot|posição|posiç/i, "a grid recipe cannot define two ingredients in the same physical slot");
});

test("inventory validation can aggregate equivalent source stacks when an ingredient is not tied to one instance", () => {
  const state = createInitialCraftingState();
  const inventory = [
    item({ id: "iron-a", sourceId: "material:iron", qty: 1 }),
    item({ id: "iron-b", sourceId: "material:iron", qty: 1 }),
  ];
  const started = beginCraftAttempt(state, inventory, {
    id: "attempt-split-stacks",
    discipline: "mundane",
    ingredients: [ingredient({ sourceId: "material:iron", itemId: undefined, quantity: 2 })],
    requestedAt: at,
  });
  assert.equal(started.attempt.ingredients[0].quantity, 2);
});

test("awardCraftXp is pure, discipline-specific, and enforces the 200 XP tool ceiling", () => {
  const state = createInitialCraftingState();
  const awarded = awardCraftXp(state, "alchemy", 200);
  assert.equal(awarded.progress.alchemy.xp, 200);
  assert.equal(awarded.progress.mundane.xp, 0);
  assert.equal(state.progress.alchemy.xp, 0);
  assert.throws(() => awardCraftXp(state, "alchemy", 201), /200/);
});

test("buildCraftRollPlan calculates Daggerheart 2d12 CD and exact doubles-aware chance", () => {
  let state = createInitialCraftingState();
  state = awardCraftXp(state, "mundane", 200);
  state = awardCraftXp(state, "mundane", 50);
  const uncommon = recipe({ result: { ...recipe().result, rarity: "uncommon" } });
  state = learnCraftRecipe(state, uncommon).crafting;
  const started = beginCraftAttempt(state, [item()], {
    id: "attempt-dh",
    discipline: "mundane",
    ingredients: [ingredient()],
    recipeId: uncommon.id,
    requestedAt: at,
  });
  const planned = buildCraftRollPlan(started.crafting, [item()], uncommon.id, "daggerheart");
  assert.deepEqual(planned.request, {
    label: "Craft: Espada Forjada",
    reason: "Concluir Espada Forjada (Incomum).",
    formula: "2d12+2",
    allowedDice: ["d12"],
    target: 17,
    rollKind: "duality",
  });
  assert.equal(planned.plan.level, 2);
  assert.equal(planned.plan.successChance, 43.1);
  assert.equal(planned.crafting.pendingAttempt.stage, "awaiting-roll");
  assert.equal(planned.crafting.pendingAttempt.dc, 17);
  assert.equal(planned.crafting.pendingAttempt.successChance, 43.1);
});

test("buildCraftRollPlan uses d20 fallback and blocks recipes above the current cap", () => {
  let state = createInitialCraftingState();
  state = awardCraftXp(state, "mundane", 200);
  state = awardCraftXp(state, "mundane", 200);
  state = awardCraftXp(state, "mundane", 50);
  const uncommon = recipe({ result: { ...recipe().result, rarity: "uncommon" } });
  state = learnCraftRecipe(state, uncommon).crafting;
  const started = beginCraftAttempt(state, [item()], {
    id: "attempt-d20",
    discipline: "mundane",
    ingredients: [ingredient()],
    recipeId: uncommon.id,
    requestedAt: at,
  });
  const planned = buildCraftRollPlan(started.crafting, [item()], uncommon.id, "d20");
  assert.equal(planned.request.formula, "1d20+3");
  assert.equal(planned.request.target, 14);
  assert.equal(planned.request.rollKind, "check");
  assert.equal(planned.plan.successChance, 50);

  const rare = recipe({ id: "rare", result: { ...recipe().result, rarity: "rare" } });
  let rareState = learnCraftRecipe(state, rare).crafting;
  rareState = beginCraftAttempt(rareState, [item()], {
    id: "attempt-too-rare",
    discipline: "mundane",
    ingredients: [ingredient()],
    recipeId: rare.id,
    requestedAt: at,
  }).crafting;
  assert.throws(() => buildCraftRollPlan(rareState, [item()], "rare", "d20"), /raridade|n[ií]vel|limite/i);
});

test("buildCraftRollPlan refuses a recipe that does not match the current grid", () => {
  const known = recipe({
    id: "copper-recipe",
    ingredients: [ingredient({ sourceId: "material:copper", itemId: "copper-1", itemName: "Lingote de Cobre" })],
  });
  let state = learnCraftRecipe(createInitialCraftingState(), known).crafting;
  state = beginCraftAttempt(state, [item()], {
    id: "attempt-wrong-grid",
    discipline: "mundane",
    ingredients: [ingredient()],
    recipeId: known.id,
    requestedAt: at,
  }).crafting;
  assert.throws(() => buildCraftRollPlan(state, [item()], known.id, "d20"), /receita|grid|ingrediente|combina/i);
});

test("failed craft consumes nothing, grants no XP, and unlocks the attempt for retry", () => {
  const known = recipe();
  let state = learnCraftRecipe(createInitialCraftingState(), known).crafting;
  state = beginCraftAttempt(state, [item({ qty: 2 })], {
    id: "attempt-fail",
    discipline: "mundane",
    ingredients: [ingredient()],
    recipeId: known.id,
    requestedAt: at,
  }).crafting;
  state = buildCraftRollPlan(state, [item({ qty: 2 })], known.id, "daggerheart").crafting;
  const inventory = [item({ qty: 2 })];
  const result = resolveCraftAttempt(state, inventory, known, { system: "daggerheart", dice: [1, 2] });
  assert.equal(result.success, false);
  assert.equal(result.critical, false);
  assert.deepEqual(result.inventory, inventory);
  assert.equal(result.crafting.progress.mundane.xp, 0);
  assert.equal(result.crafting.pendingAttempt.stage, "review");
});

test("conditional dice modifiers such as vampire hunger affect crafting without canceling duality criticals", () => {
  const known = recipe();
  let state = learnCraftRecipe(createInitialCraftingState(), known).crafting;
  const inventory = [item({ qty: 2 })];
  state = beginCraftAttempt(state, inventory, { id: "hunger-craft", discipline: "mundane", ingredients: [ingredient()], recipeId: known.id, requestedAt: at }).crafting;
  state = buildCraftRollPlan(state, inventory, known.id, "daggerheart").crafting;
  assert.equal(resolveCraftAttempt(state, inventory, known, { system: "daggerheart", dice: [8, 9], modifier: -6 }).success, false);
  assert.equal(resolveCraftAttempt(state, inventory, known, { system: "daggerheart", dice: [8, 8], modifier: -6 }).critical, true);
});

test("successful craft revalidates, consumes atomically, stacks a compatible result, and awards XP", () => {
  const known = recipe();
  let state = learnCraftRecipe(createInitialCraftingState(), known).crafting;
  const inventory = [
    item({ qty: 2 }),
    { id: "crafted-stack", name: "Espada Forjada", qty: 1, detail: "Uma lâmina feita na oficina.", icon: "⚔", rarity: "common" },
  ];
  state = beginCraftAttempt(state, inventory, {
    id: "attempt-success",
    discipline: "mundane",
    ingredients: [ingredient()],
    recipeId: known.id,
    requestedAt: at,
  }).crafting;
  state = buildCraftRollPlan(state, inventory, known.id, "daggerheart").crafting;
  const result = resolveCraftAttempt(state, inventory, known, { system: "daggerheart", dice: [7, 7] });
  assert.equal(result.success, true);
  assert.equal(result.critical, true);
  assert.equal(result.finalRarity, "uncommon");
  assert.equal(result.xpAwarded, 30);
  assert.equal(result.inventory.find((entry) => entry.id === "iron-1").qty, 1);
  const crafted = result.inventory.find((entry) => entry.name === "Espada Forjada" && entry.rarity === "uncommon");
  assert.equal(crafted.qty, 1, "critical output must not stack into a common stack");
  assert.match(crafted.detail, /obra-prima|cr[ií]tic/i);
  assert.equal(result.crafting.progress.mundane.xp, 30);
  assert.equal(result.crafting.pendingAttempt, undefined);

  const staleInventory = [item({ qty: 0 })];
  const before = structuredClone(staleInventory);
  assert.throws(() => resolveCraftAttempt(state, staleInventory, known, { system: "daggerheart", dice: [12, 12] }), /tentativa|pendente|invent[aá]rio/i);
  assert.deepEqual(staleInventory, before);
});

test("non-critical success stacks compatible output", () => {
  const known = recipe();
  let state = learnCraftRecipe(createInitialCraftingState(), known).crafting;
  const inventory = [
    item({ qty: 1 }),
    { id: "crafted-stack", name: "Espada Forjada", qty: 1, detail: "Uma lâmina feita na oficina.", icon: "⚔", rarity: "common" },
  ];
  state = beginCraftAttempt(state, inventory, {
    id: "attempt-stack",
    discipline: "mundane",
    ingredients: [ingredient()],
    recipeId: known.id,
    requestedAt: at,
  }).crafting;
  state = buildCraftRollPlan(state, inventory, known.id, "d20").crafting;
  const result = resolveCraftAttempt(state, inventory, known, { system: "d20", dice: [11] });
  assert.equal(result.success, true);
  assert.equal(result.critical, false);
  assert.equal(result.xpAwarded, 20);
  assert.equal(result.inventory.length, 1);
  assert.equal(result.inventory[0].id, "crafted-stack");
  assert.equal(result.inventory[0].qty, 2);
});

test("generic recipe patches cannot override protected inventory identity, quantity, or rarity", () => {
  const protectedRecipe = recipe({
    id: "protected-patch",
    result: {
      ...recipe().result,
      patch: { id: "hijacked", qty: 99, rarity: "legendary", crafted: false, customEffect: "spark" },
    },
  });
  let state = learnCraftRecipe(createInitialCraftingState(), protectedRecipe).crafting;
  const inventory = [item({ qty: 1 })];
  state = beginCraftAttempt(state, inventory, {
    id: "attempt-protected-patch",
    discipline: "mundane",
    ingredients: protectedRecipe.ingredients,
    recipeId: protectedRecipe.id,
    requestedAt: at,
  }).crafting;
  state = buildCraftRollPlan(state, inventory, protectedRecipe.id, "d20").crafting;
  const result = resolveCraftAttempt(state, inventory, protectedRecipe, { system: "d20", dice: [11] });
  const output = result.inventory[0];
  assert.notEqual(output.id, "hijacked");
  assert.equal(output.qty, 1);
  assert.equal(output.rarity, "common");
  assert.equal(output.crafted, true);
  assert.equal(output.customEffect, "spark");
});

test("a very-rare critical creates legendary output and grants legendary XP", () => {
  const veryRare = recipe({ id: "very-rare", result: { ...recipe().result, rarity: "very-rare" } });
  let state = createInitialCraftingState();
  for (const amount of [200, 200, 200, 200, 200, 200, 200, 200, 200, 200, 200]) {
    state = awardCraftXp(state, "mundane", amount);
  }
  assert.equal(craftLevelForXp(state.progress.mundane.xp), 8);
  state = learnCraftRecipe(state, veryRare).crafting;
  const inventory = [item({ qty: 1 })];
  state = beginCraftAttempt(state, inventory, {
    id: "attempt-legendary",
    discipline: "mundane",
    ingredients: [ingredient()],
    recipeId: veryRare.id,
    requestedAt: at,
  }).crafting;
  state = buildCraftRollPlan(state, inventory, veryRare.id, "daggerheart").crafting;
  const beforeXp = state.progress.mundane.xp;
  const result = resolveCraftAttempt(state, inventory, veryRare, { system: "daggerheart", dice: [1, 1] });
  assert.equal(result.success, true, "doubles are an automatic Daggerheart success");
  assert.equal(result.critical, true);
  assert.equal(result.finalRarity, "legendary");
  assert.equal(result.xpAwarded, 90);
  assert.equal(result.crafting.progress.mundane.xp, beforeXp + 90);
  assert.equal(result.inventory[0].rarity, "legendary");
});

test("enchantment baseSlot preserves the exact base item and applies only the explicit result patch", () => {
  const enchanted = recipe({
    id: "flame-enchant",
    name: "Runa Flamejante",
    discipline: "enchantment",
    baseSlot: 4,
    ingredients: [
      ingredient({ slot: 4, sourceId: "weapon:sword", itemId: "sword-arven", itemName: "Espada de Arven" }),
      ingredient({ slot: 5, sourceId: "reagent:ember", itemId: "ember-1", itemName: "Brasa Arcana" }),
    ],
    result: {
      name: "Arma Flamejante",
      detail: "Template de encantamento",
      icon: "✦",
      rarity: "common",
      quantity: 1,
      patch: { detail: "Aço antigo envolto em runas flamejantes.", enchantment: "flame" },
    },
  });
  const inventory = [
    { id: "sword-arven", sourceId: "weapon:sword", name: "Espada de Arven", qty: 1, detail: "Aço antigo", icon: "⚔", art: "/sword.png", rarity: "common", ownerMark: "Arven" },
    { id: "ember-1", sourceId: "reagent:ember", name: "Brasa Arcana", qty: 1, detail: "Quente", icon: "●" },
  ];
  let state = learnCraftRecipe(createInitialCraftingState(), enchanted).crafting;
  state = beginCraftAttempt(state, inventory, {
    id: "attempt-enchant",
    discipline: "enchantment",
    ingredients: enchanted.ingredients,
    recipeId: enchanted.id,
    requestedAt: at,
  }).crafting;
  state = buildCraftRollPlan(state, inventory, enchanted.id, "d20").crafting;
  const result = resolveCraftAttempt(state, inventory, enchanted, { system: "d20", dice: [11] });
  assert.equal(result.success, true);
  assert.equal(result.inventory.length, 1);
  const output = result.inventory[0];
  assert.equal(output.id, "sword-arven");
  assert.equal(output.sourceId, "weapon:sword");
  assert.equal(output.name, "Espada de Arven");
  assert.equal(output.icon, "⚔");
  assert.equal(output.art, "/sword.png");
  assert.equal(output.ownerMark, "Arven");
  assert.equal(output.detail, "Aço antigo envolto em runas flamejantes.");
  assert.equal(output.enchantment, "flame");
});

test("enchanting one unit from a stack splits the crafted item without duplicating inventory ids", () => {
  const enchanted = recipe({
    id: "stack-enchant",
    discipline: "enchantment",
    baseSlot: 4,
    ingredients: [ingredient({ slot: 4, sourceId: "potion:healing", itemId: "potion-stack", itemName: "Poção de Cura" })],
    result: {
      name: "Poção Encantada",
      detail: "Encantamento",
      icon: "✦",
      rarity: "common",
      quantity: 1,
      patch: { detail: "Uma dose de cura encantada." },
    },
  });
  const inventory = [{ id: "potion-stack", sourceId: "potion:healing", name: "Poção de Cura", qty: 3, detail: "Cura", icon: "◉", rarity: "common" }];
  let state = learnCraftRecipe(createInitialCraftingState(), enchanted).crafting;
  state = beginCraftAttempt(state, inventory, {
    id: "attempt-stack-enchant",
    discipline: "enchantment",
    ingredients: enchanted.ingredients,
    recipeId: enchanted.id,
    requestedAt: at,
  }).crafting;
  state = buildCraftRollPlan(state, inventory, enchanted.id, "d20").crafting;
  const result = resolveCraftAttempt(state, inventory, enchanted, { system: "d20", dice: [11] });
  assert.equal(result.success, true);
  assert.equal(result.inventory.length, 2);
  assert.equal(new Set(result.inventory.map((entry) => entry.id)).size, 2, "inventory ids must stay unique");
  assert.equal(result.inventory.find((entry) => entry.id === "potion-stack").qty, 2);
  assert.equal(result.inventory.find((entry) => entry.detail === "Uma dose de cura encantada.").qty, 1);
});

test("rejectCraftAttempt only clears the addressed attempt and is idempotent", () => {
  const started = beginCraftAttempt(createInitialCraftingState(), [item()], {
    id: "attempt-reject",
    discipline: "mundane",
    ingredients: [ingredient()],
    requestedAt: at,
  }).crafting;
  const untouched = rejectCraftAttempt(started, "other-attempt");
  assert.equal(untouched.pendingAttempt.id, "attempt-reject");
  const rejected = rejectCraftAttempt(started, "attempt-reject");
  assert.equal(rejected.pendingAttempt, undefined);
  assert.deepEqual(rejectCraftAttempt(rejected, "attempt-reject"), rejected);
});
