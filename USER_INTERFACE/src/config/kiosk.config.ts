/**
 * Per-robot runtime configuration. In a real deployment this would be loaded
 * from an env file / provisioning so each of the two robots knows which floor
 * it lives on (situation #5: one robot per floor).
 */
export interface KioskConfig {
  /** Station display name. */
  stationName: string;
  /** Robot / product name. */
  robotName: string;
  /** Which floor THIS kiosk's robot serves. */
  currentFloorId: string;

  /** Inactivity before returning to patrol (requirement #10, defensive). */
  idleTimeoutMs: number;

  /** Demo-only timings — these stand in for the real ROS/robot feedback. */
  simulatedTravelMs: number;
  simulatedHandoffMs: number;
  /** How long the "도착했어요!" message holds before returning to patrol. */
  arrivedHoldMs: number;

  /** Request browser Fullscreen on first interaction as a kiosk fallback. */
  requestFullscreen: boolean;
  /** Hide the mouse cursor (true touch kiosk). */
  hideCursor: boolean;
}

export const kioskConfig: KioskConfig = {
  stationName: '로키대학교역',
  robotName: 'ALFRED',
  currentFloorId: 'F1',

  idleTimeoutMs: 60_000,

  simulatedTravelMs: 6_000,
  simulatedHandoffMs: 3_000,
  arrivedHoldMs: 2_600,

  requestFullscreen: true,
  hideCursor: false,
};
