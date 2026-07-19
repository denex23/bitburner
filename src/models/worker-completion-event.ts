import { WorkerAction } from "src/utils/constants";

export interface WorkerCompletionEvent
{
    batchId: string;
    target: string;
    action: WorkerAction;
    hostname: string;
    threads: number;
    operationIndex: number;
    additionalMsec: number;
    landedAt: number;
}
