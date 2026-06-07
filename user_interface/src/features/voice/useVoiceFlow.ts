import { useCallback, useEffect, useRef, useState } from 'react';
import { facilities } from '@/config';
import { isSelectableFacility } from '@/core/domain';
import { useLanguage } from '@/core/i18n';
import {
  useServices,
  type SttSession,
  type VoiceUnderstanding,
} from '@/services';

/** Benches and other display-only fixtures are not voice destinations. */
const NAV_TARGETS = facilities.filter(isSelectableFacility);

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'confirm' // facility resolved → ask to escort (§2.5.1)
  | 'chat' // general question → show conversational reply (§2.5.2)
  | 'notfound'
  | 'error';

export interface VoiceFlow {
  state: VoiceState;
  transcript: string;
  understanding: VoiceUnderstanding | null;
  startListening: () => void;
  stopListening: () => void;
}

/**
 * Drives the voice path (requirement ver02 §2.5): STT (listening) → LLM
 * understanding (thinking) → either a facility confirmation (escort + notify
 * server) or a free chat reply (no server). The selected UI language is passed
 * to both STT and the LLM.
 */
export function useVoiceFlow(): VoiceFlow {
  const { stt, llm } = useServices();
  const { language } = useLanguage();
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [understanding, setUnderstanding] = useState<VoiceUnderstanding | null>(
    null,
  );
  const sessionRef = useRef<SttSession | null>(null);
  const resolvedRef = useRef(false);

  const resolve = useCallback(
    async (finalText: string) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      if (!finalText.trim()) {
        setState('notfound');
        return;
      }
      setState('thinking');
      try {
        const result = await llm.understand(finalText, NAV_TARGETS, {
          language,
        });
        setUnderstanding(result);
        if (result.intent === 'facility') {
          setState(result.facility ? 'confirm' : 'notfound');
        } else {
          setState('chat');
        }
      } catch {
        setState('error');
      }
    },
    [llm, language],
  );

  const startListening = useCallback(() => {
    sessionRef.current?.stop();
    resolvedRef.current = false;
    setTranscript('');
    setUnderstanding(null);
    setState('listening');

    sessionRef.current = stt.start(
      {
        onResult: (result) => {
          setTranscript(result.transcript);
          if (result.isFinal) void resolve(result.transcript);
        },
        onError: () => setState('error'),
      },
      { language },
    );
  }, [stt, resolve, language]);

  const stopListening = useCallback(() => {
    sessionRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => sessionRef.current?.stop();
  }, []);

  return { state, transcript, understanding, startListening, stopListening };
}
