// Versioned parameter table.
// Source: Zhuochuang Consulting October 2026 containerboard quotation
// (recorded in the project report, section 1.7). Edit values here to change
// thresholds live — the pricing/rule engines never hard-code a number.

export const PARAMS_VERSION = "2026-10-zhouchuang";

// Paper prices, CNY per tonne (converted to CNY/kg inside the engine).
export const PAPER_PRICE: Record<string, Record<number, number>> = {
  containerboard: { 150: 3780, 175: 3760, 200: 3800 },
  fluting: { 110: 3150, 120: 3200, 140: 3240 }, // high-strength fluting
  white: { 250: 4500 }, // coated white board
};

export interface TierDef {
  id: string;
  min: number;
  max: number | null;
  mPrint: number;
  mConv: number;
  waste: number;
}

export const TIERS: TierDef[] = [
  { id: "T1", min: 300, max: 999, mPrint: 1.3, mConv: 1.25, waste: 0.07 },
  { id: "T2", min: 1000, max: 2999, mPrint: 1.0, mConv: 1.0, waste: 0.055 },
  { id: "T3", min: 3000, max: 4999, mPrint: 0.92, mConv: 0.95, waste: 0.05 },
  { id: "T4", min: 5000, max: 9999, mPrint: 0.86, mConv: 0.9, waste: 0.045 },
  { id: "T5", min: 10000, max: null, mPrint: 0.8, mConv: 0.85, waste: 0.04 },
];

export const PARAMS = {
  exchangeRate: 3550, // VND per CNY (display only)
  vat: 0.13,
  managementFee: 0.06,
  freight: 0.03,
  targetMargin: 0.1,
  approvalMarginFloor: 0.08, // gross margin below this triggers approval

  printRate: { flexo: 0.42, offset: 0.58 }, // CNY/m²/colour
  setupFee: { flexo: 90, offset: 180 }, // CNY/colour, amortised over qty
  plateFee: { flexo: 260, offset: 120 }, // CNY/colour (flexo plate / PS plate)
  dieCost: { "3": 900, "5": 1200 }, // CNY one-off, by ply count

  glueLap: { "3": 0.04, "5": 0.045 }, // m, blank length allowance
  flapAllowance: 0.03, // m, blank width allowance (top/bottom flap)
  corrugatingFee: { "3": 0.5, "5": 0.75 }, // CNY/m²

  dieCutRate: 0.3, // CNY/m²
  glueRate: 0.22, // CNY/m²
  bundlingFee: 0.03, // CNY/pc flat

  flutingGsm: 120, // default corrugated medium grammage
  flutingFactor: { single: 1.4, first: 1.4, second: 1.45 },

  moq: 300, // minimum order quantity, pcs
  maxBlankLength: 2200, // mm (corrugator format)
  maxBlankWidth: 1600, // mm
  maxColors: { flexo: 4, offset: 6 },

  toolingShareMax: 0.15,
  historicDeviationMax: 0.1,
  standardLeadTime: 7, // days

  priceBaselineDate: "2026-10",
  priceStaleDays: 30,

  // Defaults used only for the ±8% range estimate when combo/colours are missing.
  defaults: { combo: "3B150", colors: 3 },
  rangePct: 0.08,
} as const;

export function tierForQty(qty: number): TierDef {
  const t = TIERS.find((t) => qty >= t.min && (t.max === null || qty <= t.max));
  if (!t) {
    if (qty < TIERS[0].min) return TIERS[0];
    return TIERS[TIERS.length - 1];
  }
  return t;
}
