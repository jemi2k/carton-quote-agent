// Rule engine — R01..R11 plus the gross-margin floor.
//
// Every judgement that involves a threshold, a machine format, an MOQ or a
// tooling allocation is expressed here as a deterministic predicate. The LLM
// has no say over any of these.

import { PARAMS } from "./params";
import { matchedTier } from "./engine";
import type { Fields, Pricing, RuleResult } from "./types";

export const MANDATORY = ["D", "W", "H", "qty", "combo", "colors", "unit"] as const;

function num(fields: Fields, key: string): number | null {
  const v = fields[key]?.value;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function present(fields: Fields, key: string): boolean {
  const v = fields[key]?.value;
  return v !== null && v !== undefined && v !== "";
}

// N3 — completeness gate. Returns the rules that fire *before* pricing.
export function completenessRules(fields: Fields): {
  rules: RuleResult[];
  blocking: string[];
  estimable: boolean;
  clarification: string[];
} {
  const rules: RuleResult[] = [];
  const missing = MANDATORY.filter((k) => !present(fields, k));
  const clarification: string[] = [];

  if (missing.length > 0) {
    // R01 — mandatory fields missing
    const isCritical = missing.some((k) => ["D", "W", "H", "qty", "unit"].includes(k));
    const missingCombo = missing.includes("combo");
    const missingColors = missing.includes("colors");

    if (isCritical) {
      rules.push({
        code: "R01",
        name: "Mandatory field missing",
        action: "BLOCK",
        message: `Missing: ${missing.join(", ")}. No calculation without dimensions, quantity and unit.`,
      });
      clarification.push(`Please supply: ${missing.join(", ")}.`);
    }

    // R02 — board combination / grammage missing → default + follow-up
    if (missingCombo) {
      rules.push({
        code: "R02",
        name: "Paper combination missing",
        action: "ASK",
        message: `Assuming ${PARAMS.defaults.combo}; confirm the board combination to lock the price.`,
      });
      clarification.push("Board combination (e.g. 5BC175) is missing — we assumed 3B150.");
    }

    // R03 — colours missing → default 3 + flag
    if (missingColors) {
      rules.push({
        code: "R03",
        name: "Print colours missing",
        action: "ASK",
        message: `Defaulting to ${PARAMS.defaults.colors} colours; confirm to lock the price.`,
      });
      clarification.push(`Number of print colours is missing — we assumed ${PARAMS.defaults.colors}.`);
    }
  }

  // R08 — width > length (suspected D/W entry error)
  const d = num(fields, "D");
  const w = num(fields, "W");
  if (d != null && w != null && w > d) {
    rules.push({
      code: "R08",
      name: "Width exceeds length",
      action: "ASK",
      threshold: "W ≤ D",
      computed: `W=${w}, D=${d}`,
      message: "Width is larger than length. Confirm the L×W×H convention before pricing.",
    });
    clarification.push("Width (W) is larger than length (D) — please confirm the L×W×H convention.");
  }

  return {
    rules,
    blocking: missing.filter((k) => ["D", "W", "H", "qty", "unit"].includes(k)),
    estimable: true,
    clarification,
  };
}

// N5 — verification rules that run after pricing.
export function pricingRules(fields: Fields, pricing: Pricing): RuleResult[] {
  const rules: RuleResult[] = [];
  const qty = num(fields, "qty") ?? 0;
  const colors = num(fields, "colors") ?? 0;
  const method = (fields.method?.value as string) === "offset" ? "offset" : "flexo";
  const delivery = num(fields, "delivery_days");
  const tier = matchedTier(pricing, qty);

  // R04 — below minimum order quantity
  if (qty < PARAMS.moq) {
    rules.push({
      code: "R04",
      name: "Below minimum order",
      action: "BLOCK",
      threshold: `≥ ${PARAMS.moq} pcs`,
      computed: `${qty} pcs`,
      message: "Order below MOQ — recommend merging orders or a different die.",
    });
  } else {
    rules.push({ code: "R04", name: "Minimum order quantity", action: "PASS", threshold: `≥ ${PARAMS.moq}`, computed: `${qty}` });
  }

  // R05 — print method exceeds colour capability
  const cap = PARAMS.maxColors[method];
  if (colors > cap) {
    rules.push({
      code: "R05",
      name: "Colour count exceeds capability",
      action: "BLOCK",
      threshold: `${method} ≤ ${cap} colours`,
      computed: `${colors} colours (${method})`,
      message: `Recommend the other process (${method === "flexo" ? "offset" : "flexo"}).`,
    });
  } else {
    rules.push({ code: "R05", name: "Colour capability", action: "PASS", threshold: `${method} ≤ ${cap}`, computed: `${colors} colours` });
  }

  // R06 / R07 — machine format
  const lenMm = pricing.blankLengthMm;
  if (lenMm > PARAMS.maxBlankLength) {
    rules.push({
      code: "R06",
      name: "Blank length exceeds machine",
      action: "BLOCK",
      threshold: `≤ ${PARAMS.maxBlankLength} mm`,
      computed: `${lenMm.toFixed(0)} mm`,
      message: "Needs imposition or another machine.",
    });
  } else {
    rules.push({ code: "R06", name: "Blank length", action: "PASS", threshold: `≤ ${PARAMS.maxBlankLength} mm`, computed: `${lenMm.toFixed(0)} mm` });
  }

  const widMm = pricing.blankWidthMm;
  if (widMm > PARAMS.maxBlankWidth) {
    rules.push({
      code: "R07",
      name: "Blank width exceeds machine",
      action: "BLOCK",
      threshold: `≤ ${PARAMS.maxBlankWidth} mm`,
      computed: `${widMm.toFixed(0)} mm`,
      message: "Needs imposition or another machine.",
    });
  } else {
    rules.push({ code: "R07", name: "Blank width", action: "PASS", threshold: `≤ ${PARAMS.maxBlankWidth} mm`, computed: `${widMm.toFixed(0)} mm` });
  }

  // R09 — tooling share of the unit price
  const toolingLine = tier.lines.find((l) => l.key === "tooling")!;
  const toolingShare = tier.unitPrice > 0 ? toolingLine.value / tier.unitPrice : 0;
  const sharePct = (toolingShare * 100).toFixed(1);
  if (toolingShare > PARAMS.toolingShareMax) {
    rules.push({
      code: "R09",
      name: "Tooling share too high",
      action: "WARN",
      threshold: `≤ ${(PARAMS.toolingShareMax * 100).toFixed(0)}% of unit price`,
      computed: `${sharePct}% (${toolingLine.value.toFixed(2)} ÷ ${tier.unitPrice.toFixed(2)})`,
      message: "Routed to human approval (sales manager).",
    });
  } else {
    rules.push({ code: "R09", name: "Tooling share", action: "PASS", threshold: `≤ ${(PARAMS.toolingShareMax * 100).toFixed(0)}%`, computed: `${sharePct}%` });
  }

  // R10 — deviation from historic price (no synthetic history in the demo)
  rules.push({
    code: "R10",
    name: "Historic price deviation",
    action: "PASS",
    threshold: `≤ ${(PARAMS.historicDeviationMax * 100).toFixed(0)}%`,
    computed: "no baseline",
    message: "No historic transaction price for this customer — skipped.",
  });

  // R11 — lead time shorter than standard cycle
  if (delivery != null && delivery < PARAMS.standardLeadTime) {
    rules.push({
      code: "R11",
      name: "Lead time shorter than cycle",
      action: "HUMAN",
      threshold: `≥ ${PARAMS.standardLeadTime} days`,
      computed: `${delivery} days`,
      message: "Production scheduling confirmation required.",
    });
  } else {
    rules.push({
      code: "R11",
      name: "Lead time",
      action: "PASS",
      threshold: `≥ ${PARAMS.standardLeadTime} days`,
      computed: delivery != null ? `${delivery} days` : "not stated",
    });
  }

  // Gross-margin floor (separate from R09/R10)
  if (PARAMS.targetMargin < PARAMS.approvalMarginFloor) {
    rules.push({
      code: "GM",
      name: "Gross margin below floor",
      action: "WARN",
      threshold: `≥ ${(PARAMS.approvalMarginFloor * 100).toFixed(0)}%`,
      computed: `${(PARAMS.targetMargin * 100).toFixed(0)}%`,
      message: "Finance approval required.",
    });
  }

  return rules;
}

// Combine rules into an approval route string.
export function approvalRoute(fields: Fields, rules: RuleResult[]): string | null {
  const reasons: string[] = [];
  if (rules.some((r) => r.code === "R09" && r.action === "WARN")) reasons.push("tooling share > 15% (sales manager)");
  if (rules.some((r) => r.code === "R11" && r.action === "HUMAN")) reasons.push("lead time < 7 days (production scheduling)");
  if (rules.some((r) => r.code === "GM" && r.action === "WARN")) reasons.push("gross margin < 8% (finance)");
  if (rules.some((r) => r.code === "R10" && r.action === "WARN")) reasons.push("historic deviation > 10% (account manager)");
  return reasons.length ? reasons.join(" · ") : null;
}
