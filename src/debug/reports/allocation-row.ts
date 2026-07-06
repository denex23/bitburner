import { WorkerAction } from "src/utils/constants";

export interface AllocationRow
{
    target: string;
    action: string;
    workers: number;
    threads: number;
    ram: number;
    minDelayMs: number;
    maxDelayMs: number;
}