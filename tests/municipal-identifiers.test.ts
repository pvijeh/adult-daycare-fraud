import assert from "node:assert/strict";
import test from "node:test";

import {
  validateBbl,
  validateBin,
} from "../lib/municipal-identifiers.js";

test("accepts numeric BBL and BIN values with their expected lengths", () => {
  assert.equal(validateBbl(" 3064100004 "), "3064100004");
  assert.equal(validateBin("3167879"), "3167879");
});

test("rejects malformed municipal identifiers", () => {
  assert.equal(validateBbl("306410000"), null);
  assert.equal(validateBbl("3064100004' OR 1=1 --"), null);
  assert.equal(validateBbl("30641A0004"), null);
  assert.equal(validateBin("316787"), null);
  assert.equal(validateBin("3167879' OR 1=1 --"), null);
  assert.equal(validateBin("316A879"), null);
});
