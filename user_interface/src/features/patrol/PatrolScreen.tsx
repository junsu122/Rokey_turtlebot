import { RobotFace, ScreenFrame } from '@/components';
import { useStrings } from '@/config';
import { isWakeWordSupported, useAnyInput, useWakeWord } from '@/core/hooks';
import { useLanguage } from '@/core/i18n';
import { useKioskDispatch } from '@/core/kiosk';
import styles from './PatrolScreen.module.css';

/** Wake phrases that start the visually-impaired voice flow. */
const WAKE_WORDS = ['hello alfred', '헬로 알프레드', 'alfred', '알프레드'];

/**
 * Requirement #2: during patrol the kiosk is a full-screen smiling face. Any
 * key/touch wakes to the (general, silent) Home (#3). Saying the wake word
 * "hello Alfred" instead jumps straight into the visually-impaired voice flow
 * (TTS on). A tappable hint provides the same entry where the mic is
 * unavailable.
 */
export function PatrolScreen() {
  const dispatch = useKioskDispatch();
  const strings = useStrings();
  const { language } = useLanguage();

  useAnyInput(() => dispatch({ type: 'WAKE' }));
  useWakeWord({
    enabled: isWakeWordSupported(),
    language,
    phrases: WAKE_WORDS,
    onWake: () => dispatch({ type: 'WAKE_VOICE' }),
  });

  return (
    <ScreenFrame tone="dark" className={styles.screen}>
      <div className={styles.body}>
        <RobotFace size="xl" />
      </div>
      <div className={styles.hints}>
        <p className={styles.hint}>{strings.patrol.hint}</p>
        <button
          type="button"
          className={styles.wake}
          onClick={(event) => {
            // Don't also trigger the window-level "any input → Home" wake.
            event.stopPropagation();
            dispatch({ type: 'WAKE_VOICE' });
          }}
        >
          {strings.patrol.wakeHint}
        </button>
      </div>
    </ScreenFrame>
  );
}
