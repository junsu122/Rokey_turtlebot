import {
  BigButton,
  FacilityIcon,
  LanguageSwitcher,
  ScreenFrame,
  StaffCallButton,
} from '@/components';
import { useStrings } from '@/config';
import { localizedFacilityName } from '@/core/domain';
import { useLanguage } from '@/core/i18n';
import { useKioskDispatch } from '@/core/kiosk';
import { cx } from '@/core/utils';
import { useGuidance } from '@/features/guiding/GuidanceProvider';
import { useVoiceFlow } from './useVoiceFlow';
import styles from './VoiceScreen.module.css';

/**
 * Requirement ver02 §2.5 (button B): understand speech via STT + LLM. A facility
 * request → confirm, then escort (server notified). A general question → show a
 * conversational reply, with no server notification (§2.5.2).
 */
export function VoiceScreen() {
  const dispatch = useKioskDispatch();
  const strings = useStrings();
  const { language } = useLanguage();
  const { guideTo } = useGuidance();
  const { state, transcript, understanding, startListening, stopListening } =
    useVoiceFlow();

  const candidate = understanding?.facility ?? null;
  const candidateName = candidate
    ? localizedFacilityName(candidate, language)
    : '';
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
        <div className={styles.spacer} />
        <LanguageSwitcher />
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
            <MicButton listening={false} onClick={startListening} />
          </>
        )}

        {state === 'listening' && (
          <>
            <MicButton listening onClick={() => undefined} />
            <p className={styles.status}>{strings.voice.listening}</p>
            <BigButton
              tone="secondary"
              size="normal"
              label={strings.voice.stop}
              onClick={stopListening}
            />
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
              <span className={styles.candidateName}>{candidateName}</span>
            </div>
            <p className={styles.question}>
              {strings.voice.confirmQuestion(candidateName)}
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

        {state === 'chat' && understanding && (
          <div className={styles.panel}>
            <div className={styles.answer}>
              <span className={styles.answerLabel}>
                {strings.voice.answerLabel}
              </span>
              <p className={styles.answerText}>{understanding.reply}</p>
            </div>
            <BigButton
              tone="secondary"
              size="normal"
              icon="🎤"
              label={strings.voice.askAgain}
              onClick={startListening}
            />
          </div>
        )}

        {(state === 'notfound' || state === 'error') && (
          <div className={styles.panel}>
            <p className={styles.notfound}>
              {state === 'error' ? strings.voice.error : strings.voice.notFound}
            </p>
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
  listening,
  onClick,
}: {
  listening: boolean;
  onClick: () => void;
}) {
  const strings = useStrings();
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
      {!listening && (
        <span className={styles.micLabel}>{strings.voice.tapToSpeak}</span>
      )}
    </button>
  );
}
