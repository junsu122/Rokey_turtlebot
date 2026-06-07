import { RobotFace, ScreenFrame } from '@/components';
import { useStrings } from '@/config';
import { useAnyInput } from '@/core/hooks';
import { useKioskDispatch } from '@/core/kiosk';
import styles from './PatrolScreen.module.css';

/**
 * Requirement #2: during patrol the kiosk is a full-screen smiling face with a
 * single line of guidance at the bottom. Any key/touch wakes it (requirement #3).
 */
export function PatrolScreen() {
  const dispatch = useKioskDispatch();
  const strings = useStrings();
  useAnyInput(() => dispatch({ type: 'WAKE' }));

  return (
    <ScreenFrame tone="dark" className={styles.screen}>
      <div className={styles.body}>
        <RobotFace size="xl" />
      </div>
      <p className={styles.hint}>{strings.patrol.hint}</p>
    </ScreenFrame>
  );
}
