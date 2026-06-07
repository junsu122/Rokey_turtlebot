import { DEFAULT_LANGUAGE, isLanguage, type Language } from '@/core/i18n';

/**
 * Build-time configuration from Vite env vars. Each Alfred (1F / 2F) is a
 * separate build that sets VITE_FLOOR; the backend proxy URL and language
 * default come from here too. See .env.example.
 */
function str(value: string | undefined, fallback: string): string {
  return value && value.length > 0 ? value : fallback;
}

const floorRaw = str(import.meta.env.VITE_FLOOR, '1')
  .toUpperCase()
  .replace('F', '');

const defaultLang = import.meta.env.VITE_DEFAULT_LANG;

export const env = {
  /** 1 or 2 — which floor this kiosk's robot serves. */
  floorNumber: floorRaw === '2' ? 2 : 1,
  /** Default UI/voice language. */
  defaultLanguage: (isLanguage(defaultLang)
    ? defaultLang
    : DEFAULT_LANGUAGE) as Language,
  /** Force mocks (no API keys / proxy needed) — for offline dev. */
  useMocks: import.meta.env.VITE_USE_MOCKS === 'true',
  /** Backend proxy base (holds Soniox + Anthropic keys). */
  apiBase: str(import.meta.env.VITE_API_BASE, '/api').replace(/\/$/, ''),
  /** Soniox real-time model. */
  sonioxModel: str(import.meta.env.VITE_SONIOX_MODEL, 'stt-rt-v4'),
} as const;
