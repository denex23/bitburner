import { WorkerAction } from "src/utils/constants";

export interface AllocationRow
{
    target: string;
    actions: WorkerAction[];
    workers: number;
    threadsByAction: Partial<Record<WorkerAction, number>>;
    ram: number;
    minDelayMs: number;
    maxDelayMs: number;
}