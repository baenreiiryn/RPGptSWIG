import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
const mod = await import("../lib/edgerunnersDice.ts");
function factory(labels) {
  return {
    get: (type) => ({ labels: labels[type], values: [1, 2, 3] }),
    materials_cache: {},
  };
}
function installImages(fail = () => false) {
  const old = global.Image;
  const requested = [];
  global.Image = class {
    set src(v) {
      this.srcValue = v;
      requested.push(v);
      queueMicrotask(() => (fail(v) ? this.onerror() : this.onload()));
    }
  };
  return { requested, restore: () => (global.Image = old) };
}
test("archive artwork exists for all eight supported dice", () => {
  for (const sides of mod.EDGERUNNERS_DICE)
    for (let face = 1; face <= (sides === 100 ? 10 : sides); face++) {
      const value = sides === 100 ? face * 10 : face;
      assert.ok(
        fs.existsSync(
          "public/cyberpunk/dice/d" + sides + "-" + value + ".webp",
        ),
      );
    }
});
test("d4 vertex labels and percentile zero use their original topology and archive images", async () => {
  const images = installImages();
  const d4 = { labels: [[[], [0, 0, 0], ["2", "4", "3"], ["1", "3", "4"]]] },
    d100 = {
      labels: ["", "10", "20", "30", "40", "50", "60", "70", "80", "90", "00"],
      values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    };
  const d10 = {
    labels: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  };
  const original4 = d4.labels,
    original100 = d100.labels,
    values = d100.values;
  const f = { get: (t) => ({ d4, d10, d100 })[t], materials_cache: {} };
  try {
    await mod.rollWithDiceFaceTexture(
      f,
      "edgerunners",
      "1d4+1d100@3,7",
      async () => {
        assert.deepEqual(d4.labels[0][1], [0, 0, 0]);
        assert.ok(d4.labels[0][2][1].srcValue.endsWith("d4-4.webp"));
        assert.ok(d100.labels.at(-1).srcValue.endsWith("d100-100.webp"));
        assert.equal(d100.values, values);
        assert.ok(d10.labels.at(-1).srcValue.endsWith("d10-10.webp"));
      },
    );
    assert.equal(d4.labels, original4);
    assert.equal(d100.labels, original100);
  } finally {
    images.restore();
  }
});
test("failed image loads do not change the factory and can be retried", async () => {
  let fail = true;
  const images = installImages(() => fail),
    p = { labels: ["", "", "1", "2", "3", "4", "5", "6", "7", "8"] },
    original = p.labels;
  const f = { get: () => p, materials_cache: {} };
  try {
    await assert.rejects(
      () =>
        mod.rollWithDiceFaceTexture(f, "edgerunners", "1d8", async () =>
          assert.fail(),
        ),
      /carregar/i,
    );
    assert.equal(p.labels, original);
    fail = false;
    await mod.rollWithDiceFaceTexture(f, "edgerunners", "1d8", async () =>
      assert.notEqual(p.labels, original),
    );
    assert.equal(p.labels, original);
  } finally {
    images.restore();
  }
});
test("standard roll waits for the same factory custom roll and inherits no image labels", async () => {
  const images = installImages(),
    p = { labels: ["", "", "1", "2", "3", "4", "5", "6"] },
    original = p.labels,
    f = { get: () => p, materials_cache: {} };
  let release;
  const order = [];
  try {
    const one = mod.rollWithDiceFaceTexture(
      f,
      "edgerunners",
      "1d6",
      async () => {
        order.push("custom");
        await new Promise((r) => (release = r));
      },
    );
    while (!release) await new Promise((r) => setTimeout(r, 1));
    const two = mod.rollWithDiceFaceTexture(f, "marble", "1d6", async () => {
      order.push("standard");
      assert.equal(p.labels, original);
    });
    release();
    await Promise.all([one, two]);
    assert.deepEqual(order, ["custom", "standard"]);
  } finally {
    images.restore();
  }
});
test("Cyberpunk honors explicit saved textures while retaining its default set without overrides", () => {
  assert.equal(mod.cyberpunkDiceAppearances().normal.texture, "edgerunners");
  assert.equal(
    mod.cyberpunkDiceAppearances({ normal: { texture: "marble" } }).normal
      .texture,
    "marble",
  );
});
