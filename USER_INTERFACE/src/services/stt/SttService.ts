/**
 * Speech-to-text contract (requirement #5, the voice path).
 * Real implementations: Web Speech API (browser) or a server STT (Whisper, etc.).
 * The UI depends only on this interface.
 */
export interface SttResult {
  transcript: string;
  isFinal: boolean;
}

export interface SttHandlers {
  onResult?: (result: SttResult) => void;
  onError?: (error: Error) => void;
  onEnd?: () => void;
}

export interface SttSession {
  /** Stop listening early; triggers onEnd. */
  stop(): void;
}

export interface SttService {
  isSupported(): boolean;
  /** Begin a recognition session. */
  start(handlers: SttHandlers): SttSession;
}
