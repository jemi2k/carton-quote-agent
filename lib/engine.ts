// Deterministic pricing engine.
//
// This is the single source of truth for every number in a quote. It is a pure
// function: the same inputs always produce the same outputs, and it performs
// all arithmetic in code — the LLM never computes a price.

import { PAPER_PRICE, PARAMS, TIERS, tierForQty, type TierDef } from "./params";
import type { CostLine, Pricing, TierQuote } from "./types";

export interface Layer {
  name: string;
  gsm: number;
  type: "containerboard" | "fluting" | "white";
  pricePerKg: number; // CNY/kg
  factor: number; // take-up factor (fluting only)
}

export interface PlainFields {
  D?: number;
  W?: number;
  H?: number;
  qty?: number;
  combo?: string;
  colors?: number;
  method?: "flexo" | "offset";
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const ceil2 = (x: number) => Math.ceil(x * 100) / 100;

function kgPrice(type: string, gsm: number): number {
  const table = PAPER_PRICE[type];
  if (!table) throw new Error(`Unknown paper grade "${type}"`);
  const perTonne = table[gsm];
  if (perTonne == null) {
    throw new Error(`No price for ${type} ${gsm} g (available: ${Object.keys(table).join(", ")})`);
  }
  return perTonne / 1000; // CNY/kg
}

// Resolve a board combination like "5BC175", "3B150", "3E200", "3W250" into
// the actual ply stack. Fluting grammage and take-up factors come from params.
export function resolveCombo(combo: string): { plyCount: 3 | 5; layers: Layer[] } {
  const m = combo.trim().match(/^(\d)\s*([A-Za-z]+)\s*(\d+)$/);
  if (!m) throw new Error(`Unrecognised board combination "${combo}"`);

  const plyCount = parseInt(m[1], 10) as 3 | 5;
  const flute = m[2].toUpperCase();
  const gsm = parseInt(m[3], 10);
  const isWhite = flute.includes("W");
  const fGsm = PARAMS.flutingGsm;

  const layer = (
    name: string,
    type: Layer["type"],
    gram: number,
    factor: number
  ): Layer => ({ name, gsm: gram, type, pricePerKg: kgPrice(type, gram), factor });

  if (plyCount === 5) {
    const face = isWhite
      ? layer("face", "white", gsm, 1)
      : layer("face", "containerboard", gsm, 1);
    return {
      plyCount,
      layers: [
        face,
        layer("flute-1", "fluting", fGsm, PARAMS.flutingFactor.first),
        layer("mid", "containerboard", gsm, 1),
        layer("flute-2", "fluting", fGsm, PARAMS.flutingFactor.second),
        layer("liner", "containerboard", gsm, 1),
      ],
    };
  }

  if (plyCount === 3) {
    const face = isWhite
      ? layer("face", "white", gsm, 1)
      : layer("face", "containerboard", gsm, 1);
    const liner = isWhite
      ? layer("liner", "white", gsm, 1)
      : layer("liner", "containerboard", gsm, 1);
    return {
      plyCount,
      layers: [face, layer("flute", "fluting", fGsm, PARAMS.flutingFactor.single), liner],
    };
  }

  throw new Error(`Unsupported ply count ${plyCount} (only 3 or 5)`);
}

export function paperPricePerM2(layers: Layer[]): number {
  // gsm (g/m²) × CNY/kg ÷ 1000 (g/kg) × take-up factor = CNY/m² per ply.
  return layers.reduce((s, l) => s + (l.gsm * l.pricePerKg * l.factor) / 1000, 0);
}

export interface BlankResult {
  lengthM: number;
  widthM: number;
  lengthMm: number;
  widthMm: number;
  area: number;
}

// RSC blank: length = 2(D+W) + glue lap; width = H + W + flap allowance.
export function computeBlank(d: number, w: number, h: number, plyCount: number): BlankResult {
  const lap = PARAMS.glueLap[plyCount === 5 ? "5" : "3"];
  const lengthM = (2 * (d + w)) / 1000 + lap;
  const widthM = (h + w) / 1000 + PARAMS.flapAllowance;
  const area = lengthM * widthM;
  return {
    lengthM,
    widthM,
    lengthMm: lengthM * 1000,
    widthMm: widthM * 1000,
    area,
  };
}

function costLines(f: PlainFields, blank: BlankResult, board: number, tier: TierDef): CostLine[] {
  const qty = f.qty as number;
  const colors = f.colors as number;
  const method = f.method ?? "flexo";
  const plyCount = resolveCombo(f.combo as string).plyCount;
  const printRate = PARAMS.printRate[method];
  const setupFee = PARAMS.setupFee[method];
  const plateFee = PARAMS.plateFee[method];
  const dieCost = PARAMS.dieCost[plyCount === 5 ? "5" : "3"];

  const material = r4(blank.area * board);
  const waste = r4(material * tier.waste);
  const printing = r4(blank.area * colors * printRate * tier.mPrint);
  const setup = r4((setupFee * colors) / qty);
  const dieCutting = r4(blank.area * PARAMS.dieCutRate * tier.mConv);
  const gluing = r4(blank.area * PARAMS.glueRate * tier.mConv);
  const bundling = r4(PARAMS.bundlingFee);
  const tooling = r4((dieCost + plateFee * colors) / qty);

  const subtotal = r4(
    material + waste + printing + setup + dieCutting + gluing + bundling + tooling
  );
  const management = r4(subtotal * PARAMS.managementFee);
  const freight = r4(subtotal * PARAMS.freight);
  const fullCost = r4(subtotal + management + freight);
  const unitPrice = ceil2(fullCost / (1 - PARAMS.targetMargin));
  const unitPriceVat = r2(unitPrice * (1 + PARAMS.vat));
  const unitPriceVnd = Math.round(unitPrice * PARAMS.exchangeRate);

  const lines: CostLine[] = [
    { key: "material", label: "Paper material", value: material, formula: `${r3(blank.area)} m² × ${r3(board)} CNY/m²` },
    { key: "waste", label: `Waste (${(tier.waste * 100).toFixed(1)}%)`, value: waste, formula: `${material} × ${(tier.waste * 100).toFixed(1)}%` },
    { key: "printing", label: "Printing", value: printing, formula: `${r3(blank.area)} × ${colors} colours × ${printRate} × ${tier.mPrint}` },
    { key: "setup", label: "Setup amortisation", value: setup, formula: `${setupFee} × ${colors} ÷ ${qty}` },
    { key: "dieCutting", label: "Die-cutting", value: dieCutting, formula: `${r3(blank.area)} × ${PARAMS.dieCutRate} × ${tier.mConv}` },
    { key: "gluing", label: "Gluing", value: gluing, formula: `${r3(blank.area)} × ${PARAMS.glueRate} × ${tier.mConv}` },
    { key: "bundling", label: "Bundling", value: bundling, formula: `flat fee per box` },
    { key: "tooling", label: "Die & plate amortisation", value: tooling, formula: `(${dieCost} + ${plateFee}×${colors}) ÷ ${qty}` },
    { key: "subtotal", label: "Subtotal", value: subtotal, formula: `sum of cost lines` },
    { key: "management", label: `Management fee (${(PARAMS.managementFee * 100).toFixed(0)}%)`, value: management, formula: `${subtotal} × ${PARAMS.managementFee}` },
    { key: "freight", label: `Freight (${(PARAMS.freight * 100).toFixed(0)}%)`, value: freight, formula: `${subtotal} × ${PARAMS.freight}` },
    { key: "fullCost", label: "Full cost", value: fullCost, formula: `${subtotal} + ${management} + ${freight}` },
    { key: "unitPrice", label: "Unit price (10% margin)", value: unitPrice, formula: `ceil(${fullCost} ÷ 0.90)` },
    { key: "vat", label: "Price incl. 13% VAT", value: unitPriceVat, formula: `${unitPrice} × 1.13` },
    { key: "vnd", label: "Converted to VND", value: unitPriceVnd, formula: `${unitPrice} × ${PARAMS.exchangeRate}` },
  ];

  return lines;
}

// Price every quantity tier; the caller selects the one that matches the order.
export function computePricing(f: PlainFields): Pricing {
  if (f.D == null || f.W == null || f.H == null || f.qty == null || f.combo == null || f.colors == null) {
    throw new Error("Pricing requires D, W, H, qty, combo and colors");
  }
  const { plyCount, layers } = resolveCombo(f.combo);
  const blank = computeBlank(f.D, f.W, f.H, plyCount);
  const paper = r3(paperPricePerM2(layers));
  const board = r3(paper + PARAMS.corrugatingFee[plyCount === 5 ? "5" : "3"]);

  const tiers: TierQuote[] = TIERS.map((t) => {
    const lines = costLines(f, blank, board, t);
    const unitCost = lines.find((l) => l.key === "fullCost")!.value;
    const unitPrice = lines.find((l) => l.key === "unitPrice")!.value;
    const unitPriceVat = lines.find((l) => l.key === "vat")!.value;
    const unitPriceVnd = lines.find((l) => l.key === "vnd")!.value;
    return {
      tier: t.id,
      minQty: t.min,
      maxQty: t.max,
      mPrint: t.mPrint,
      mConv: t.mConv,
      waste: t.waste,
      unitCost,
      unitPrice,
      unitPriceVat,
      unitPriceVnd,
      orderValue: r2(unitPrice * t.min),
      lines,
    };
  });

  return {
    blankLengthM: blank.lengthM,
    blankWidthM: blank.widthM,
    blankLengthMm: blank.lengthMm,
    blankWidthMm: blank.widthMm,
    area: blank.area,
    paperPrice: paper,
    boardPrice: board,
    plyCount,
    layers: layers.map((l) => ({ name: l.name, gsm: l.gsm, factor: l.factor })),
    matchedTier: tierForQty(f.qty).id,
    tiers,
  };
}

export function matchedTier(p: Pricing, qty: number): TierQuote {
  return p.tiers.find((t) => t.tier === tierForQty(qty).id)!;
}
