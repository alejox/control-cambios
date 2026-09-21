import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Bitwarden health route is server-only and does not expose secret values", () => {
  const source = fs.readFileSync("src/app/api/bitwarden/health/route.ts", "utf8");
  assert.match(source, /runtime = [\"']nodejs[\"']/);
  assert.match(source, /secretCount/);
  assert.doesNotMatch(source, /secret\.value|value:/);
});
