export const APP_NAME = 'Unshafted';
export const APP_TAGLINE = "Reads contracts from your side of the table.";

export const DEFAULT_OPENROUTER_API_KEY = process.env.CEB_OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '';
export const DEFAULT_OPENAI_API_KEY = process.env.CEB_OPENAI_API_KEY ?? '';
export const DEFAULT_PROVIDER: 'openrouter' | 'openai' = 'openrouter';

export const DEFAULT_QUICK_MODEL = 'google/gemma-4-26b-a4b-it:free';
export const DEFAULT_DEEP_MODEL = 'stepfun/step-3.5-flash:free';
export const DEFAULT_OPENAI_QUICK_MODEL = 'gpt-5-nano';
export const DEFAULT_OPENAI_DEEP_MODEL = 'gpt-5.4';
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MONTHLY_SOFT_LIMIT = 3;

export const QUICK_SCAN_CHAR_LIMIT = 20_000;
export const DEEP_ANALYSIS_CHAR_LIMIT = 42_000;
export const HISTORY_LIMIT = 6;
export const PREVIEW_CHAR_LIMIT = 1_600;

export const ROLE_FALLBACKS = [
  'Signer',
  'Buyer',
  'Seller',
  'Customer',
  'Contractor',
  'Employee',
  'Tenant',
  'Landlord',
  'Founder',
  'Vendor',
  'Platform User',
] as const;

export const PRIORITY_OPTIONS = [
  'Liability',
  'Payment',
  'Termination',
  'Renewal',
  'Indemnity',
  'IP',
  'Confidentiality',
  'Disputes',
  'Exclusivity',
  'Data/Privacy',
] as const;

export const DISCLAIMER_LINE =
  'This is guidance to help you understand the agreement, not legal advice. For high-stakes matters, consult a qualified lawyer.';

export const LOADING_STEPS = [
  'Reading structure',
  'Checking asymmetry',
  'Looking for lock-in and penalty triggers',
  'Pulling negotiation angles',
] as const;
