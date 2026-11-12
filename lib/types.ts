// Shared type definitions for the Carton Quotation Agent.

export interface FieldMeta {
  value: string | number | boolean | null;
  evidence: string;
  confidence: number; // 0..1
}

export type Fields = Record<string, FieldMeta>;

export interface CostLine {
  key: string;
  label: string;
  value: number;
  formula: string;
}

export interface TierQuote {
  tier: string;
  minQty: number;
  maxQty: number | null;
  mPrint: number;
  mConv: number;
  waste: number;
  unitCost: number;
  unitPrice: number;
  unitPriceVat: number;
  unitPriceVnd: number;
  orderValue: number;
  lines: CostLine[];
}

export interface Pricing {
  blankLengthM: number;
  blankWidthM: number;
  blankLengthMm: number;
  blankWidthMm: number;
  area: number;
  paperPrice: number;
  boardPrice: number;
  plyCount: number;
  layers: { name: string; gsm: number; factor: number }[];
  matchedTier: string;
  tiers: TierQuote[];
}

export type RuleAction = "PASS" | "BLOCK" | "ASK" | "WARN" | "HUMAN";

export interface RuleResult {
  code: string;
  name: string;
  action: RuleAction;
  threshold?: string;
  computed?: string;
  message?: string;
}

export interface Explanation {
  customer: string;
  internal: string;
  approval: string;
}

export interface NodeStatus {
  id: string;
  name: string;
  status: "done" | "error" | "skipped" | "pending";
  ms: number;
  note?: string;
}

export type QuoteStatus = "quote" | "range" | "ask" | "block";

export interface QuoteResult {
  requestId: string;
  status: QuoteStatus;
  mode: "model" | "rules-only";
  fields: Fields;
  pricing: Pricing | null;
  rules: RuleResult[];
  explanation: Explanation | null;
  clarification: string[];
  range: { base: number; low: number; high: number } | null;
  approvalRoute: string | null;
  nodes: NodeStatus[];
  paramsVersion: string;
  modelVersion?: string;
  warnings: string[];
  source?: "text" | "image";
  ocrText?: string;
}
