import { kioskConfig, transferPointsOnFloor } from '@/config';
import { MockRosService } from './ros';
import { MockSttService } from './stt';
import { MockLlmService } from './llm';
import { MockNavigationService } from './navigation';
import type { Services } from './types';

/**
 * Composition root. This is the ONE place mock implementations are chosen — to
 * go live, build the real RosService/SttService/LlmService here (everything else
 * in the app depends only on the interfaces).
 */
export function createDefaultServices(): Services {
  const ros = new MockRosService();
  void ros.connect();

  const stt = new MockSttService();
  const llm = new MockLlmService();

  const navigation = new MockNavigationService({
    ros,
    getTransferPoints: transferPointsOnFloor,
    travelMs: kioskConfig.simulatedTravelMs,
    handoffMs: kioskConfig.simulatedHandoffMs,
  });

  return { ros, stt, llm, navigation };
}
