import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
registerHooks({
  resolve(s, c, next) {
    if (s.startsWith("@/")) {
      const p = path.join(process.cwd(), s.slice(2));
      return next(
        pathToFileURL(/\.[a-z0-9]+$/i.test(p) ? p : p + ".ts").href,
        c,
      );
    }
    if (
      (s.startsWith("./") || s.startsWith("../")) &&
      !/\.[a-z0-9]+$/i.test(s)
    ) {
      try {
        return next(s + ".ts", c);
      } catch {}
    }
    return next(s, c);
  },
});
const rules = await import("../lib/cyberpunk/rules.ts"),
  state = await import("../lib/cyberpunk/state.ts"),
  cat = await import("../lib/cyberpunk/catalog.ts"),
  hack = await import("../lib/cyberpunk/hacking.ts"),
  gm = await import("../lib/cyberpunk/gm.ts"),
  game = await import("../lib/game.ts");
const sequence = (...v) => {
  let i = 0;
  return () => v[i++];
};
function campaign(era = 2077) {
  return state.buildCyberCampaign({
    era,
    campaignName: "Night City Test",
    name: "Merc",
    tone: "Noir",
    hook: "Trabalho novo",
    stats: { ...rules.DEFAULT_STATS },
    skills: state.suggestedCyberSkills("Netrunner"),
    role: "Netrunner",
    history: "Um passado.",
    nativeLanguage: "Português",
    items: [],
    neuroport: true,
  });
}
function netState() {
  const s = campaign().cyberpunk;
  s.inventory.push(
    {
      id: "port",
      sourceId: cat.cyberCatalog.find(
        (e) => e.name === "Neuroport Cyberdeck Port",
      ).id,
      name: "Neuroport Cyberdeck Port",
      type: "cyberware",
      installed: true,
      qty: 1,
    },
    {
      id: "deck",
      sourceId: cat.cyberCatalog.find((e) => e.type === "cyberdeck").id,
      name: "Cyberdeck",
      type: "cyberdeck",
      qty: 1,
    },
  );
  s.net.targets = [
    {
      id: "t",
      name: "Guarda",
      neuroport: true,
      visible: true,
      distance: 30,
      will: 5,
      selfIce: 1,
      breached: 0,
      connected: false,
      aware: false,
      effects: [],
    },
  ];
  return s;
}
test("import includes core embedded skills with correct attributes and doubled costs", () => {
  for (const [name, stat] of [
    ["Handgun", "ref"],
    ["First Aid", "tech"],
    ["Human Perception", "emp"],
    ["Concentration", "will"],
    ["Electronics/Security Tech", "tech"],
  ])
    assert.equal(
      state.skillOptions().find((e) => e.name === name)?.data.stat,
      stat,
      name,
    );
  assert.ok(state.difficultSkills.has("Electronics/Security Tech"));
});
test("all ten role suggestions spend exactly 86 points and preserve mandatory basic skills", () => {
  for (const role of cat.roles) {
    const skills = state.suggestedCyberSkills(role.name);
    assert.equal(rules.skillCost(skills, state.difficultSkills), 86, role.name);
    assert.deepEqual(
      rules.validateBuild(rules.DEFAULT_STATS, skills, state.difficultSkills),
      [],
    );
  }
});
test("creation validates 62 stat points, basic skills, known roles and native language", () => {
  const d = {
    era: 2045,
    campaignName: "T",
    name: "T",
    tone: "",
    hook: "",
    stats: { ...rules.DEFAULT_STATS },
    skills: state.suggestedCyberSkills("Solo"),
    role: "Solo",
    history: "",
    nativeLanguage: "PT",
    items: [],
    neuroport: false,
  };
  for (const change of [
    { stats: { ...d.stats, int: 9 } },
    { role: "Paladino" },
    { nativeLanguage: "" },
    { skills: { ...d.skills, Athletics: 0 } },
  ])
    assert.throws(() => state.buildCyberCampaign({ ...d, ...change }));
  const g = campaign();
  assert.equal(g.cyberpunk.maxHp, 40);
  assert.equal(g.cyberpunk.humanity, 60);
  assert.equal(g.cyberpunk.inventory.filter((i) => i.installed).length, 1);
});
test("2045 excludes all 47 CEMK entries and the free childhood Neuroport", () => {
  assert.equal(cat.cyberCatalog.filter((e) => e.era === 2077).length, 47);
  assert.ok(cat.entriesForEra(2045).every((e) => e.era === 2045));
  assert.equal(campaign(2045).cyberpunk.inventory.length, 0);
  assert.throws(() =>
    state.purchaseItem(
      campaign(2045).cyberpunk,
      cat.cyberCatalog.find((e) => e.era === 2077),
    ),
  );
});
test("ties fail and natural 10/1 add/subtract a single extra d10 without chaining", () => {
  assert.deepEqual(rules.resolveCyberCheck(10, 15, sequence(0.4)), {
    dice: [5],
    total: 15,
    success: false,
  });
  assert.deepEqual(rules.resolveCyberCheck(5, 20, sequence(0.99, 0.99)), {
    dice: [10, 10],
    total: 25,
    success: true,
  });
  assert.deepEqual(rules.resolveCyberCheck(10, 8, sequence(0, 0.1)), {
    dice: [1, 2],
    total: 9,
    success: true,
  });
});
test("damage applies penetration, ablation, half armor, head multiplier and separate critical damage", () => {
  const s = campaign().cyberpunk;
  s.armor = { body: 11, head: 11 };
  let r = rules.applyCyberDamage(s, 10);
  assert.equal(r.hp, 40);
  assert.equal(r.armor.body, 11);
  r = rules.applyCyberDamage(s, 16, { location: "head", critical: true });
  assert.equal(r.hp, 25);
  assert.equal(r.armor.head, 10);
  r = rules.applyCyberDamage(s, 12, { halfArmor: true });
  assert.equal(r.hp, 34);
  r = rules.applyCyberDamage(s, 8, { ignoreArmor: true });
  assert.equal(r.hp, 32);
  assert.equal(r.armor.body, 11);
  assert.equal(
    rules.applyCyberDamage(s, 16, { critical: true, power: true }).hp,
    25,
  );
  assert.throws(() => rules.applyCyberDamage(s, NaN));
});
test("two sixes flag a critical injury; death saves do not explode and always fail on natural 10", () => {
  const s = campaign().cyberpunk,
    r = rules.makeCyberRoll(
      s,
      { id: "r", kind: "damage", label: "Gun", count: 3 },
      0,
      sequence(0.99, 0.99, 0),
    );
  assert.equal(r.critical, true);
  assert.deepEqual(r.dice, [6, 6, 1]);
  const d = rules.makeCyberRoll(
    { ...s, hp: 0 },
    { id: "d", kind: "death", label: "Death" },
    0,
    sequence(0.99),
  );
  assert.equal(d.success, false);
  assert.equal(d.dice.length, 1);
  assert.throws(() =>
    gm.executeCyberTool(campaign(), "request_roll", {
      label: "Death",
      kind: "death",
    }),
  );
});
test("installation enforces base capacity and charges rolled Humanity exactly once", () => {
  let s = campaign().cyberpunk;
  const e = cat.cyberCatalog.find((e) => e.name === "Neuroport Cyberdeck Port");
  s = state.purchaseItem(s, e);
  const id = s.inventory.at(-1).id;
  assert.throws(() => state.requestCyberInstall(s, id));
  const p = state.requestCyberInstall(s, id, s.inventory[0].id);
  assert.equal(p.kind, "humanity");
  s = state.installCyberware(s, id, s.inventory[0].id, 4);
  assert.equal(s.humanity, 56);
  assert.equal(s.maxHumanity, 58);
  assert.throws(() => state.installCyberware(s, id, s.inventory[0].id, 4));
});
test("quickhacking enforces era, port/deck, Neuroport, visibility, distance and action quota", () => {
  const s = netState();
  assert.doesNotThrow(() => hack.requestHack(s, "t", "jack", 0));
  for (const change of [
    { distance: 51 },
    { visible: false },
    { neuroport: false },
  ]) {
    const c = structuredClone(s);
    Object.assign(c.net.targets[0], change);
    assert.throws(() => hack.requestHack(c, "t", "jack", 0));
  }
  for (const change of [
    { era: 2045 },
    { inventory: [] },
    { inventory: s.inventory.filter((i) => i.type !== "cyberdeck") },
    { net: { ...s.net, actionsUsed: 3 } },
    { net: { ...s.net, meatAction: true } },
  ])
    assert.throws(() => hack.requestHack({ ...s, ...change }, "t", "jack", 0));
});
test("failed Jack In connects and alerts; each wall and attempted hack consume actions", () => {
  let s = netState(),
    p = hack.requestHack(s, "t", "jack", 0);
  s = hack.finishHack(s, p, { success: false }, 0);
  assert.equal(s.net.targets[0].connected, true);
  assert.equal(s.net.targets[0].aware, true);
  assert.throws(() => hack.requestHack(s, "t", "quickhack", 0, "overheat"));
  p = hack.requestHack(s, "t", "breach", 0);
  assert.equal(p.target, 6);
  s = hack.finishHack(s, p, { success: true }, 0);
  p = hack.requestHack(s, "t", "quickhack", 0, "overheat");
  s = hack.finishHack(s, p, { success: false }, 0);
  assert.equal(s.net.targets[0].lastHackTurn, 1);
  s.net.actionsUsed = 0;
  assert.throws(() => hack.requestHack(s, "t", "quickhack", 0, "reset"));
});
test("map markers belong to their era and all referenced local art exists", () => {
  assert.equal(state.defaultPlaces(2045).length, 43);
  assert.equal(
    state.defaultPlaces(2077).filter((p) => p.precision === "district").length,
    17,
  );
  assert.ok(state.defaultPlaces(2077).length > 17);
  for (const era of [2045, 2077])
    for (const p of state.defaultPlaces(era)) {
      assert.equal(p.era, era);
      assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);
    }
  for (const e of cat.cyberCatalog)
    if (e.art) assert.ok(fs.existsSync(path.join("public", e.art)), e.art);
  assert.ok(fs.existsSync("public/cyberpunk/dice/d10-10.webp"));
});
test("save, reopen and restart preserve remaining HP without Daggerheart migration", () => {
  let g = campaign();
  g.campaign.restartSnapshot = game.createCampaignRestartSnapshot(g);
  g.cyberpunk.hp = 10;
  g.character.hp = 10;
  const reopened = game.ensureGameStateCharacterModel(
    JSON.parse(JSON.stringify(g)),
  );
  assert.equal(reopened.cyberpunk.hp, 10);
  assert.equal(reopened.character.hp, 10);
  const reset = game.restartCampaignFromSnapshot(reopened);
  assert.equal(reset.cyberpunk.hp, 40);
  assert.equal(reset.character.hp, 40);
  assert.equal(reset.cyberpunk.era, 2077);
});
test("geographic memory records the campaign minute, place and NPC/quest links", () => {
  const g = campaign(),
    r = gm.executeCyberTool(g, "remember", {
      title: "Encontro",
      text: "Um trabalho.",
      npcIds: ["n"],
      questIds: ["q"],
    }),
    e = r.state.cyberpunk.cityEvents.at(-1);
  assert.equal(e.placeId, g.cyberpunk.locationId);
  assert.equal(e.campaignMinute, 0);
  assert.deepEqual(e.npcIds, ["n"]);
  assert.throws(() =>
    gm.executeCyberTool(g, "remember", {
      title: "X",
      text: "X",
      placeId: "fake",
    }),
  );
  assert.ok(rules.cyberDate(2077, 60).includes("2077"));
});
test("retry after a network failure reuses tool receipts even if a repeated call gets a new id", async () => {
  let saved = campaign(),
    n = 0;
  const args = { resource: "eddies", amount: 100, reason: "Pagamento" };
  await assert.rejects(() =>
    gm.runCyberTurn(
      saved,
      "Receber",
      async () => {
        if (++n === 1)
          return {
            output: [
              {
                type: "function_call",
                call_id: "c1",
                name: "resource_change",
                arguments: JSON.stringify(args),
              },
            ],
          };
        throw Error("network");
      },
      "model",
      (s) => (saved = s),
    ),
  );
  assert.equal(saved.cyberpunk.eddies, 2650);
  let resumed = 0;
  const result = await gm.runCyberTurn(
    saved,
    "Receber",
    async (payload) => {
      assert.ok(JSON.stringify(payload.input).includes("function_call_output"));
      return ++resumed === 1
        ? {
            output: [
              {
                type: "function_call",
                call_id: "new-c1",
                name: "resource_change",
                arguments: JSON.stringify({
                  ...args,
                  reason: "Pagamento já confirmado",
                }),
              },
            ],
          }
        : { output_text: "Você recebe o pagamento." };
    },
    "model",
    (s) => (saved = s),
  );
  assert.equal(result.state.cyberpunk.eddies, 2650);
  assert.equal(result.state.cyberpunk.recovery, undefined);
});
test("the GM records a roll in the UI and cannot replace a pending roll", async () => {
  let saved = campaign();
  const result = await gm.runCyberTurn(
    saved,
    "Atirar",
    async () => ({
      output: [
        {
          type: "function_call",
          call_id: "r1",
          name: "request_roll",
          arguments: JSON.stringify({
            label: "Pistola",
            kind: "skill",
            skill: "Handgun",
            target: 15,
          }),
        },
      ],
    }),
    "model",
    (s) => (saved = s),
  );
  assert.equal(result.state.cyberpunk.pending.target, 15);
  assert.equal(
    result.state.cyberpunk.pending.modifier,
    saved.cyberpunk.stats.ref + (saved.cyberpunk.skills.Handgun ?? 0),
  );
  assert.throws(() =>
    gm.executeCyberTool(result.state, "request_roll", {
      label: "X",
      kind: "custom",
    }),
  );
});
test("reequipping armor does not repair ablation", () => {
  let s = campaign().cyberpunk;
  s = state.purchaseItem(
    s,
    cat.cyberCatalog.find((e) => e.name === "Light Armorjack (Body)"),
  );
  const id = s.inventory.at(-1).id;
  s = state.equipArmor(s, id);
  s = rules.applyCyberDamage(s, 15);
  assert.equal(s.armor.body, 10);
  s = state.equipArmor(s, id);
  assert.equal(s.armor.body, 10);
  assert.equal(s.inventory.find((i) => i.id === id).bodySp, 10);
});
test("reload consumes compatible ammo and a physical action, and firing respects action limits", () => {
  let g = campaign(2045),
    s = g.cyberpunk;
  const gun = cat.cyberCatalog.find(
      (e) => e.name === "Heavy Pistol" && e.type === "weapon",
    ),
    ammo = cat.cyberCatalog.find(
      (e) => e.name === "Heavy Pistol (Basic)" && e.type === "ammo",
    );
  s = state.purchaseItem(state.purchaseItem(s, gun), ammo);
  const w = s.inventory.find((i) => i.type === "weapon"),
    a = s.inventory.find((i) => i.type === "ammo");
  assert.equal(w.ammo, 0);
  assert.equal(a.qty, 10);
  s = state.reloadCyberWeapon(s, w.id, a.id);
  assert.equal(s.inventory.find((i) => i.id === w.id).ammo, 8);
  assert.equal(s.inventory.find((i) => i.id === a.id).qty, 2);
  g = state.withCyberState(g, s);
  assert.throws(() =>
    gm.executeCyberTool(g, "weapon_fire", {
      weaponId: w.id,
      target: 13,
      label: "Atirar",
    }),
  );
  g = gm.executeCyberTool(g, "next_turn", {}).state;
  g = gm.executeCyberTool(g, "weapon_fire", {
    weaponId: w.id,
    target: 13,
    label: "Atirar",
  }).state;
  assert.equal(g.cyberpunk.inventory.find((i) => i.id === w.id).ammo, 7);
  assert.equal(g.cyberpunk.net.meatAction, true);
});
test("restricted fashion credit cannot become cash or buy other expensive gear", () => {
  const d = {
    era: 2045,
    campaignName: "T",
    name: "T",
    tone: "",
    hook: "",
    stats: { ...rules.DEFAULT_STATS },
    skills: state.suggestedCyberSkills("Solo"),
    role: "Solo",
    history: "",
    nativeLanguage: "PT",
    items: [],
    neuroport: false,
  };
  const clothing = cat.cyberCatalog.find(
    (e) => e.type === "clothing" && cat.priceOf(e) > 0 && cat.priceOf(e) <= 800,
  );
  assert.equal(
    state.buildCyberCampaign({ ...d, items: [clothing.id] }).cyberpunk.eddies,
    2550,
  );
  const expensive = cat.cyberCatalog.find(
    (e) => e.type === "weapon" && cat.priceOf(e) > 3000,
  );
  assert.throws(() =>
    state.buildCyberCampaign({ ...d, items: [expensive.id] }),
  );
});
test("Jack Out consumes an action and ejection locks reconnection for 60 minutes", () => {
  let s = netState();
  s.net.targets[0].connected = true;
  s.net.actionsUsed = 3;
  assert.throws(() => hack.leaveNeuroport(s, "t", 0));
  s = hack.leaveNeuroport(s, "t", 5, true);
  assert.equal(s.net.targets[0].blockedUntil, 65);
  assert.throws(() => hack.requestHack(hack.nextCyberTurn(s), "t", "jack", 64));
  assert.doesNotThrow(() =>
    hack.requestHack(hack.nextCyberTurn(s), "t", "jack", 65),
  );
});
test("NPC damage is independent of the player and returns the updated NPC", () => {
  let g = campaign();
  g.npcs = [
    {
      id: "guard",
      name: "Guarda",
      role: "Segurança",
      relation: "hostile",
      location: "Northside",
      cyberpunk: {
        stats: { body: 6 },
        hp: 30,
        maxHp: 30,
        armor: { body: 7, head: 0 },
        injuries: [],
      },
    },
  ];
  const r = gm.executeCyberTool(g, "npc_damage", { npcId: "guard", raw: 12 });
  assert.equal(r.state.npcs[0].cyberpunk.hp, 25);
  assert.equal(r.state.npcs[0].cyberpunk.armor.body, 6);
  assert.equal(r.state.cyberpunk.hp, 40);
  assert.equal(r.result.npc.cyberpunk.hp, 25);
});
test("Edgerunners images restore the original die labels after a renderer error", async () => {
  const { withEdgerunnersFaces } = await import(
      "../lib/cyberpunk/diceFaces.ts"
    ),
    old = global.Image;
  global.Image = class {
    set src(v) {
      this.source = v;
      queueMicrotask(() => this.onload());
    }
  };
  const presets = {
      d6: { font: "Arial", labels: ["", "", 1, 2, 3, 4, 5, 6] },
      d10: { font: "Arial", labels: ["", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
    },
    f = { get: (n) => presets[n], materials_cache: { old: true } },
    original = presets.d6.labels;
  try {
    await assert.rejects(() =>
      withEdgerunnersFaces(f, async () => {
        assert.notEqual(presets.d6.labels, original);
        assert.equal(presets.d6.labels.length, 8);
        throw Error("WebGL failure");
      }),
    );
    assert.equal(presets.d6.labels, original);
    assert.equal(presets.d10.labels.at(-1), 10);
  } finally {
    global.Image = old;
  }
});
test("3D sign handling subtracts only skill implosions, not free or Humanity dice", async () => {
  const { visualCyberRoll } = await import("../lib/cyberpunk/diceFaces.ts");
  for (const [kind, total, signed] of [
    ["skill", 9, -2],
    ["custom", 13, 2],
    ["humanity", 13, 2],
  ]) {
    const r = visualCyberRoll({
      id: "r",
      kind,
      label: "R",
      dice: [1, 2],
      sides: 6,
      modifier: 10,
      total,
      campaignMinute: 0,
    });
    assert.equal(r.dice[1].signedValue, signed);
    assert.equal(r.diceTotal + r.modifier, total);
    assert.deepEqual(
      r.dice.map((d) => d.value),
      [1, 2],
    );
  }
});

test("role presets distribute exactly 62 points with role-specific priorities", async () => {
  const creation = await import("../lib/cyberpunk/creation.ts");
  for (const role of cat.roles) {
    const stats = creation.suggestedCyberStats(role.name);
    assert.equal(
      Object.values(stats).reduce((a, b) => a + b, 0),
      62,
    );
    assert.ok(Object.values(stats).every((v) => v >= 2 && v <= 8));
  }
  assert.equal(creation.suggestedCyberStats("Netrunner").int, 8);
  assert.equal(creation.suggestedCyberStats("Solo").ref, 8);
  assert.equal(creation.suggestedCyberStats("Tech").tech, 8);
});

test("starter suggestions for every role and era fit one budget and install compatibly", async () => {
  const creation = await import("../lib/cyberpunk/creation.ts");
  for (const era of [2045, 2077])
    for (const role of cat.roles) {
      const items = [
        ...creation.suggestedCyberEquipment(role.name, era),
        ...creation.suggestedCyberware(role.name, era, true),
      ];
      const cp = state.previewCyberCreation({
        era,
        stats: creation.suggestedCyberStats(role.name),
        role: role.name,
        skills: state.suggestedCyberSkills(role.name),
        items: items.map((e) => e.id),
        neuroport: true,
      });
      assert.ok(cp.eddies >= 0);
      assert.ok(
        cp.inventory
          .filter((i) => i.type === "cyberware")
          .every((i) => i.installed),
      );
      assert.ok(cp.humanity >= 0 && cp.humanity <= cp.maxHumanity);
      if (role.name === "Netrunner" && era === 2077) {
        assert.ok(
          cp.inventory.some(
            (i) => i.name === "Neuroport Cyberdeck Port" && i.installed,
          ),
        );
        assert.ok(cp.inventory.some((i) => i.type === "cyberdeck"));
      }
    }
});

test("creation rejects unaffordable or baseless cyberware and preserves portrait and quickhack favorites", () => {
  const e = (name) => cat.cyberCatalog.find((e) => e.name === name);
  assert.throws(
    () =>
      state.previewCyberCreation({
        era: 2045,
        stats: rules.DEFAULT_STATS,
        role: "Solo",
        skills: {},
        items: [e("Sandevistan").id],
        neuroport: false,
      }),
    /base/i,
  );
  assert.throws(
    () =>
      state.previewCyberCreation({
        era: 2045,
        stats: rules.DEFAULT_STATS,
        role: "Solo",
        skills: {},
        items: [e("Linear Frame β (Beta)").id],
        neuroport: false,
      }),
    /insuficientes/i,
  );
  const g = state.buildCyberCampaign({
    era: 2077,
    campaignName: "Portrait",
    name: "V",
    tone: "Noir",
    hook: "",
    role: "Netrunner",
    stats: rules.DEFAULT_STATS,
    skills: state.suggestedCyberSkills("Netrunner"),
    items: [],
    nativeLanguage: "Português",
    history: "Texto editável",
    neuroport: true,
    image: "data:image/jpeg;base64,YQ==",
    appearance: "Cabelo azul",
    preferredQuickhacks: ["short", "sonic"],
  });
  assert.equal(g.character.image, "data:image/jpeg;base64,YQ==");
  assert.equal(g.character.appearance, "Cabelo azul");
  assert.deepEqual(g.cyberpunk.preferredQuickhacks, ["short", "sonic"]);
});

test("map zoom anchors the cursor and zoomed placement inverts the transform", async () => {
  const map = await import("../lib/cyberpunk/mapGeometry.ts");
  const old = { x: -100, y: -200, scale: 4 },
    anchor = { x: 180, y: 240 };
  const next = map.zoomAt(old, anchor, 8);
  assert.deepEqual(map.mapPoint(anchor, old), map.mapPoint(anchor, next));
  assert.deepEqual(
    map.mapPoint({ x: 300, y: 400 }, { x: -100, y: -200, scale: 4 }),
    { x: 100, y: 150 },
  );
});

test("existing campaign places survive POI additions and every detailed pin has finite coordinates", async () => {
  const places = await import("../lib/cyberpunk/places.ts");
  const custom = {
    id: "my-home",
    name: "Casa",
    x: 22,
    y: 33,
    district: "Kabuki",
    address: "Campanha",
    era: 2077,
    precision: "custom",
  };
  const merged = places.mergeNightCityPlaces([custom], 2077);
  assert.deepEqual(
    merged.find((p) => p.id === "my-home"),
    custom,
  );
  assert.equal(new Set(merged.map((p) => p.id)).size, merged.length);
  assert.ok(merged.some((p) => p.name.includes("Viktor")));
  assert.ok(
    merged
      .filter((p) => p.streetPosition)
      .every((p) =>
        [p.streetPosition.x, p.streetPosition.y].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 100,
        ),
      ),
  );
  assert.equal(places.mergeNightCityPlaces(merged, 2077).length, merged.length);
  assert.ok(places.defaultNightCityPlaces(2045).every((p) => p.era === 2045));
});

test("adult Neuroport suggestions install once and restart retains the compressed portrait", async () => {
  const creation = await import("../lib/cyberpunk/creation.ts");
  const items = [
    ...creation.suggestedCyberEquipment("Netrunner", 2077),
    ...creation.suggestedCyberware("Netrunner", 2077, false),
  ].map((e) => e.id);
  const g = state.buildCyberCampaign({
    era: 2077,
    campaignName: "Adult",
    name: "Merc",
    tone: "Noir",
    hook: "",
    stats: creation.suggestedCyberStats("Netrunner"),
    skills: state.suggestedCyberSkills("Netrunner"),
    role: "Netrunner",
    items,
    neuroport: false,
    history: "",
    nativeLanguage: "Português",
    image: "data:image/jpeg;base64,YQ==",
  });
  assert.ok(
    g.cyberpunk.inventory.some((i) => i.name === "Neuroport" && i.installed),
  );
  assert.ok(!g.cyberpunk.inventory.some((i) => i.name === "Neuroport (Free)"));
  assert.ok(g.cyberpunk.humanity < g.cyberpunk.stats.emp * 10);
  g.campaign.restartSnapshot = game.createCampaignRestartSnapshot(g);
  assert.equal(g.campaign.restartSnapshot.character.image, undefined);
  const reopened = game.ensureGameStateCharacterModel(
    JSON.parse(JSON.stringify(g)),
  );
  assert.equal(
    game.restartCampaignFromSnapshot(reopened).character.image,
    g.character.image,
  );
});

test("Cyberpunk normalization is identity-stable after adding new default locations", () => {
  const g = campaign();
  assert.equal(game.ensureGameStateCharacterModel(g), g);
  const legacy = {
    ...g,
    cyberpunk: {
      ...g.cyberpunk,
      places: g.cyberpunk.places.filter((p) => !p.id.includes("-poi-")),
    },
  };
  const normalized = game.ensureGameStateCharacterModel(legacy);
  assert.notEqual(normalized, legacy);
  assert.equal(game.ensureGameStateCharacterModel(normalized), normalized);
});
