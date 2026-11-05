import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("./") && !specifier.match(/\.[a-z0-9]+$/i)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        return nextResolve(specifier, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const catalog = await import("../lib/diceAppearanceCatalog.ts");
const dice = await import("../lib/dice.ts");

test("appearance catalog exposes dice-box-threejs compatible engine choices", () => {
  assert.ok(catalog.DICE_TEXTURES.some((entry) => entry.id === "none"));
  assert.ok(catalog.DICE_TEXTURES.some((entry) => entry.id === "astral"));
  assert.ok(catalog.DICE_TEXTURES.some((entry) => entry.id === "stainedglass"));
  assert.deepEqual(
    catalog.DICE_MATERIALS.map((entry) => entry.id),
    ["none", "plastic", "perfectmetal", "metal", "wood", "glass"],
  );
  assert.deepEqual(
    catalog.DICE_SURFACES.map((entry) => entry.id),
    ["default", "blue-felt", "red-felt", "green-felt", "taverntable", "mahogany", "stainless", "cyberpunk", "cagetown"],
  );
});

test("every texture in the catalog has the static asset required by the 3D engine", () => {
  const assetName = (id) => {
    if (id === "none") return null;
    if (id === "cloudy") return "cloudy.webp";
    if (id === "cloudy_2") return "cloudy.alt.webp";
    if (id === "glitter_2") return "glitter-alpha.webp";
    if (id === "bird") return "feather.webp";
    return id + ".webp";
  };
  for (const texture of catalog.DICE_TEXTURES) {
    const asset = assetName(texture.id);
    if(texture.previewAsset){assert.ok(fs.existsSync(path.join(process.cwd(),"public",texture.previewAsset)));continue;}
    if (!asset) continue;
    assert.ok(
      fs.existsSync(path.join(process.cwd(), "public", "textures", asset)),
      "missing texture asset " + asset + " for " + texture.id,
    );
  }
});

test("face preset catalog stays limited to value-preserving built-in dice faces", () => {
  assert.deepEqual(
    catalog.DICE_FACE_PRESETS.map((preset) => preset.id),
    ["standard", "pips", "poker", "spanish-poker", "suits"],
  );
  assert.ok(catalog.DICE_FACE_PRESETS.find((preset) => preset.id === "pips").compatibleWith.includes("d6"));
});

test("font catalog maps preview font choices to supported system fonts for the 3D engine", () => {
  assert.equal(catalog.DICE_ENGINE_SUPPORTS_CUSTOM_NUMBER_FONT, true);
  assert.ok(catalog.DICE_FONTS.length >= 4);
  const allowedEngineFonts = new Set(["Georgia", "Times New Roman", "Arial", "Trebuchet MS", "monospace"]);
  for (const font of catalog.DICE_FONTS) {
    assert.equal(typeof font.cssFamily, "string");
    assert.ok(font.cssFamily.length > 0);
    assert.equal(font.engineSupported, true);
    assert.ok(allowedEngineFonts.has(font.engineFont));
    assert.equal(catalog.getDiceEngineFont(font.id), font.engineFont);
  }
});

test("mergedRoleAppearance composes defaults, preset role styling, and explicit overrides", () => {
  const merged = catalog.mergedRoleAppearance(
    "hope",
    { foreground: "#abcdef", surface: "stainless" },
    "astral",
  );

  assert.equal(merged.name, dice.DEFAULT_DICE_APPEARANCES.hope.name);
  assert.equal(merged.texture, "astral");
  assert.equal(merged.material, "glass");
  assert.equal(merged.foreground, "#abcdef");
  assert.equal(merged.surface, "stainless");
});

test("applyPresetToRole updates only the selected role without mutating settings", () => {
  const source = structuredClone(dice.DEFAULT_DICE_APPEARANCES);
  const before = structuredClone(source);
  const next = catalog.applyPresetToRole(source, "fear", "blood-moon");

  assert.deepEqual(source, before);
  assert.deepEqual(next.normal, source.normal);
  assert.deepEqual(next.hope, source.hope);
  assert.equal(next.fear.name, source.fear.name);
  assert.equal(next.fear.texture, "marble");
  assert.equal(next.fear.material, "glass");
  assert.notDeepEqual(next.fear.background, source.fear.background);
});

test('Edgerunners can be selected as a saved texture or complete theme',()=>{
  assert.ok(catalog.DICE_TEXTURES.some(t=>t.id==='edgerunners'));
  const preset=catalog.getDiceThemePreset('edgerunners');assert.ok(preset);
  const chosen=catalog.applyPresetToRole({},'hope',preset);
  assert.equal(dice.resolveDiceAppearance('hope',JSON.parse(JSON.stringify(chosen))).texture,'edgerunners');
  assert.equal(chosen.normal.texture,'none');
});
