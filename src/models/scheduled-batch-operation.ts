import { WorkerAction } from "src/utils/constants";
import { ScheduledOperationFragment } from "src/models/scheduled-operation-fragment";

export interface ScheduledBatchOperation
{
    batchId: string;
    target: string;
    action: WorkerAction;
    threads: number;
    startsAt: number;
    additionalMsec: number;
    landingAt: number;
    fragments: ScheduledOperationFragment[];
}
