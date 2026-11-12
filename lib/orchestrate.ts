// Six-node orchestrator: N1 → N2 → N3 ─┬─ block/ask → clarification
//                                       └─ price → N5 → N6 → quote
// Every node records who ran it (model / rules / code) and how long it took.

import { computePricing, matchedTier, type PlainFields } from "./engine";
import { approvalRoute, completenessRules, pricingRules } from "./rules";
import { fallbackExtract, normalizeText } from "./extract";
import { deepseekConfigured, explainQuote, extractFields } from "./deepseek";
import { PARAMS, PARAMS_VERSION } from "./params";
import type { Explanation, Fields, NodeStatus, QuoteResult, RuleResult } from "./types";

const r2 = (x: number) => Math.round(x * 100) / 100;

const NODE_NAMES: Record<string, string> = {
  N1: "Intake & cleaning",
  N2: "Field extraction",
  N3: "Completeness check",
  N4: "Pricing engine",
  N5: "Rule verification",
  N6: "Quote & explanation",
};

function present(fields: Fields, key: string): boolean {
  const v = fields[key]?.value;
  return v !== null && v !== undefined && v !== "";
}

function toPlain(fields: Fields): PlainFields {
  const n = (k: string): number | undefined => {
    const v = fields[k]?.value;
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    return undefined;
  };
  const method = fields.method?.value === "offset" ? "offset" : "flexo";
  return {
    D: n("D"),
    W: n("W"),
    H: n("H"),
    qty: n("qty"),
    combo: typeof fields.combo?.value === "string" && fields.combo.value ? fields.combo.value : undefined,
    colors: n("colors"),
    method,
  };
}

// Light trace-back: every extracted number must be findable in the source text.
function traceBack(fields: Fields, text: string): string[] {
  const warnings: string[] = [];
  const cleaned = text.replace(/[,\s]/g, "");
  for (const key of ["D", "W", "H", "qty", "colors", "delivery_days"]) {
    const v = fields[key]?.value;
    if (typeof v === "number") {
      if (!cleaned.includes(String(v))) {
        fields[key].confidence = Math.min(fields[key].confidence, 0.4);
        warnings.push(`${key} (${v}) not found verbatim in the source — flagged unconfirmed.`);
      }
    }
  }
  return warnings;
}

function templateExplanation(fields: Fields, plain: PlainFields, unitPrice: number, unitVnd: number, t5Price: number, pricing: any): Explanation {
  const combo = plain.combo ?? "3B150";
  const colors = plain.colors ?? 3;
  const method = plain.method ?? "flexo";
  const qty = plain.qty ?? 0;
  const area = pricing.area.toFixed(4);
  const board = pricing.boardPrice.toFixed(3);
  const toolingLine = matchedTier(pricing, qty).lines.find((l: any) => l.key === "tooling");
  const tooling = toolingLine?.value.toFixed(2) ?? "0";
  return {
    customer: `At ${qty.toLocaleString()} pcs the unit price is ${unitPrice.toFixed(2)} CNY (≈${unitVnd.toLocaleString()} VND) ex-works, based on ${combo} board with ${colors}-colour ${method} printing. Price falls with volume — at 10,000 pcs it drops to ${t5Price.toFixed(2)} CNY.`,
    internal: `Blank area ${area} m² × board ${board} CNY/m². Tooling amortises to ${tooling} CNY/pc. Full cost priced at a ${(PARAMS.targetMargin * 100).toFixed(0)}% target margin.`,
    approval: "None",
  };
}

