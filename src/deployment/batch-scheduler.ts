import { Server, Player } from "@ns";
import { Context } from "src/models/context";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { WorkerAction, MAX_ACTIVE_BATCHES_PER_TARGET, TargetState } from "src/utils/constants";

type ActiveBatch = {
    batchId: string;
    target: string;
    finishAt: number;
    jobs: WorkerJob[];
};

export class BatchScheduler
{
    private readonly activeBatches = new Map<string, ActiveBatch[]>();
    private nextBatchSequence = 1;

    constructor(private readonly context: Context) {}

    public getAvailableTargets(targets: TargetInfo[]): TargetInfo[]
    {
        this.removeFinishedBatches();

        return targets.filter(target =>
            (this.activeBatches.get(target.hostname)?.length ?? 0) < this.getMaxActiveBatches(target)
        );
    }

    public register(jobs: WorkerJob[], targets: TargetInfo[]): void
    {
        this.removeFinishedBatches();

        const registeredAt = Date.now();
        const targetsByHostname = new Map(targets.map(target => [target.hostname, target]));
        const jobsByTarget = this.groupBatchJobsByTarget(jobs);

        for (const [target, targetJobs] of jobsByTarget) {
            const targetInfo = targetsByHostname.get(target);

            if (undefined === targetInfo) {
                continue;
            }

            const targetBatches = this.activeBatches.get(target) ?? [];

            if (this.getMaxActiveBatches(targetInfo) <= targetBatches.length) {
                continue;
            }

            const batchId = this.createBatchId(target, registeredAt);

            for (const job of targetJobs) {
                job.batchId = batchId;
            }

            this.activeBatches.set(target, [...targetBatches, {
                batchId,
                target,
                finishAt: this.calculateFinishAt(targetInfo, targetJobs),
                jobs: targetJobs,
            }]);
        }
    }

    public getProtectedJobs(jobs: WorkerJob[]): WorkerJob[]
    {
        this.removeFinishedBatches();

        return this.getActiveBatchJobs();
    }

    private groupBatchJobsByTarget(jobs: WorkerJob[]): Map<string, WorkerJob[]>
    {
        const jobsByTarget = new Map<string, WorkerJob[]>();

        for (const job of jobs) {
            if (WorkerAction.Share === job.action) {
                continue;
            }

            jobsByTarget.set(
                job.target,
                [...(jobsByTarget.get(job.target) ?? []), job],
            );
        }

        return jobsByTarget;
    }

    private createBatchId(target: string, registeredAt: number): string
    {
        const batchId = `${target}:${registeredAt}:${this.nextBatchSequence}`;

        this.nextBatchSequence++;

        return batchId;
    }

    private calculateFinishAt(target: TargetInfo, jobs: WorkerJob[]): number
    {
        const player = this.context.getPlayer();
        const server = this.context.toFormulaServer(target);
        let longestRuntime = 0;

        for (const job of jobs) {
            longestRuntime = Math.max(
                longestRuntime,
                job.delayMs + this.calculateActionTime(job.action, server, player),
            );
        }

        return Date.now() + longestRuntime;
    }

    private calculateActionTime(action: WorkerAction, server: Server, player: Player): number
    {
        if (WorkerAction.Hack === action) {
            return this.context.ns.formulas.hacking.hackTime(server, player);
        }

        if (WorkerAction.Grow === action) {
            return this.context.ns.formulas.hacking.growTime(server, player);
        }

        if (WorkerAction.Weaken === action) {
            return this.context.ns.formulas.hacking.weakenTime(server, player);
        }

        return 0;
    }

    private getMaxActiveBatches(target: TargetInfo): number
    {
        return TargetState.Farm === target.state ? MAX_ACTIVE_BATCHES_PER_TARGET : 1;
    }

    private getActiveBatchJobs(): WorkerJob[]
    {
        return [...this.activeBatches.values()]
            .flatMap(batches => batches)
            .flatMap(batch => batch.jobs);
    }

    private removeFinishedBatches(): void
    {
        const now = Date.now();

        for (const [target, batches] of this.activeBatches) {
            const ongoingBatches = batches.filter(batch => batch.finishAt > now );

            if (ongoingBatches.length <= 0) {
                this.activeBatches.delete(target);
                continue;
            }

            this.activeBatches.set(target, ongoingBatches);
        }
    }
}
