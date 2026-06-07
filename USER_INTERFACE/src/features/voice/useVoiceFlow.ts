import { useCallback, useEffect, useRef, useState } from 'react';
import { facilities } from '@/config';
import type { Facility } from '@/core/domain';
import { useServices, type SttSession } from '@/services';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'confirm'
  | 'notfound';

export interface VoiceFlow {
  state: VoiceState;
  transcript: string;
  candidate: Facility | null;
  startListening: () => void;
}

/**
 * Drives the voice path: STT (listening) → LLM resolution (thinking) → confirm
 * or notfound. The UI confirms before dispatching the escort.
 */
export function useVoiceFlow(): VoiceFlow {
  const { stt, llm } = useServices();
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [candidate, setCandidate] = useState<Facility | null>(null);
  const sessionRef = useRef<SttSession | null>(null);
  const resolvedRef = useRef(false);

  const resolve = useCallback(
    async (finalText: string) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      setState('thinking');
      const result = await llm.resolveFacility(finalText, facilities);
      if (result.facility) {
        setCandidate(result.facility);
        setState('confirm');
      } else {
        setState('notfound');
      }
    },
    [llm],
  );

  const startListening = useCallback(() => {
    sessionRef.current?.stop();
    resolvedRef.current = false;
    setTranscript('');
    setCandidate(null);
    setState('listening');

    sessionRef.current = stt.start({
      onResult: (result) => {
        setTranscript(result.transcript);
        if (result.isFinal) void resolve(result.transcript);
      },
      onError: () => setState('notfound'),
    });
  }, [stt, resolve]);

  useEffect(() => {
    return () => sessionRef.current?.stop();
  }, []);

  return { state, transcript, candidate, startListening };
}
