import assert from "node:assert/strict";
import test from "node:test";

import { validateProductVersioningContract } from "./product_versioning.mjs";

test("current repository satisfies downstream automatic version contract", () => {
  const errors = [];
  validateProductVersioningContract(errors);
  assert.deepEqual(errors, [], errors.join("\n"));
});
