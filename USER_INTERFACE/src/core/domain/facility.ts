/**
 * A facility a user can be guided to (restroom, office, exit, transfer point...).
 * Pure domain type — no UI, no framework.
 */
export type FacilityCategory =
  | 'restroom'
  | 'office'
  | 'exit'
  | 'ticket'
  | 'info'
  | 'gate'
  | 'convenience'
  | 'storage'
  | 'elevator'
  | 'escalator'
  | 'stairs'
  | 'bench' // 벤치
  | 'platform' // 탑승구
  | 'transit'; // 환승

/** Coordinate in blueprint units (see BLUEPRINT in config/floors). */
export interface FacilityPosition {
  x: number;
  y: number;
}

/** Bounding box on the blueprint, used to draw a floor-plan-style fixture. */
export interface FacilityFootprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Facility {
  id: string;
  /** Display name in Korean, e.g. "화장실". */
  name: string;
  category: FacilityCategory;
  /** Which floor this facility physically lives on. */
  floorId: string;
  /** Marker position (also the ROS goal pose) in blueprint units. */
  position: FacilityPosition;
  /** Optional drawn footprint on the blueprint (floor-plan look). */
  footprint?: FacilityFootprint;
  /** Drawing sub-style, e.g. bench 'a'|'b', gate 'narrow'|'wide', 'door'. */
  variant?: string;
  /** Optional rotation (degrees, clockwise) applied to the drawn fixture. */
  rotation?: number;
  /** Alternative phrasings used for voice/LLM matching, e.g. ["변소", "토일렛"]. */
  aliases?: string[];
  /** Optional one-line description shown in the UI. */
  description?: string;
}

/** Vertical transfer points used to move between floors (requirement #6). */
export const TRANSFER_CATEGORIES: ReadonlyArray<FacilityCategory> = [
  'elevator',
  'escalator',
  'stairs',
];

export function isTransferFacility(facility: Facility): boolean {
  return TRANSFER_CATEGORIES.includes(facility.category);
}
