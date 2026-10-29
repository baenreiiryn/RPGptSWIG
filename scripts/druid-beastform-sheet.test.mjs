import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import * as rules from "../lib/daggerheartCharacter.ts";

const entries = JSON.parse(fs.readFileSync(new URL("../lib/compendium/daggerheart.generated.json", import.meta.url), "utf8")).entries;
const druid = (level, tier = 4) => ({
  level, tier, daggerheart: {class:{id:"core-class-druid",name:"Druida"},classFeatures:[]},
});

test("a druid's sheet includes all forms up to the tier unlocked by level", () => {
  for (const [level, tier, count] of [[1,1,6],[2,2,12],[4,2,12],[5,3,18],[7,3,18],[8,4,24],[10,4,24]]) {
    const forms = rules.availableBeastformsForCharacter(druid(level), entries);
    assert.equal(forms.length, count, "Level " + level);
    assert.equal(Math.max(...forms.map(form => form.beastformTier)), tier);
    assert.ok(forms.some(form => form.sourceId === "Agile Scout"));
    assert.ok(forms.every(form => form.type === "beastform" && form.art && form.description));
  }
});

test("the list updates after level changes even if the saved tier is stale", () => {
  const character = druid(1,1);
  assert.equal(rules.availableBeastformsForCharacter(character,entries).length,6);
  character.level=8;
  assert.equal(rules.availableBeastformsForCharacter(character,entries).length,24);
  character.level=1;character.tier=4;
  assert.equal(rules.availableBeastformsForCharacter(character,entries).length,6);
});

test("only druids or characters granted Beastform receive the form sheet", () => {
  assert.equal(rules.canUseBeastform(druid(1)),true);
  assert.equal(rules.canUseBeastform({level:1}),false);
  const ranger={level:5,daggerheart:{class:{id:"core-class-ranger",name:"Patrulheiro"},classFeatures:[]}};
  assert.equal(rules.canUseBeastform(ranger),false);
  assert.deepEqual(rules.availableBeastformsForCharacter(ranger,entries),[]);
  ranger.daggerheart.classFeatures=[{id:"core-classFeature-beastform",name:"Forma de Fera"}];
  assert.equal(rules.canUseBeastform(ranger),true);
  assert.equal(rules.availableBeastformsForCharacter(ranger,entries).length,18);
});

test("legacy druid names work and inspecting the list never transforms the character", () => {
  for (const id of ["Druid","Druida","core-class-druid"]) {
    const character={...druid(2),daggerheart:{class:{id,name:id},classFeatures:[]}};
    const before=structuredClone(character);
    const forms=rules.availableBeastformsForCharacter(character,entries);
    assert.equal(forms.length,12);
    assert.deepEqual(character,before);
    assert.equal(forms[0].beastformTier,1);
    assert.equal(forms.at(-1).beastformTier,2);
  }
});
