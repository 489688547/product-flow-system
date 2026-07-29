import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const imageModule = await import("../src/state/productImage.js");

test("product image dimensions preserve aspect ratio within the 640px boundary", () => {
  assert.deepEqual(imageModule.productImageDimensions(1600, 800), { width: 640, height: 320 });
  assert.deepEqual(imageModule.productImageDimensions(400, 800), { width: 320, height: 640 });
  assert.deepEqual(imageModule.productImageDimensions(320, 240), { width: 320, height: 240 });
});

test("product image preparation keeps the highest quality candidate within the data limit", async () => {
  const canvasCalls = [];
  const candidates = new Map([
    [0.82, `data:image/webp;base64,${"a".repeat(150_000)}`],
    [0.68, `data:image/webp;base64,${"b".repeat(90_000)}`],
    [0.55, `data:image/webp;base64,${"c".repeat(60_000)}`]
  ]);
  const result = await imageModule.prepareProductImage({ type: "image/png" }, {
    readDataUrl: async () => `data:image/png;base64,${"z".repeat(200_000)}`,
    loadImage: async () => ({ naturalWidth: 1600, naturalHeight: 800 }),
    createCanvas: (width, height) => ({
      width,
      height,
      getContext() {
        return {
          fillStyle: "",
          fillRect() {},
          drawImage(_image, _x, _y, drawWidth, drawHeight) {
            canvasCalls.push({ drawWidth, drawHeight });
          }
        };
      },
      toDataURL(_type, quality) {
        return candidates.get(quality);
      }
    })
  });

  assert.equal(result, candidates.get(0.68));
  assert.deepEqual(canvasCalls, [{ drawWidth: 640, drawHeight: 320 }]);
});

test("demand and product image uploaders use the shared compressed image boundary", () => {
  for (const path of [
    "../src/features/demands/DemandModal.jsx",
    "../src/features/archive/ProductModal.jsx"
  ]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /prepareProductImage/);
    assert.doesNotMatch(source, /readAsDataURL/);
    assert.match(source, /role="alert"/);
  }
});