export async function orchestrate(rawText: string): Promise<QuoteResult> {
  const t0 = Date.now();
  const nodes: NodeStatus[] = [];
  const warnings: string[] = [];
  const mark = (id: string, status: NodeStatus["status"], note?: string) => {
    nodes.push({ id, name: NODE_NAMES[id], status, ms: Date.now() - t0, note });
  };

  const requestId = `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  // N1 — intake & cleaning
  const normalized = normalizeText(rawText);
  mark("N1", "done");

  // N2 — field extraction (model, with rule fallback)
  let fields: Fields;
  let mode: "model" | "rules-only" = "rules-only";
  let modelVersion: string | undefined;
  const useModel = deepseekConfigured();

  if (useModel) {
    try {
      fields = await extractFields(normalized);
      mode = "model";
      modelVersion = process.env.DEEPSEEK_MODEL || "deepseek-chat";
      warnings.push(...traceBack(fields, normalized));
      mark("N2", "done");
    } catch (e) {
      fields = fallbackExtract(rawText);
      mode = "rules-only";
      mark("N2", "error", "model failed — fell back to the rule parser");
    }
  } else {
    fields = fallbackExtract(rawText);
    mark("N2", "done", "rules-only (no DEEPSEEK_API_KEY set)");
  }

  // Normalise defaults that are not worth blocking on
  if (!present(fields, "unit")) fields.unit = { value: "mm", evidence: "assumed", confidence: 0.5 };
  if (!present(fields, "method")) fields.method = { value: "flexo", evidence: "default", confidence: 0.6 };

  // N3 — completeness gate
  const comp = completenessRules(fields);
  mark("N3", "done");

  const plain = toPlain(fields);
  const criticalMissing = ["D", "W", "H", "qty", "unit"].filter((k) => !present(fields, k));
  const comboMissing = !present(fields, "combo");
  const colorsMissing = !present(fields, "colors");

  const allRules: RuleResult[] = [...comp.rules];
  const clarification: string[] = [...comp.clarification];

  let pricing: QuoteResult["pricing"] = null;
  let range: QuoteResult["range"] = null;
  let explanation: Explanation | null = null;
  let route: string | null = null;

  const canPrice = criticalMissing.length === 0;

  if (canPrice) {
    // N4 — pricing (pure code). Use defaults for a range estimate if board/colours missing.
    const estCombo = plain.combo ?? PARAMS.defaults.combo;
    const estColors = plain.colors ?? PARAMS.defaults.colors;
    try {
      pricing = computePricing({ ...plain, combo: estCombo, colors: estColors });
      mark("N4", "done");
    } catch (e) {
      pricing = null;
      mark("N4", "error", e instanceof Error ? e.message : "pricing failed");
    }

    if (pricing) {
      // N5 — rule verification
      allRules.push(...pricingRules(fields, pricing));
      mark("N5", "done");

      const qty = plain.qty ?? 0;
      const tier = matchedTier(pricing, qty);
      route = approvalRoute(fields, allRules);

      // Magnitude sanity check (dimension misread guard)
      if (pricing.area < 0.05 || pricing.area > 3) {
        warnings.push(`Blank area ${pricing.area.toFixed(4)} m² is outside 0.05–3 m² — check dimensions.`);
      }

      // Range estimate when board/colours are missing but the case is estimable
      if (comboMissing || colorsMissing || allRules.some((r) => r.code === "R08" && r.action === "ASK")) {
        const base = tier.unitPrice;
        range = { base, low: r2(base * (1 - PARAMS.rangePct)), high: r2(base * (1 + PARAMS.rangePct)) };
      }

      // N6 — explanation (model, with template fallback)
      const t5 = pricing.tiers.find((t) => t.tier === "T5")?.unitPrice ?? tier.unitPrice;
      if (useModel && mode === "model") {
        try {
          const input = {
            fields: { D: plain.D, W: plain.W, H: plain.H, qty: plain.qty, combo: plain.combo ?? estCombo, colors: plain.colors ?? estColors, method: plain.method },
            tier: tier.tier,
            unitPrice: tier.unitPrice,
            unitPriceVnd: tier.unitPriceVnd,
            unitPriceAt10k: t5,
            area: pricing.area,
            boardPrice: pricing.boardPrice,
            fullCost: tier.unitCost,
            costLines: tier.lines.map((l) => ({ label: l.label, value: l.value })),
            firedRules: allRules.filter((r) => r.action !== "PASS").map((r) => ({ code: r.code, action: r.action, message: r.message })),
            approvalRoute: route ?? "None",
          };
          explanation = await explainQuote(input);
          if (!explanation.customer || !explanation.internal) throw new Error("empty explanation");
          mark("N6", "done");
        } catch {
          explanation = templateExplanation(fields, plain, tier.unitPrice, tier.unitPriceVnd, t5, pricing);
          mark("N6", "error", "model unavailable — used the numeric template");
        }
      } else {
        explanation = templateExplanation(fields, plain, tier.unitPrice, tier.unitPriceVnd, t5, pricing);
        mark("N6", "done", "template (rules-only)");
      }
    } else {
      mark("N5", "skipped");
      mark("N6", "skipped");
    }
  } else {
    mark("N4", "skipped");
    mark("N5", "skipped");
    mark("N6", "skipped");
    clarification.push(`Missing required fields: ${criticalMissing.join(", ")}.`);
  }

  // Final status
  const hasBlock = allRules.some((r) => r.action === "BLOCK");
  const hasWarnOrHuman = allRules.some((r) => r.action === "WARN" || r.action === "HUMAN");
  let status: QuoteResult["status"];
  if (hasBlock || !canPrice) status = "block";
  else if (range) status = "range";
  else if (hasWarnOrHuman) status = "quote";
  else status = "quote";

  return {
    requestId,
    status,
    mode,
    fields,
    pricing,
    rules: allRules,
    explanation,
    clarification: [...new Set(clarification)],
    range,
    approvalRoute: route,
    nodes,
    paramsVersion: PARAMS_VERSION,
    modelVersion,
    warnings,
  };
}
