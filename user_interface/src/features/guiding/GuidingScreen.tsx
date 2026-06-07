import { RobotFace, ScreenFrame } from '@/components';
import { getFloor, useStrings } from '@/config';
import type { AppStrings } from '@/core/i18n';
import type { NavigationSession } from '@/core/domain';
import { useKioskState } from '@/core/kiosk';
import { useGuidance } from './GuidanceProvider';
import styles from './GuidingScreen.module.css';

/**
 * Requirement #7 / ver02 §2.2: while escorting, the kiosk shows the smiling face
 * with the "시설 안내중" caption. The subtitle reflects same-floor vs the
 * cross-floor handoff (#6). On arrival it briefly celebrates, then returns to
 * patrol (#10).
 */
export function GuidingScreen() {
  const { session } = useKioskState();
  const strings = useStrings();
  const { cancelGuidance } = useGuidance();

  if (!session) return null;

  const arrived = session.progress.phase === 'arrived';
  const caption = arrived ? strings.guiding.arrived : strings.guiding.caption;
  const subtitle = arrived ? undefined : describe(session, strings);
  const ratio = Math.min(1, Math.max(0, session.progress.ratio));

  return (
    <ScreenFrame tone="dark">
      <div className={styles.body}>
        <RobotFace caption={caption} subtitle={subtitle} />
        <div className={styles.progress} aria-hidden="true">
          <div
            className={styles.progressFill}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
      </div>

      {!arrived && (
        <button type="button" className={styles.cancel} onClick={cancelGuidance}>
          {strings.guiding.cancel}
        </button>
      )}
    </ScreenFrame>
  );
}

function describe(session: NavigationSession, strings: AppStrings): string {
  const { plan, progress } = session;

  if (plan.kind === 'cross-floor' && plan.transfer) {
    const toFloor = getFloor(plan.transfer.toFloorId)?.shortName ?? '';
    if (progress.phase === 'awaiting-handoff') {
      return strings.guiding.handoff(toFloor);
    }
    return strings.guiding.viaTransfer(plan.transfer.via.name, toFloor);
  }

  return strings.guiding.toDestination(plan.destination.name);
}
