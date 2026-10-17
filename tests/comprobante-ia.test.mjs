import assert from "node:assert/strict";
import { after, beforeEach, mock, test } from "node:test";
import { GoogleGenAI } from "@google/genai";
import { extraerConIA } from "../src/lib/comprobante-ia.ts";

// Mock the SDK boundary, not the extractor: assertions inspect its real request.
const interactions = new GoogleGenAI({ apiKey: "test-only" }).interactions;
const create = mock.method(Object.getPrototypeOf(interactions), "create");
const originalApiKey = process.env.GEMINI_API_KEY;
const file = { bytes: new ArrayBuffer(4), tipo: "image/jpeg" };

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-only";
  create.mock.resetCalls();
  create.mock.mockImplementation(async () => ({ output_text: "{}" }));
});

after(() => {
  mock.restoreAll();
  if (originalApiKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalApiKey;
});

function respondWith(fields) {
  create.mock.mockImplementation(async () => ({ output_text: JSON.stringify(fields) }));
}

test("the actual Gemini request requires both amount fields and permits null", async () => {
  await extraerConIA(file);
  assert.equal(create.mock.callCount(), 1);
  const [request] = create.mock.calls[0].arguments;
  const schema = request.response_format.schema;
  assert.deepEqual(schema.required, ["monto_texto", "monto"]);
  assert.deepEqual(schema.properties.monto_texto.type, ["string", "null"]);
  assert.deepEqual(schema.properties.monto.type, ["number", "null"]);
});

test("the prompt abstains per field without discarding legible data", async () => {
  await extraerConIA(file);
  const [request] = create.mock.calls[0].arguments;
  assert.match(request.system_instruction, /monto_texto y monto[^\n]*null/);
  assert.match(request.system_instruction, /Conserva los datos que si sean legibles/);
  assert.doesNotMatch(request.system_instruction, /borrosa, cortada[^\n]*todos los campos vacios/);
});

test("a readable Bs. 6.400,00 receipt normalizes to 6400", async () => {
  respondWith({ monto_texto: "Bs. 6.400,00", monto: 6400, moneda: "VES" });
  const result = await extraerConIA(file);
  assert.equal(result.ok, true);
  assert.equal(result.datos.monto, 6400);
  assert.equal(result.datos.monto_texto, "Bs. 6.400,00");
  assert.deepEqual(result.datos.avisos, []);
});

for (const reason of ["absent", "unreadable"]) {
  test(`an ${reason} amount returned as null stays unknown`, async () => {
    respondWith({ monto_texto: null, monto: null, referencia: "TEST-REFERENCE" });
    const result = await extraerConIA(file);
    assert.equal(result.ok, true);
    assert.equal(result.datos.monto, null);
    assert.equal(result.datos.monto_texto, null);
    assert.equal(result.datos.referencia, "TEST-REFERENCE");
    assert.deepEqual(result.datos.avisos, ["No pudimos leer el monto. Cargalo a mano."]);
  });
}

test("legacy responses omitting amount fields remain compatible and unknown", async () => {
  respondWith({});
  const result = await extraerConIA(file);
  assert.equal(result.ok, true);
  assert.equal(result.datos.monto, null);
  assert.equal(result.datos.monto_texto, null);
  assert.deepEqual(result.datos.avisos, ["No pudimos leer el monto. Cargalo a mano."]);
});

test("numeric fallback remains compatible when the text amount is null or omitted", async () => {
  for (const fields of [{ monto_texto: null, monto: 6400 }, { monto: 6400 }]) {
    respondWith(fields);
    const result = await extraerConIA(file);
    assert.equal(result.ok, true);
    assert.equal(result.datos.monto, 6400);
    assert.equal(result.datos.monto_texto, null);
    assert.deepEqual(result.datos.avisos, []);
  }
});
