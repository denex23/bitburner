import { Context } from "src/models/context";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { ScheduledBatchOperation } from "src/models/scheduled-batch-operation";
import {
    LANDING_TELEMETRY_WINDOW_MS,
    LANDING_TELEMETRY_GRACE_MS,
    MAX_ACTIVE_BATCHES_PER_TARGET,
    TargetState,
    WorkerAction,
    WORKER_COMPLETION_FAILURE_PORT,
    WORKER_COMPLETION_PORTS,
} from "src/utils/constants";
import { ScheduledOperationFragment } from "src/models/scheduled-operation-fragment";
import { TargetSimulator } from "src/deployment/target-simulator";
import { WorkerCompletionEvent } from "src/models/worker-completion-event";
import { LandingTelemetrySample } from "src/models/landing-telemetry-sample";
import { LandingTelemetryOperation } from "src/models/landing-telemetry-operation";
import { LandingTelemetrySnapshot } from "src/models/landing-telemetry-snapshot";

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
    private recentScheduledOperations: ScheduledBatchOperation[] = [];
    private landingTelemetrySamples: LandingTelemetrySample[] = [];
    private unmatchedTelemetryEvents: number[] = [];
    private portWriteFailures: number[] = [];
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

    public collectLandingTelemetry(): void
    {
        for (const port of WORKER_COMPLETION_PORTS) {
            this.collectLandingTelemetryFromPort(port);
        }

        this.collectPortWriteFailures();

        this.removeExpiredTelemetryData();
    }

    public getLandingTelemetrySnapshot(): LandingTelemetrySnapshot
    {
        this.removeExpiredTelemetryData();

        const now = Date.now();
        const oldestExpectedLandingAt = now - LANDING_TELEMETRY_WINDOW_MS;
        const latestExpectedLandingAt = now - LANDING_TELEMETRY_GRACE_MS;
        const operations = this.getRecentScheduledOperations()
            .filter(operation =>
                operation.landingAt >= oldestExpectedLandingAt
                && operation.landingAt <= latestExpectedLandingAt
            )
            .map<LandingTelemetryOperation>(operation => ({
                batchId: operation.batchId,
                target: operation.target,
                action: operation.action,
                additionalMsec: operation.additionalMsec,
                expectedLandingAt: operation.landingAt,
                expectedFragments: operation.fragments.length,
            }));
        const operationKeys = new Set(operations.map(operation => this.createOperationKey(operation)));

        return {
            operations,
            samples: this.landingTelemetrySamples.filter(sample =>
                operationKeys.has(this.createOperationKey(sample))
            ),
            unmatchedEvents: this.unmatchedTelemetryEvents.length,
            portWriteFailures: this.portWriteFailures.length,
        };
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
            const operationKey = `${job.action}|${job.additionalMsec}`;
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

            const startsAt = registeredAt;

            operationsByKey.set(operationKey, {
                batchId,
                target,
                action: job.action,
                threads: job.threads,
                startsAt,
                additionalMsec: job.additionalMsec,
                landingAt: startsAt + this.targetSimulator.calculateActionTimeAt(
                    targetInfo,
                    pendingOperations,
                    job.action,
                    startsAt,
                ) + job.additionalMsec,
                fragments: [fragment],
            });
        }

        return [...operationsByKey.values()]
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

    private collectLandingTelemetryFromPort(port: number): void
    {
        const ns = this.context.ns;

        while (true) {
            const portData: unknown = ns.readPort(port);

            if ("NULL PORT DATA" === portData) {
                return;
            }

            if (false === this.isWorkerCompletionEvent(portData)) {
                continue;
            }

            const operation = this.findScheduledOperation(portData);

            if (undefined === operation) {
                this.unmatchedTelemetryEvents.push(portData.landedAt);
                continue;
            }

            const fragmentWasScheduled = operation.fragments.some(fragment =>
                fragment.hostname === portData.hostname
                && fragment.threads === portData.threads
            );

            if (false === fragmentWasScheduled) {
                this.unmatchedTelemetryEvents.push(portData.landedAt);
                continue;
            }

            const fragmentWasAlreadyReported = this.landingTelemetrySamples.some(sample =>
                sample.batchId === portData.batchId
                && sample.action === portData.action
                && sample.additionalMsec === portData.additionalMsec
                && sample.hostname === portData.hostname
                && sample.threads === portData.threads
            );

            if (fragmentWasAlreadyReported) {
                this.unmatchedTelemetryEvents.push(portData.landedAt);
                continue;
            }

            this.landingTelemetrySamples.push({
                ...portData,
                expectedLandingAt: operation.landingAt,
                driftMs: portData.landedAt - operation.landingAt,
            });
        }
    }

    private collectPortWriteFailures(): void
    {
        const ns = this.context.ns;

        while (true) {
            const portData: unknown = ns.readPort(WORKER_COMPLETION_FAILURE_PORT);

            if ("NULL PORT DATA" === portData) {
                return;
            }

            if ("number" === typeof portData && Number.isFinite(portData)) {
                this.portWriteFailures.push(portData);
            }
        }
    }

    private getRecentScheduledOperations(): ScheduledBatchOperation[]
    {
        return [
            ...[...this.activeBatches.values()]
                .flatMap(batches => batches)
                .flatMap(batch => batch.operations),
            ...this.recentScheduledOperations,
        ];
    }

    private createOperationKey(operation: {
        batchId: string;
        action: WorkerAction;
        additionalMsec: number;
    }): string
    {
        return `${operation.batchId}|${operation.action}|${operation.additionalMsec}`;
    }

    private findScheduledOperation(event: WorkerCompletionEvent): ScheduledBatchOperation | undefined
    {
        const activeOperation = [...this.activeBatches.values()]
            .flatMap(batches => batches)
            .find(batch => batch.batchId === event.batchId)
            ?.operations.find(operation =>
                operation.target === event.target
                && operation.action === event.action
                && operation.additionalMsec === event.additionalMsec
            );

        if (undefined !== activeOperation) {
            return activeOperation;
        }

        return this.recentScheduledOperations.find(operation =>
            operation.batchId === event.batchId
            && operation.target === event.target
            && operation.action === event.action
            && operation.additionalMsec === event.additionalMsec
        );
    }

    private isWorkerCompletionEvent(value: unknown): value is WorkerCompletionEvent
    {
        if ("object" !== typeof value || null === value) {
            return false;
        }

        const event = value as Partial<WorkerCompletionEvent>;

        return "string" === typeof event.batchId
            && "string" === typeof event.target
            && this.isBatchWorkerAction(event.action)
            && "string" === typeof event.hostname
            && "number" === typeof event.threads
            && Number.isFinite(event.threads)
            && "number" === typeof event.additionalMsec
            && Number.isFinite(event.additionalMsec)
            && "number" === typeof event.landedAt
            && Number.isFinite(event.landedAt);
    }

    private isBatchWorkerAction(action: unknown): action is WorkerAction
    {
        return WorkerAction.Hack === action
            || WorkerAction.Grow === action
            || WorkerAction.Weaken === action;
    }

    private removeExpiredTelemetryData(): void
    {
        const oldestTelemetryAt = Date.now() - LANDING_TELEMETRY_WINDOW_MS;

        this.landingTelemetrySamples = this.landingTelemetrySamples.filter(sample =>
            sample.expectedLandingAt >= oldestTelemetryAt
        );
        this.recentScheduledOperations = this.recentScheduledOperations.filter(operation =>
            operation.landingAt >= oldestTelemetryAt
        );
        this.unmatchedTelemetryEvents = this.unmatchedTelemetryEvents.filter(landedAt =>
            landedAt >= oldestTelemetryAt
        );
        this.portWriteFailures = this.portWriteFailures.filter(failedAt =>
            failedAt >= oldestTelemetryAt
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
            const ongoingBatches = batches.filter(batch => batch.finishAt > now);
            const finishedOperations = batches
                .filter(batch => batch.finishAt <= now)
                .flatMap(batch => batch.operations);

            this.recentScheduledOperations.push(...finishedOperations);

            if (ongoingBatches.length <= 0) {
                this.activeBatches.delete(target);
                continue;
            }

            this.activeBatches.set(target, ongoingBatches);
        }

        this.removeExpiredTelemetryData();
    }
}
