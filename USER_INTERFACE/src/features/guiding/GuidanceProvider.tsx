import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { kioskConfig } from '@/config';
import type { Facility, NavigationSession } from '@/core/domain';
import { useKioskDispatch } from '@/core/kiosk';
import { useServices, type NavigationHandle } from '@/services';

interface GuidanceControls {
  /** Plan + begin escorting to a facility, moving the kiosk into 'guiding'. */
  guideTo: (destination: Facility) => void;
  /** Abort the current escort and return to patrol. */
  cancelGuidance: () => void;
}

const GuidanceContext = createContext<GuidanceControls | null>(null);

/**
 * Owns the live escort: bridges the NavigationService to the kiosk state machine
 * and auto-returns to patrol on arrival (requirement #10). Mounted once at the
 * app root so navigation survives the map/voice → guiding screen switch.
 */
export function GuidanceProvider({ children }: { children: ReactNode }) {
  const dispatch = useKioskDispatch();
  const { navigation } = useServices();
  const handleRef = useRef<NavigationHandle | null>(null);
  const arrivedTimerRef = useRef<number | null>(null);

  const clearArrivedTimer = useCallback(() => {
    if (arrivedTimerRef.current !== null) {
      window.clearTimeout(arrivedTimerRef.current);
      arrivedTimerRef.current = null;
    }
  }, []);

  const guideTo = useCallback(
    (destination: Facility) => {
      handleRef.current?.cancel();
      clearArrivedTimer();

      const plan = navigation.planRoute(destination, kioskConfig.currentFloorId);
      const session: NavigationSession = {
        plan,
        progress: { phase: 'starting', ratio: 0 },
      };
      dispatch({ type: 'START_GUIDING', session });

      handleRef.current = navigation.start(plan, {
        onProgress: (progress) => {
          dispatch({ type: 'UPDATE_PROGRESS', progress });
          if (progress.phase === 'arrived') {
            clearArrivedTimer();
            arrivedTimerRef.current = window.setTimeout(() => {
              handleRef.current = null;
              dispatch({ type: 'END_GUIDING' });
            }, kioskConfig.arrivedHoldMs);
          }
        },
      });
    },
    [navigation, dispatch, clearArrivedTimer],
  );

  const cancelGuidance = useCallback(() => {
    handleRef.current?.cancel();
    handleRef.current = null;
    clearArrivedTimer();
    dispatch({ type: 'END_GUIDING' });
  }, [dispatch, clearArrivedTimer]);

  useEffect(() => {
    return () => {
      handleRef.current?.cancel();
      clearArrivedTimer();
    };
  }, [clearArrivedTimer]);

  return (
    <GuidanceContext.Provider value={{ guideTo, cancelGuidance }}>
      {children}
    </GuidanceContext.Provider>
  );
}

export function useGuidance(): GuidanceControls {
  const ctx = useContext(GuidanceContext);
  if (!ctx) {
    throw new Error('useGuidance must be used within <GuidanceProvider>');
  }
  return ctx;
}
