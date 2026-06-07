import type { Facility } from '@/core/domain';
import type { FacilityResolution, LlmService } from './LlmService';

const THINK_DELAY_MS = 850;
const MATCH_THRESHOLD = 2;

/**
 * Lightweight stand-in for a real LLM. Scores each candidate by name/alias
 * keyword hits plus a floor hint ("2층", "위층" …). Good enough to drive the
 * whole voice flow deterministically; swap for a real LlmService later.
 */
export class MockLlmService implements LlmService {
  resolveFacility(
    transcript: string,
    candidates: Facility[],
  ): Promise<FacilityResolution> {
    return new Promise((resolve) => {
      window.setTimeout(
        () => resolve(this.match(transcript, candidates)),
        THINK_DELAY_MS,
      );
    });
  }

  private match(transcript: string, candidates: Facility[]): FacilityResolution {
    const text = normalize(transcript);
    if (!text) return { facility: null, confidence: 0, reason: 'empty' };

    const floorHint = detectFloor(text);

    let best: Facility | null = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      let score = 0;
      if (text.includes(normalize(candidate.name))) score += 3;
      for (const alias of candidate.aliases ?? []) {
        if (text.includes(normalize(alias))) {
          score += 2;
          break;
        }
      }
      if (score > 0 && floorHint) {
        score += candidate.floorId === floorHint ? 1.5 : -0.5;
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best || bestScore < MATCH_THRESHOLD) {
      return { facility: null, confidence: 0, reason: 'no-match' };
    }
    return {
      facility: best,
      confidence: Math.min(1, bestScore / 4.5),
      reason: 'keyword-match',
    };
  }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

function detectFloor(text: string): string | null {
  if (/(2층|이층|위층|윗층)/.test(text)) return 'F2';
  if (/(1층|일층|아래층|아랫층)/.test(text)) return 'F1';
  return null;
}
