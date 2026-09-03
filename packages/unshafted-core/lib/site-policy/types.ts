import type {
  ActionEffortSchema,
  AvailableActionSchema,
  DeadlineKindSchema,
  DisclosureRegimeSchema,
  DisclosureStatusSchema,
  ExposureSchema,
  PeerDeviationSchema,
  PolicyDocTypeSchema,
  PolicyCacheEntrySchema,
  PolicyDomainCacheEntrySchema,
  PolicyDomainIndexSchema,
  RequiredDisclosureSchema,
  SitePolicyAnalysisSchema,
  VerticalSchema,
} from './schemas.js';
import type { z } from 'zod';

export type PolicyDocType = z.infer<typeof PolicyDocTypeSchema>;
export type Vertical = z.infer<typeof VerticalSchema>;
export type DisclosureRegime = z.infer<typeof DisclosureRegimeSchema>;
export type DisclosureStatus = z.infer<typeof DisclosureStatusSchema>;
export type ActionEffort = z.infer<typeof ActionEffortSchema>;
export type DeadlineKind = z.infer<typeof DeadlineKindSchema>;
export type Exposure = z.infer<typeof ExposureSchema>;
export type AvailableAction = z.infer<typeof AvailableActionSchema>;
export type RequiredDisclosure = z.infer<typeof RequiredDisclosureSchema>;
export type PeerDeviation = z.infer<typeof PeerDeviationSchema>;
export type SitePolicyAnalysis = z.infer<typeof SitePolicyAnalysisSchema>;
export type PolicyDomainIndex = z.infer<typeof PolicyDomainIndexSchema>;
export type PolicyCacheEntry = z.infer<typeof PolicyCacheEntrySchema>;
export type PolicyDomainCacheEntry = z.infer<typeof PolicyDomainCacheEntrySchema>;
