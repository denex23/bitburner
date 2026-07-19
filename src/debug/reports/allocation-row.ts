import { WorkerAction } from "src/utils/constants";

export interface AllocationRow
{
    target: string;
    batches: number;
    operations: number;
    actions: WorkerAction[];
    processes: number;
    threadsByAction: Partial<Record<WorkerAction, number>>;
    ram: number;
    minimumAdditionalMsec: number;
    maximumAdditionalMsec: number;
}
