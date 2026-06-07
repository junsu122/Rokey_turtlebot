import type { RosService } from './ros';
import type { SttService } from './stt';
import type { LlmService } from './llm';
import type { NavigationService } from './navigation';

/** The full set of services the UI consumes. Provide real impls to go live. */
export interface Services {
  ros: RosService;
  stt: SttService;
  llm: LlmService;
  navigation: NavigationService;
}
