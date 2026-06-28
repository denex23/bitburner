import { WorkerAction } from "src/utils/constants";

export interface AllocationRow
{
    target: string,
    action: WorkerAction,
    workers: number,
    threads: number,
    ram: number,
}