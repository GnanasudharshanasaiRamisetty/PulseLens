import { RGBSample, RppgAlgorithm } from '../types/rppg';
import { runPulseLensPipeline } from '../utils/demoSignal';

export interface WorkerRequestMessage {
  type: 'ANALYZE';
  requestId: number;
  rawBuffer: RGBSample[];
  algorithm: RppgAlgorithm;
  windowSec: number;
  compareAll: boolean;
  bpmHistoryByAlgo: Record<RppgAlgorithm, number[]>;
}

self.onmessage = (event: MessageEvent<WorkerRequestMessage>) => {
  const msg = event.data;
  if (!msg || msg.type !== 'ANALYZE') return;

  const { result, updatedBpmHistory } = runPulseLensPipeline(
    msg.rawBuffer,
    msg.algorithm,
    msg.windowSec,
    msg.compareAll,
    msg.bpmHistoryByAlgo
  );

  self.postMessage({
    type: 'ANALYSIS_RESULT',
    requestId: msg.requestId,
    result,
    updatedBpmHistory,
  });
};
