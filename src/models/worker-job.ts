import { WorkerAction } from "/src/utils/constants";

export interface WorkerJob {
    hostname: string;
    target: string;
    action: WorkerAction;
    threads: number;
    allocatedRam: number;
}