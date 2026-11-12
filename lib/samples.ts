// The 10 labelled cases from the project report, section 7.1.
// Used as one-click demo inputs. Expected handling is shown in the UI only.

export interface Sample {
  id: string;
  label: string;
  text: string;
  expected: string;
}

export const SAMPLES: Sample[] = [
  {
    id: "C01",
    label: "Complete · 5-ply",
    text: "Box 400×300×250 mm, 5-ply BC 175, 3-colour flexo, 10,000 pcs, delivery within 10 days.",
    expected: "Quote ≈ 5.82 CNY",
  },
  {
    id: "C02",
    label: "High tooling share",
    text: "250×200×150, 3B150, 2 colours, 3,000 pcs",
    expected: "Quote + R09 approval",
  },
  {
    id: "C03",
    label: "Near format limit",
    text: "500×400×400, 5BC200, 4 colours, 5,000 pcs",
    expected: "Quote + format warning",
  },
  {
    id: "C04",
    label: "Small batch",
    text: "300×250×200, 3E200, 1 colour, 1,000 pcs",
    expected: "Quote + R09 approval",
  },
  {
    id: "C05",
    label: "Offset large batch",
    text: "350×250×200, 3W250, 4-colour offset, 20,000 pcs",
    expected: "Quote",
  },
  {
    id: "C06",
    label: "Missing board & colour",
    text: "same as last order, 200×150×100, 5,000 pcs",
    expected: "ASK + range",
  },
  {
    id: "C07",
    label: "Print logo only",
    text: "300×200×180, 2,000 pcs, print logo",
    expected: "ASK + range",
  },
  {
    id: "C08",
    label: "No dimensions",
    text: "500 boxes, no dimensions",
    expected: "BLOCK",
  },
  {
    id: "C09",
    label: "Contradictory offset",
    text: "350×250×200, 5-ply, 6-colour offset, 800 pcs",
    expected: "WARN + escalate",
  },
  {
    id: "C10",
    label: "Width > length",
    text: "Length 200, width 300, 5,000 pcs",
    expected: "ASK (R08)",
  },
];
