import type { Facility } from '@/core/domain';

/**
 * Natural-language → facility resolution (requirement #5).
 * Real implementation: an LLM call (server-side) that picks the best facility
 * from the candidate list given the user's utterance.
 */
export interface FacilityResolution {
  facility: Facility | null;
  /** 0..1 — UI may ask for confirmation below a threshold. */
  confidence: number;
  reason?: string;
}

export interface LlmService {
  resolveFacility(
    transcript: string,
    candidates: Facility[],
  ): Promise<FacilityResolution>;
}
