import assert from "node:assert/strict";
import test from "node:test";
import {registerHooks} from "node:module";
registerHooks({resolve(s,c,next){if(s.startsWith("./") && !/\.[a-z0-9]+$/i.test(s))return next(s+".ts",c);return next(s,c);}});

const appearanceHelpers = await import("../lib/diceBoxAppearance.ts");

function mockTarget() {
  const presets = new Map();
  return {
    presets,
    target: {
      DiceFactory: {
        materials_cache: { old: true },
        get(type) {
          if (!presets.has(type)) presets.set(type, { font: "Arial" });
          return presets.get(type);
        },
      },
      theme_customColorset: null,
      async loadTheme(config) {
        this.loadedTheme = config;
      },
    },
  };
}

const APPEARANCE = {
  name: "Teste",
  foreground: "#ffffff",
  background: "#241535",
  outline: "#000000",
  edge: "#111111",
  texture: "marble",
  material: "glass",
  surface: "green-felt",
  font: "Georgia",
  preset: "standard",
};

test("3D appearance applies selected number font to every supported die", () => {
  const { target, presets } = mockTarget();
  appearanceHelpers.applyDiceBoxFont(target, "Trebuchet MS");
  for (const type of ["d2", "d4", "d6", "d8", "d10", "d12", "d20", "d100", "dpip", "dpoker", "dspanpoker", "dsuit"]) {
    assert.equal(presets.get(type)?.font, "Trebuchet MS");
  }
  assert.deepEqual(target.DiceFactory.materials_cache, {});
});

test("3D appearance forwards texture and material to the engine theme", async () => {
  const { target } = mockTarget();
  await appearanceHelpers.applyDiceBoxAppearance(target, APPEARANCE, "test");
  assert.equal(target.theme_customColorset.texture, "marble");
  assert.equal(target.theme_customColorset.material, "glass");
  assert.deepEqual(target.loadedTheme, {
    colorset: "white",
    texture: "marble",
    material: "glass",
  });
});

test("plastic UI material maps to the engine's plastic/none material", async () => {
  const { target } = mockTarget();
  await appearanceHelpers.applyDiceBoxAppearance(target, { ...APPEARANCE, material: "plastic" }, "test");
  assert.equal(target.theme_customColorset.material, "none");
  assert.equal(target.loadedTheme.material, "none");
});

test('Edgerunners face artwork uses the engine neutral texture instead of an unknown vendor id', async()=>{
 const {target}=mockTarget();
 await appearanceHelpers.applyDiceBoxAppearance(target,{...APPEARANCE,texture:'edgerunners'});
 assert.equal(target.loadedTheme.texture,'none');
 assert.equal(target.theme_customColorset.texture,'none');
});
