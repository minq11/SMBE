import assert from "node:assert/strict";
import { test } from "node:test";
import { viewportFrame } from "../src/components/shell/viewport-frame";

test("viewport frame: no keyboard, no pan", () => {
  assert.deepEqual(
    viewportFrame({ height: 844, offsetTop: 0, maxHeight: 844 }),
    { height: 844, top: 0, keyboard: false },
  );
});

test("viewport frame: address bar collapse is not a keyboard", () => {
  assert.equal(
    viewportFrame({ height: 760, offsetTop: 0, maxHeight: 844 }).keyboard,
    false,
  );
});

test("viewport frame: iOS keyboard pans the visible area → frame follows", () => {
  assert.deepEqual(
    viewportFrame({ height: 470.4, offsetTop: 245.2, maxHeight: 844 }),
    { height: 470, top: 245, keyboard: true },
  );
});

test("viewport frame: Android keyboard shrinks the document (no pan)", () => {
  assert.deepEqual(
    viewportFrame({ height: 470, offsetTop: 0, maxHeight: 844 }),
    { height: 470, top: 0, keyboard: true },
  );
});
