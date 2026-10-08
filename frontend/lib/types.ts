export type InvestorId = "vc" | "operator" | "customer" | "impact";
export type PanelMember = {
  id: InvestorId;
  name: string;
  role: string;
  lens: string;
  color: string;
  style: string;
};
export type Meta = {
  provider: string;
  model: string;
  ms: number;
  reasoning_tokens: number | null;
  is_demo: boolean;
  degraded: boolean;
  summary?: string;
  input_tokens?: number;
  output_tokens?: number;
};
export type Flag = {
  flag: string;
  quote: string;
  reason: string;
  confidence: number;
};
export type Message = {
  id: string;
  speaker: "founder" | InvestorId;
  text: string;
  flags?: Flag[];
  question?: string;
  challenges?: InvestorId;
  timestamp: number;
  metrics?: {
    question_category: string;
    directness: number;
    specificity: number;
    evidence_strength: number;
  };
};
export type Scorecard = Record<
  "team" | "market" | "traction" | "model" | "defensibility" | "clarity",
  number
>;
export type Pitch = {
  id: string;
  title: string;
  idea: string;
  difficulty: string;
  status: string;
  round: string;
  investor_state: Record<InvestorId, number>;
  answer_count: number;
  messages: Message[];
  next_question: {
    asker: InvestorId;
    text: string;
    targets_weakness: string;
    category: string;
  };
  llm_meta: Meta;
  analysis_id: string;
  created_at: number;
  is_synthetic: boolean;
  attempt_number: number;
  parent_pitch_id?: string;
  report?: {
    overall_score: number;
    scorecard: Scorecard;
    weaknesses: { title: string; evidence: string; action: string }[];
    verdicts: { id: InvestorId; decision: string; reason: string }[];
    rewritten_pitch: string;
    prep_sheet: { question: string; suggested_answer: string }[];
    dodged: { question: string; answer: string; message_id: string }[];
  };
  comparison?: { before: Scorecard; after: Scorecard; deltas: Scorecard };
  report_note?: string;
};
export type Config = {
  mode: "demo" | "live";
  panel: PanelMember[];
  providers: { name: string; model: string; configured: boolean }[];
  services: {
    name: string;
    configured: boolean;
    active: boolean;
    purpose: string;
    needs: string;
    url: string;
  }[];
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
  };
  retention_days: number;
  privacy: string;
};
export type Range = { low: number; base: number; high: number };
export type Assumption = {
  key: string;
  label: string;
  unit: string;
  value: Range | null;
  provenance: string;
  fact_ids: string[];
  rationale: string;
};
export type Revenue = {
  rows: {
    month: number;
    customers: number;
    revenue: number;
    net: number;
    cash: number;
  }[];
  annual_revenue: number[];
  arr_end: number;
  customers_end: number;
  funding_need: number;
  breakeven_month: number | null;
};
export type Risk = {
  category: string;
  title: string;
  likelihood: number;
  impact: number;
  score: number;
  band: string;
  early_warning: string;
  mitigation: string;
  kill_criterion: string;
};
export type Wedge = {
  name: string;
  kind: string;
  description: string;
  scores: Record<string, number>;
  total: number;
  why_it_works: string;
  what_must_be_true: string[];
  expansion_path: string;
};
export type Competitor = {
  name: string;
  type: string;
  what_they_do: string;
  target_customer: string;
  pricing: string | null;
  scale_signals: string | null;
  strengths: string[];
  weaknesses: string[];
  overlap: string;
  threat: string;
  map_x: number;
  map_y: number;
  source_ids: string[];
  verified: boolean;
};
export type Source = {
  id: string;
  url: string;
  title: string;
  publisher: string;
  published: string | null;
  retrieved: number;
  provider: string;
};
export type Unit = {
  arpu: number;
  gross_margin: number;
  cac: number;
  lifetime_months: number;
  ltv: number;
  ltv_cac: number | null;
  payback_months: number | null;
};
export type Simulation = {
  arr_end: { p10: number; p50: number; p90: number };
  funding_need: { p10: number; p50: number; p90: number };
  bands: { month: number; p10: number; p50: number; p90: number }[];
  p_breakeven: number;
  runs: number;
  seed: number;
  method: string;
};
export type Sections = {
  assumptions?: Assumption[];
  market?: Record<
    "low" | "base" | "high",
    {
      tam: number | null;
      sam_top_down: number | null;
      som_top_down: number | null;
      sam_bottom_up: number;
      som_bottom_up: number;
    }
  > & {
    agreement: {
      available: boolean;
      disagree: boolean;
      sam_ratio: number | null;
    };
  };
  revenue?: {
    scenarios: Record<string, Revenue>;
    simulation: Simulation;
    flags: string[];
  };
  unit_economics?: Record<string, Unit>;
  sensitivity?: {
    base_arr: number;
    items: {
      assumption: string;
      arr_at_low: number;
      arr_at_high: number;
      swing: number;
    }[];
  };
  funding?: {
    need: { p10: number; p50: number; p90: number };
    breakeven_month: number | null;
    runway_note: string;
    comparable_rounds: { note: string; source_id: string }[];
  };
  competitors?: {
    axis_x: string;
    axis_y: string;
    competitors: Competitor[];
    crowdedness: string;
    incumbent_response: string;
  };
  wedges?: {
    items: Wedge[];
    weights: Record<string, number>;
    recommended: string;
    stability: string;
  };
  moat?: {
    type: string;
    strength_today: number;
    months_to_build: number | null;
    reasoning: string;
  }[];
  risks?: Risk[];
  regulatory?: {
    area: string;
    jurisdiction: string;
    requirement: string;
    impact: string;
    source_ids: string[];
    verified: boolean;
  }[];
  claim_check?: {
    claim: string;
    quote: string;
    message_id: string;
    verdict: string;
    basis: string;
    explanation: string;
  }[];
  sources?: { items: Source[]; search_suggestions: string[] };
  narrative?: { text: string; why_now: string[]; method: string };
  facts?: {
    id: string;
    note: string;
    source_id: string;
    value: number | null;
    unit: string;
    topic: string;
  }[];
};
export type Analysis = {
  id: string;
  title: string;
  idea_text?: string;
  status: string;
  version: number;
  parent_analysis_id?: string;
  pitch_id?: string;
  is_synthetic: boolean;
  created_at: number;
  updated_at: number;
  profile?: {
    problem: string;
    solution: string;
    segment: string;
    business_model: string;
    industry: string;
    stage: string;
  };
  inputs: {
    currency: string;
    locale: string;
    horizon_months: number;
    geography: string;
  };
  progress?: Record<
    string,
    { status: string; ms?: number; started_at?: number }
  >;
  confidence?: {
    level: string;
    sourced_share: number;
    source_count: number;
    independent_publishers: number;
    market_methods_agree: boolean;
    rule: string;
  };
  signals?: { name: string; status: string; detail: string }[];
  sections: Sections;
  warnings?: string[];
  versions?: { calls: Meta[] };
  error?: string;
  stale?: boolean;
  public?: boolean;
};
export type ModelPreview = {
  market: NonNullable<Sections["market"]>;
  scenarios: Record<string, Revenue>;
  unit_economics: Record<string, Unit>;
  simulation: Simulation;
  sensitivity: NonNullable<Sections["sensitivity"]>;
  flags: string[];
  assumptions: Assumption[];
  wedges: NonNullable<Sections["wedges"]>;
  model_calls: number;
  note: string;
};
