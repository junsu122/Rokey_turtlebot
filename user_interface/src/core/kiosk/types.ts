import type { NavigationProgress, NavigationSession } from '@/core/domain';

/** The five top-level kiosk screens (the finite states). */
export type KioskScreen = 'patrol' | 'home' | 'map' | 'voice' | 'guiding';

export interface KioskState {
  screen: KioskScreen;
  /** Staff-call popup is an overlay, orthogonal to the screen. */
  staffCallActive: boolean;
  /** The active escort session while screen === 'guiding'. */
  session: NavigationSession | null;
}

export type KioskEvent =
  | { type: 'WAKE' } // patrol → home (requirement #3: any key/touch)
  | { type: 'OPEN_MAP' } // home → map (button A)
  | { type: 'OPEN_VOICE' } // home → voice (button B)
  | { type: 'GO_HOME' } // map/voice → home (back)
  | { type: 'START_GUIDING'; session: NavigationSession } // → guiding (#4/#5/#7)
  | { type: 'UPDATE_PROGRESS'; progress: NavigationProgress }
  | { type: 'END_GUIDING' } // guiding → patrol (requirement #10)
  | { type: 'IDLE_TIMEOUT' } // any active screen → patrol
  | { type: 'OPEN_STAFF_CALL' } // requirement #3/#11
  | { type: 'CLOSE_STAFF_CALL' };
