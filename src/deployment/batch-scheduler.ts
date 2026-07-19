import { Context } from "src/models/context";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { ScheduledBatchOperation } from "src/models/scheduled-batch-operation";
import { WorkerAction, MAX_ACTIVE_BATCHES_PER_TARGET, TargetState } from "src/utils/constants";
import { ScheduledOperationFragment } from "src/models/scheduled-operation-fragment";
import { TargetSimulator } from "src/deployment/target-simulator";

type ActiveBatch = {
    batchId: string;
    target: string;
    finishAt: number;
    jobs: WorkerJob[];
    operations: ScheduledBatchOperation[];
};

export class BatchScheduler
{
    private readonly targetSimulator: TargetSimulator;
    private readonly activeBatches = new Map<string, ActiveBatch[]>();
    private nextBatchSequence = 1;

    constructor(private readonly context: Context) {
        this.targetSimulator = new TargetSimulator(context);
    }

    public getAvailableTargets(targets: TargetInfo[]): TargetInfo[]
    {
        this.removeFinishedBatches();

        return targets.filter(target =>
            (this.activeBatches.get(target.hostname)?.length ?? 0) < this.getMaxActiveBatches(target)
        );
    }

    public register(jobs: WorkerJob[], targets: TargetInfo[], pendingOperations: ScheduledBatchOperation[]): void
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

            const operations = this.createScheduledOperations(
                batchId,
                target,
                targetInfo,
                targetJobs,
                registeredAt,
                pendingOperations,
            );

            this.activeBatches.set(target, [...targetBatches, {
                batchId,
                target,
                finishAt: this.calculateFinishAt(operations, registeredAt),
                jobs: targetJobs,
                operations,
            }]);
        }
    }

    public getPendingOperations(): ScheduledBatchOperation[]
    {
        this.removeFinishedBatches();

        const now = Date.now();

        return [...this.activeBatches.values()]
            .flatMap(batches => batches)
            .flatMap(batch => batch.operations)
            .filter(operation => operation.landingAt > now);
    }

    public getProtectedJobs(jobs: WorkerJob[]): WorkerJob[]
    {
        this.removeFinishedBatches();

        return this.getActiveBatchJobs();
    }

    private createScheduledOperations(
        batchId: string,
        target: string,
        targetInfo: TargetInfo,
        jobs: WorkerJob[],
        registeredAt: number,
        pendingOperations: ScheduledBatchOperation[],
    ): ScheduledBatchOperation[]
    {
        const operationsByKey = new Map<string, ScheduledBatchOperation>();

        for (const job of jobs) {
            const operationKey = `${job.action}|${job.delayMs}`;
            const operation = operationsByKey.get(operationKey);
            const fragment: ScheduledOperationFragment = {
                hostname: job.hostname,
                threads: job.threads,
                cpuCores: this.context.getServer(job.hostname).cpuCores,
            };

            if (undefined !== operation) {
                operation.threads += job.threads;
                operation.fragments.push(fragment);

                continue;
            }

            const startsAt = registeredAt + job.delayMs;

            operationsByKey.set(operationKey, {
                batchId,
                target,
                action: job.action,
                threads: job.threads,
                startsAt,
                landingAt: startsAt + this.targetSimulator.calculateActionTimeAt(
                    targetInfo,
                    pendingOperations,
                    job.action,
                    startsAt,
                ),
                fragments: [fragment],
            });
        }

        return this.calculateLandingTimes(
            targetInfo,
            pendingOperations,
            [...operationsByKey.values()],
        );
    }

    private calculateLandingTimes(
        target: TargetInfo,
        pendingOperations: ScheduledBatchOperation[],
        operations: ScheduledBatchOperation[],
    ): ScheduledBatchOperation[]
    {
        const timelineOperations = pendingOperations.filter(operation => operation.target === target.hostname);
        const operationsByStart = [...operations].sort((left, right) => left.startsAt - right.startsAt);
        const scheduledOperations: ScheduledBatchOperation[] = [];

        for (const operation of operationsByStart) {
            const scheduledOperation = {
                ...operation,
                landingAt: operation.startsAt
                    + this.targetSimulator.calculateActionTimeAt(
                        target,
                        timelineOperations,
                        operation.action,
                        operation.startsAt,
                    ),
            };

            timelineOperations.push(scheduledOperation);
            scheduledOperations.push(scheduledOperation);
        }

        return scheduledOperations
            .sort((left, right) => left.landingAt - right.landingAt);
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

    private calculateFinishAt(operations: ScheduledBatchOperation[], registeredAt: number): number
    {
        return operations.reduce(
            (latestLandingAt, operation) => Math.max(latestLandingAt, operation.landingAt), registeredAt
        );
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
