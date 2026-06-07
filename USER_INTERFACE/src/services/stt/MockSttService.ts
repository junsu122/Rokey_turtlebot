import type { SttHandlers, SttService, SttSession } from './SttService';

/**
 * Simulated STT. Each session "hears" the next phrase from a rotating demo set,
 * streaming it word-by-word (interim) and then a final result — enough to drive
 * and test the full voice → LLM → guidance flow with no microphone/server.
 */
const DEMO_PHRASES = [
  '화장실 어디예요',
  '역무실 가고 싶어요',
  '2층 사무실로 안내해줘',
  '제일 가까운 출구 알려줘',
  '엘리베이터 어디 있어요',
  '편의점 가고 싶어요',
];

const WORD_INTERVAL_MS = 380;

export class MockSttService implements SttService {
  private index = 0;

  isSupported(): boolean {
    return true;
  }

  start(handlers: SttHandlers): SttSession {
    const phrase = DEMO_PHRASES[this.index % DEMO_PHRASES.length];
    this.index += 1;

    const words = phrase.split(' ');
    const timers: number[] = [];
    let stopped = false;

    words.forEach((_, i) => {
      const timer = window.setTimeout(
        () => {
          if (stopped) return;
          handlers.onResult?.({
            transcript: words.slice(0, i + 1).join(' '),
            isFinal: false,
          });
        },
        WORD_INTERVAL_MS * (i + 1),
      );
      timers.push(timer);
    });

    const finalTimer = window.setTimeout(
      () => {
        if (stopped) return;
        stopped = true;
        handlers.onResult?.({ transcript: phrase, isFinal: true });
        handlers.onEnd?.();
      },
      WORD_INTERVAL_MS * (words.length + 1) + 200,
    );
    timers.push(finalTimer);

    return {
      stop: () => {
        if (stopped) return;
        stopped = true;
        timers.forEach((t) => window.clearTimeout(t));
        handlers.onEnd?.();
      },
    };
  }
}
