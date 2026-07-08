import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";

export interface DashboardSnapshot
{
    createdAt: number;
    totalWorkerRam: number;
    availableWorkerRam: number;
    plannedRam: number;
    targets: TargetInfo[];
    jobs: WorkerJob[];
}