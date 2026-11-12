// N1 intake/cleaning + the rule-based fallback extractor.
//
// The LLM is the primary extractor (see deepseek.ts); this module is the
// deterministic fallback so the whole pipeline still works offline with no
// API key. It targets the structured "dimensions / combo / colours / qty"
// format used by the demo samples.

import type { Fields, FieldMeta } from "./types";

function meta(value: FieldMeta["value"], evidence: string, confidence = 1): FieldMeta {
  return { value, evidence, confidence };
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const UNIT_FACTOR: Record<string, number> = { mm: 1, cm: 10, inch: 25.4, in: 25.4, '"': 25.4 };

function extractCombo(text: string): { value: string | null; evidence: string; assumed: boolean } {
  // Compact form: "3B150", "5BC175", "3E200", "3W250"
  const compact = text.match(/\b([35])\s*(BC|B|E|W)\s*(\d{3})\b/);
  if (compact) {
    return { value: compact[1] + compact[2] + compact[3], evidence: compact[0], assumed: false };
  }

  // Verbose form: "5-ply BC 175", "5-ply", "3 ply" — grammage anchored right
  // after the ply/flute so a dimension like "250 mm" is never mistaken for it.
  const verbose = text.match(/(\d)\s*-\s*ply\b\s*(?:(BC|B|E|W)\s*)?(\d{2,3})?/i);
  if (verbose) {
    const n = verbose[1];
    const flute = verbose[2];
    const gsm = verbose[3];
    if (flute && gsm) return { value: n + flute + gsm, evidence: verbose[0], assumed: false };
    if (flute && !gsm) return { value: n + flute + "175", evidence: verbose[0], assumed: true };
    if (!flute && gsm) return { value: n + (n === "5" ? "BC" : "B") + gsm, evidence: verbose[0], assumed: true };
    return { value: n === "5" ? "5BC175" : "3B150", evidence: verbose[0], assumed: true };
  }

  return { value: null, evidence: "", assumed: false };
}

function extractColors(text: string): { value: number | null; evidence: string } {
  const none = text.match(/\b(?:unprinted|no\s*print(?:ing)?|without\s*print)\b/i);
  if (none) return { value: 0, evidence: none[0] };
  const m = text.match(/(\d+)\s*[- ]?\s*(?:colou?rs?|colou?r)\b/i);
  if (m) return { value: Number(m[1]), evidence: m[0] };
  return { value: null, evidence: "" };
}

export function fallbackExtract(raw: string): Fields {
  const text = normalizeText(raw);
  const fields: Fields = {};

  // Dimensions D×W×H (with optional unit)
  const dim = text.match(
    /(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*(mm|cm|inch|in|")?/
  );

  if (dim) {
    const factor = UNIT_FACTOR[dim[4]?.toLowerCase() ?? "mm"] ?? 1;
    fields.D = meta(Number(dim[1]) * factor, dim[0]);
    fields.W = meta(Number(dim[2]) * factor, dim[0]);
    fields.H = meta(Number(dim[3]) * factor, dim[0]);
    fields.unit = meta("mm", dim[4] ?? "mm", 1);
  } else {
    // "length 200, width 300, height 250" style
    const l = text.match(/length\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const w = text.match(/width\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    const h = text.match(/height\s*[:=]?\s*(\d+(?:\.\d+)?)/i);
    if (l) fields.D = meta(Number(l[1]), l[0]);
    if (w) fields.W = meta(Number(w[1]), w[0]);
    if (h) fields.H = meta(Number(h[1]), h[0]);
    if (!h && (l || w)) fields.H = meta(null, "", 0);
    fields.unit = meta("mm", "assumed", 0.6);
  }

  // Quantity
  const q = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:pcs|pieces|boxes|box|units|unit|cartons)/i);
  if (q) fields.qty = meta(Number(q[1].replace(/,/g, "")), q[0]);

  // Board combination
  const combo = extractCombo(text);
  if (combo.value) fields.combo = meta(combo.value, combo.evidence, combo.assumed ? 0.6 : 1);
  else fields.combo = meta(null, "", 0);

  // Colours
  const colors = extractColors(text);
  fields.colors = meta(colors.value, colors.evidence, colors.value === null ? 0 : 1);

  // Print method
  if (/\boffset\b/i.test(text)) fields.method = meta("offset", "offset");
  else if (/\bflexo(graphic)?\b/i.test(text)) fields.method = meta("flexo", "flexo");

  // Delivery days
  const dd = text.match(/(?:within\s+|in\s+)?(\d+)\s*days?/i);
  if (dd) fields.delivery_days = meta(Number(dd[1]), dd[0]);

  // Free-text note
  fields.note = meta(text, text, 1);

  return fields;
}
