import {
  BigButton,
  FacilityIcon,
  ScreenFrame,
  StaffCallButton,
} from '@/components';
import { strings } from '@/config';
import { useKioskDispatch } from '@/core/kiosk';
import { cx } from '@/core/utils';
import { useGuidance } from '@/features/guiding/GuidanceProvider';
import { useVoiceFlow, type VoiceState } from './useVoiceFlow';
import styles from './VoiceScreen.module.css';

/**
 * Requirement #5 (button B): resolve a facility from speech via STT + LLM, then
 * (on confirmation) dispatch the escort.
 */
export function VoiceScreen() {
  const dispatch = useKioskDispatch();
  const { guideTo } = useGuidance();
  const { state, transcript, candidate, startListening } = useVoiceFlow();

  const showTranscript =
    transcript !== '' || state === 'listening' || state === 'thinking';

  return (
    <ScreenFrame tone="light">
      <header className={styles.header}>
        <BigButton
          tone="neutral"
          size="compact"
          icon="←"
          label={strings.voice.back}
          onClick={() => dispatch({ type: 'GO_HOME' })}
        />
        <h1 className={styles.title}>{strings.voice.title}</h1>
      </header>

      <div className={styles.body}>
        {showTranscript && (
          <div className={styles.transcriptBox}>
            <span className={styles.transcriptLabel}>
              {strings.voice.youSaid}
            </span>
            <p className={styles.transcript}>{transcript || '…'}</p>
          </div>
        )}

        {state === 'idle' && (
          <>
            <p className={styles.hint}>{strings.voice.idleHint}</p>
            <MicButton state={state} onClick={startListening} />
          </>
        )}

        {state === 'listening' && (
          <>
            <MicButton state={state} onClick={() => undefined} />
            <p className={styles.status}>{strings.voice.listening}</p>
          </>
        )}

        {state === 'thinking' && (
          <>
            <div className={styles.spinner} aria-hidden="true" />
            <p className={styles.status}>{strings.voice.thinking}</p>
          </>
        )}

        {state === 'confirm' && candidate && (
          <div className={styles.panel}>
            <div className={styles.candidate}>
              <FacilityIcon
                category={candidate.category}
                className={styles.candidateIcon}
              />
              <span className={styles.candidateName}>{candidate.name}</span>
            </div>
            <p className={styles.question}>
              {strings.voice.confirmQuestion(candidate.name)}
            </p>
            <div className={styles.actions}>
              <BigButton
                tone="primary"
                size="normal"
                label={strings.voice.confirmYes}
                onClick={() => guideTo(candidate)}
              />
              <BigButton
                tone="neutral"
                size="normal"
                label={strings.voice.confirmRetry}
                onClick={startListening}
              />
            </div>
          </div>
        )}

        {state === 'notfound' && (
          <div className={styles.panel}>
            <p className={styles.notfound}>{strings.voice.notFound}</p>
            <BigButton
              tone="secondary"
              size="normal"
              icon="🎤"
              label={strings.voice.confirmRetry}
              onClick={startListening}
            />
          </div>
        )}
      </div>

      <StaffCallButton
        label={strings.home.staffCall}
        onClick={() => dispatch({ type: 'OPEN_STAFF_CALL' })}
      />
    </ScreenFrame>
  );
}

function MicButton({
  state,
  onClick,
}: {
  state: VoiceState;
  onClick: () => void;
}) {
  const listening = state === 'listening';
  return (
    <button
      type="button"
      className={cx(styles.mic, listening && styles.micActive)}
      onClick={onClick}
      disabled={listening}
      aria-label={strings.voice.tapToSpeak}
    >
      <span className={styles.micGlyph} aria-hidden="true">
        🎤
      </span>
      {!listening && <span className={styles.micLabel}>{strings.voice.tapToSpeak}</span>}
    </button>
  );
}
