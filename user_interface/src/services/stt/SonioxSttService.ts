import { SonioxClient } from '@soniox/speech-to-text-web';
import { LANGUAGES, type Language } from '@/core/i18n';
import type {
  SttHandlers,
  SttService,
  SttSession,
  SttStartOptions,
} from './SttService';

export interface SonioxSttConfig {
  /** Proxy endpoint that mints a Soniox temporary API key, e.g.
   * `${apiBase}/soniox/temporary-api-key`. The permanent key stays server-side. */
  temporaryKeyEndpoint: string;
  /** Real-time model id (default 'stt-rt-v4'). */
  model: string;
}

/** Minimal shape of a Soniox partial result (structurally compatible). */
interface SonioxPartialResult {
  tokens: Array<{ text: string; is_final?: boolean }>;
}

const ALL_HINTS: Language[] = LANGUAGES.map((l) => l.code);

/**
 * Real-time STT via Soniox stt-rt-v4 (requirement ver02 §2.5 / §2.5.3).
 *
 * The browser never holds the permanent Soniox key: SonioxClient fetches a
 * short-lived temporary key from our proxy, then streams mic audio over the
 * Soniox WebSocket. Final tokens are appended; non-final tokens form the live
 * tail. stop() flushes a final transcript.
 */
export class SonioxSttService implements SttService {
  constructor(private readonly config: SonioxSttConfig) {}

  isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  start(handlers: SttHandlers, options?: SttStartOptions): SttSession {
    const endpoint = this.config.temporaryKeyEndpoint;

    const client = new SonioxClient({
      apiKey: async () => {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ usage_type: 'transcribe_websocket' }),
        });
        if (!res.ok) {
          throw new Error(`Soniox temporary key error: ${res.status}`);
        }
        const data = (await res.json()) as {
          api_key?: string;
          apiKey?: string;
        };
        const key = data.api_key ?? data.apiKey;
        if (!key) throw new Error('Soniox temporary key missing in response');
        return key;
      },
    });

    let finalText = '';
    let lastTranscript = '';
    let ended = false;

    const end = () => {
      if (ended) return;
      ended = true;
      handlers.onEnd?.();
    };

    // Prefer the selected language but keep the others as hints + auto-detect.
    const hints = options?.language
      ? [options.language, ...ALL_HINTS.filter((c) => c !== options.language)]
      : ALL_HINTS;

    client.start({
      model: this.config.model,
      languageHints: hints,
      enableLanguageIdentification: true,
      onPartialResult: (result: SonioxPartialResult) => {
        let interim = '';
        for (const token of result.tokens) {
          if (token.is_final) finalText += token.text;
          else interim += token.text;
        }
        lastTranscript = finalText + interim;
        handlers.onResult?.({ transcript: lastTranscript, isFinal: false });
      },
      onFinished: () => {
        handlers.onResult?.({
          transcript: finalText || lastTranscript,
          isFinal: true,
        });
        end();
      },
      onError: (status: string, message: string) => {
        handlers.onError?.(new Error(`Soniox ${status}: ${message}`));
        end();
      },
    });

    return {
      stop: () => {
        // Graceful: waits for buffered audio, then onFinished fires.
        client.stop();
      },
    };
  }
}
