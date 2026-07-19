import { Alignment } from "src/debug/cell-alignment";
import { AllocationRow } from "src/debug/reports/allocation-row";
import { TargetRow } from "src/debug/reports/target-row";
import { Table } from "src/debug/table";
import { Context } from "src/models/context";
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { SCRIPT_MAP, TargetState, WorkerAction } from "src/utils/constants";
import { LandingTelemetrySample } from "src/models/landing-telemetry-sample";
import { LandingTelemetryRow } from "src/debug/reports/landing-telemetry-row";
import { LandingTelemetrySnapshot } from "src/models/landing-telemetry-snapshot";
import { LandingTelemetryOperation } from "src/models/landing-telemetry-operation";
import { LandingOrderRow } from "src/debug/reports/landing-order-row";

type LandingOrderSample = {
    transition: string;
    gapMs: number;
    target: string;
    batchId: string;
};

export class DebugReporter
{
    constructor(private readonly context: Context) {}

    public report(
        servers: ServerInfo[],
        targets: TargetInfo[],
        jobs: WorkerJob[],
        landingTelemetry: LandingTelemetrySnapshot,
    ): void
    {
        this.reportTargets(targets, jobs);
        this.reportAllocation(jobs);
        this.reportLandingTelemetry(landingTelemetry);
        this.reportLandingOrder(landingTelemetry);
        this.reportWorkers(servers);
        //this.reportStaleWorkers(servers, jobs);
    }

    private reportLandingOrder(telemetry: LandingTelemetrySnapshot): void
    {
        const samples = this.createLandingOrderSamples(telemetry);

        if (samples.length <= 0) {
            return;
        }

        this.printLandingOrder(this.buildLandingOrderReport(samples), samples);
    }

    private createLandingOrderSamples(telemetry: LandingTelemetrySnapshot): LandingOrderSample[]
    {
        const operationsByBatch = new Map<string, LandingTelemetryOperation[]>();

        for (const operation of telemetry.operations) {
            operationsByBatch.set(
                operation.batchId,
                [...(operationsByBatch.get(operation.batchId) ?? []), operation],
            );
        }

        const samples: LandingOrderSample[] = [];

        for (const operations of operationsByBatch.values()) {
            const orderedOperations = operations.sort(
                (left, right) => left.expectedLandingAt - right.expectedLandingAt
            );

            for (let operationIndex = 0; operationIndex < orderedOperations.length - 1; operationIndex++) {
                const currentOperation = orderedOperations[operationIndex];
                const nextOperation = orderedOperations[operationIndex + 1];
                const currentLandingTimes = this.getCompleteOperationLandingTimes(currentOperation, telemetry);
                const nextLandingTimes = this.getCompleteOperationLandingTimes(nextOperation, telemetry);

                if (null === currentLandingTimes || null === nextLandingTimes) {
                    continue;
                }

                samples.push({
                    transition: `${currentOperation.action} → ${nextOperation.action}`,
                    gapMs: Math.min(...nextLandingTimes) - Math.max(...currentLandingTimes),
                    target: currentOperation.target,
                    batchId: currentOperation.batchId,
                });
            }
        }

        return samples;
    }

    private getCompleteOperationLandingTimes(
        operation: LandingTelemetryOperation,
        telemetry: LandingTelemetrySnapshot,
    ): number[] | null
    {
        const landingTimes = telemetry.samples
            .filter(sample =>
                sample.batchId === operation.batchId
                && sample.operationIndex === operation.operationIndex
            )
            .map(sample => sample.landedAt);

        return landingTimes.length === operation.expectedFragments ? landingTimes : null;
    }

    private buildLandingOrderReport(samples: LandingOrderSample[]): LandingOrderRow[]
    {
        const samplesByTransition = new Map<string, LandingOrderSample[]>();

        for (const sample of samples) {
            samplesByTransition.set(
                sample.transition,
                [...(samplesByTransition.get(sample.transition) ?? []), sample],
            );
        }

        return [...samplesByTransition.entries()].map(([transition, transitionSamples]) => {
            const worstSample = transitionSamples.reduce((worst, sample) =>
                sample.gapMs < worst.gapMs ? sample : worst
            );

            return {
                transition,
                samples: transitionSamples.length,
                averageGapMs: transitionSamples.reduce((sum, sample) => sum + sample.gapMs, 0)
                    / transitionSamples.length,
                minimumGapMs: worstSample.gapMs,
                maximumGapMs: Math.max(...transitionSamples.map(sample => sample.gapMs)),
                orderViolations: transitionSamples.filter(sample => sample.gapMs <= 0).length,
                worstTarget: worstSample.target,
            };
        });
    }

    private printLandingOrder(rows: LandingOrderRow[], samples: LandingOrderSample[]): void
    {
        this.printSection("Landing Order (60s)");

        const table = new Table()
            .column("Transition")
            .column("Samples", undefined, Alignment.Right)
            .column("Average gap", undefined, Alignment.Right)
            .column("Minimum", undefined, Alignment.Right)
            .column("Maximum", undefined, Alignment.Right)
            .column("Violations", undefined, Alignment.Right)
            .column("Worst target");

        for (const row of rows) {
            table.row(
                row.transition,
                row.samples.toString(),
                this.formatGapMilliseconds(row.averageGapMs),
                this.formatGapMilliseconds(row.minimumGapMs),
                this.formatGapMilliseconds(row.maximumGapMs),
                row.orderViolations.toString(),
                row.worstTarget,
            );
        }

        this.printTable(table);

        const worstSample = samples.reduce((worst, sample) =>
            sample.gapMs < worst.gapMs ? sample : worst
        );

        this.print(
            `Worst batch: ${worstSample.target} | ${worstSample.transition} | `
            + `${this.formatGapMilliseconds(worstSample.gapMs)} | ${worstSample.batchId}`
        );
    }

    private reportLandingTelemetry(telemetry: LandingTelemetrySnapshot): void
    {
        if (telemetry.operations.length <= 0 && telemetry.samples.length <= 0) {
            return;
        }

        this.printLandingTelemetry(
            this.buildLandingTelemetryReport(telemetry),
            telemetry.unmatchedEvents,
            telemetry.portWriteFailures,
        );
    }

    private buildLandingTelemetryReport(telemetry: LandingTelemetrySnapshot): LandingTelemetryRow[]
    {
        const samples = telemetry.samples;
        const samplesByAction = new Map<WorkerAction, LandingTelemetrySample[]>();

        for (const sample of samples) {
            samplesByAction.set(
                sample.action,
                [...(samplesByAction.get(sample.action) ?? []), sample],
            );
        }

        const actions = new Set(telemetry.operations.map(operation => operation.action));

        return [...actions].map(action => {
            const actionOperations = telemetry.operations.filter(operation => operation.action === action);
            const actionSamples = samplesByAction.get(action) ?? [];
            const expectedFragments = actionOperations.reduce(
                (sum, operation) => sum + operation.expectedFragments,
                0,
            );

            return {
                action,
                operations: actionOperations.length,
                expectedFragments,
                reportedFragments: actionSamples.length,
                missingFragments: Math.max(0, expectedFragments - actionSamples.length),
                averageDriftMs: this.calculateAverageDrift(actionSamples),
                minimumDriftMs: this.calculateMinimumDrift(actionSamples),
                maximumDriftMs: this.calculateMaximumDrift(actionSamples),
                maximumFragmentSpreadMs: this.calculateMaximumFragmentSpread(actionSamples),
            };
        });
    }

    private calculateAverageDrift(samples: LandingTelemetrySample[]): number
    {
        if (samples.length <= 0) {
            return 0;
        }

        return samples.reduce((sum, sample) => sum + sample.driftMs, 0) / samples.length;
    }

    private calculateMinimumDrift(samples: LandingTelemetrySample[]): number
    {
        return samples.length <= 0 ? 0 : Math.min(...samples.map(sample => sample.driftMs));
    }

    private calculateMaximumDrift(samples: LandingTelemetrySample[]): number
    {
        return samples.length <= 0 ? 0 : Math.max(...samples.map(sample => sample.driftMs));
    }

    private calculateMaximumFragmentSpread(samples: LandingTelemetrySample[]): number
    {
        const landingTimesByOperation = new Map<string, number[]>();

        for (const sample of samples) {
            const operationKey = `${sample.batchId}|${sample.operationIndex}`;

            landingTimesByOperation.set(
                operationKey,
                [...(landingTimesByOperation.get(operationKey) ?? []), sample.landedAt],
            );
        }

        return [...landingTimesByOperation.values()].reduce((maximumSpread, landingTimes) => {
            const spread = Math.max(...landingTimes) - Math.min(...landingTimes);

            return Math.max(maximumSpread, spread);
        }, 0);
    }

    private printLandingTelemetry(
        rows: LandingTelemetryRow[],
        unmatchedEvents: number,
        portWriteFailures: number,
    ): void
    {
        this.printSection("Landing Telemetry (60s)");

        const table = new Table()
            .column("Action")
            .column("Operations", undefined, Alignment.Right)
            .column("Fragments", undefined, Alignment.Right)
            .column("Missing", undefined, Alignment.Right)
            .column("Average drift", undefined, Alignment.Right)
            .column("Minimum", undefined, Alignment.Right)
            .column("Maximum", undefined, Alignment.Right)
            .column("Max fragment spread", undefined, Alignment.Right);

        for (const row of rows) {
            table.row(
                row.action,
                row.operations.toString(),
                `${row.reportedFragments} / ${row.expectedFragments}`,
                row.missingFragments.toString(),
                this.formatSignedMilliseconds(row.averageDriftMs),
                this.formatSignedMilliseconds(row.minimumDriftMs),
                this.formatSignedMilliseconds(row.maximumDriftMs),
                this.formatMilliseconds(row.maximumFragmentSpreadMs),
            );
        }

        this.printTable(table);
        this.print(`Unmatched events: ${unmatchedEvents} | Port write failures: ${portWriteFailures}`);
    }

    private reportTargets(targets: TargetInfo[], jobs: WorkerJob[]): void
    {
        this.printTargets(this.buildTargetsReport(this.filterReportedTargets(targets, jobs)));
    }

    private filterReportedTargets(targets: TargetInfo[], jobs: WorkerJob[]): TargetInfo[]
    {
        const usedTargets = new Set(jobs
            .filter(job => "Share" !== job.target)
            .map(job => job.target)
        );

        return targets.filter(target =>
            usedTargets.has(target.hostname)
            || TargetState.Farm === target.state
        );
    }

    private buildTargetsReport(targets: TargetInfo[]): TargetRow[]
    {
        return targets.map(target => ({
            target: target.hostname,
            state: target.state,
            score: target.score,
            priority: target.priority,
            currentMoney: target.currentMoney,
            maxMoney: target.maxMoney,
            currentSecurity: target.currentSecurity,
            minSecurity: target.minSecurity,
        }));
    }

    private printTargets(rows: TargetRow[]): void
    {
        const ns = this.context.ns;
        this.printSection("Targets");

        const table = new Table()
            .column("Target")
            .column("State")
            .column("Score", undefined, Alignment.Right)
            .column("Priority", undefined, Alignment.Right)
            .column("Money", undefined, Alignment.Right)
            .column("Security", undefined, Alignment.Right);

        for (const row of rows) {
            table.row(
                row.target,
                row.state,
                ns.format.number(row.score),
                ns.format.number(row.priority),
                `${ns.format.number(row.currentMoney)} / ${ns.format.number(row.maxMoney)}`,
                `${row.currentSecurity.toFixed(2)} / ${row.minSecurity.toFixed(2)}`
            );
        }

        this.printTable(table);
    }

    private reportAllocation(jobs: WorkerJob[]): void
    {
        this.printAllocation(this.buildAllocationReport(jobs));
    }

    private buildAllocationReport(jobs: WorkerJob[]): AllocationRow[]
    {
        const rows = new Map<string, AllocationRow>();
        const batchIdsByTarget = new Map<string, Set<string>>();
        const operationKeysByTarget = new Map<string, Set<string>>();

        for (const job of jobs) {
            const batchIds = batchIdsByTarget.get(job.target) ?? new Set<string>();
            const operationKeys = operationKeysByTarget.get(job.target) ?? new Set<string>();

            if (undefined !== job.batchId && undefined !== job.operationIndex) {
                batchIds.add(job.batchId);
                operationKeys.add(`${job.batchId}|${job.operationIndex}`);
            }

            batchIdsByTarget.set(job.target, batchIds);
            operationKeysByTarget.set(job.target, operationKeys);
            const row = rows.get(job.target);

            if (row) {
                row.batches = batchIds.size;
                row.operations = operationKeys.size;
                row.processes++;
                row.actions = (row.actions.includes(job.action)) ? row.actions : [...row.actions, job.action];
                row.threadsByAction[job.action] = (row.threadsByAction[job.action] ?? 0) + job.threads;
                row.ram += job.allocatedRam;
                row.minimumAdditionalMsec = Math.min(row.minimumAdditionalMsec, job.additionalMsec);
                row.maximumAdditionalMsec = Math.max(row.maximumAdditionalMsec, job.additionalMsec);

                continue;
            }

            rows.set(job.target, {
                target: job.target,
                batches: batchIds.size,
                operations: operationKeys.size,
                actions: [job.action],
                processes: 1,
                threadsByAction: { [job.action]: job.threads },
                ram: job.allocatedRam,
                minimumAdditionalMsec: job.additionalMsec,
                maximumAdditionalMsec: job.additionalMsec,
            });
        }

        return [...rows.values()];
    }

    private printAllocation(rows: AllocationRow[]): void
    {
        const ns = this.context.ns;
        this.printSection("Allocation");

        const table = new Table()
            .column("Target")
            .column("Batches", undefined, Alignment.Right)
            .column("Operations", undefined, Alignment.Right)
            .column("Action types")
            .column("Processes", undefined, Alignment.Right)
            .column("Threads", undefined, Alignment.Right)
            .column("Additional", undefined, Alignment.Right)
            .column("RAM", undefined, Alignment.Right);

        for (const row of rows) {
            table.row(
                row.target,
                row.batches.toString(),
                row.operations.toString(),
                this.formatActions(row.actions),
                row.processes.toString(),
                this.formatThreadsByAction(row.threadsByAction),
                this.formatAdditionalMsec(row.minimumAdditionalMsec, row.maximumAdditionalMsec),
                ns.format.ram(row.ram)
            );
        }

        this.printTable(table);
    }

    private reportWorkers(servers: ServerInfo[]): void
    {
        const actionCounts = new Map<string, number>();

        let total = 0;
        let active = 0;
        let idle = 0;
        let processes = 0;

        for (const server of servers) {
            if (!server.rooted) {
                continue;
            }

            total++;

            const running = this.context.ns.ps(server.hostname);

            if (running.length === 0) {
                idle++;
                continue;
            }

            active++;
            processes += running.length;

            for (const process of running) {
                const action = this.getActionFromFilename(process.filename);

                actionCounts.set(
                    action,
                    (actionCounts.get(action) ?? 0) + 1
                );
            }
        }

        this.printSection("Workers");

        const table = new Table()
            .column("Metric")
            .column("Value", undefined, Alignment.Right);

        table.row("Total", total.toString());
        table.row("Active", active.toString());
        table.row("Idle", idle.toString());
        table.row("Processes", processes.toString());

        for (const [action, count] of actionCounts) {
            table.row(action, count.toString());
        }

        this.printTable(table);
    }

    private reportStaleWorkers(servers: ServerInfo[], jobs: WorkerJob[]): void
    {
        const usedHosts = new Set(jobs.map(job => job.hostname));
        const staleHosts: string[] = [];

        for (const server of servers) {
            if (!server.rooted) {
                continue;
            }

            if (usedHosts.has(server.hostname)) {
                continue;
            }

            if (this.context.ns.ps(server.hostname).length === 0) {
                continue;
            }

            staleHosts.push(server.hostname);
        }

        if (staleHosts.length === 0) {
            return;
        }

        this.printSection("Stale Workers");

        const table = new Table()
            .column("Host");

        for (const host of staleHosts) {
            table.row(host);
        }

        this.printTable(table);
    }

    public getRunningShareMetrics(servers: ServerInfo[]): {threads: number; ram: number;}
    {
        const shareScript = SCRIPT_MAP[WorkerAction.Share];
        let threads = 0;
        let ram = 0;

        for (const server of servers) {
            for (const process of this.context.ns.ps(server.hostname)) {
                if (process.filename !== shareScript) {
                    continue;
                }

                threads += process.threads;
                ram += process.threads
                    * this.context.ns.getScriptRam(shareScript, server.hostname);
            }
        }

        return { threads, ram };
    }

    private formatActions(actions: string[]): string
    {
        return actions.join("/");
    }

    private formatThreadsByAction(threadsByAction: Partial<Record<WorkerAction, number>>): string
    {
        return Object.entries(threadsByAction)
            .map(([action, threads]) => `${action[0]}${threads}`)
            .join("/");
    }

    private formatAdditionalMsec(minimumAdditionalMsec: number, maximumAdditionalMsec: number): string
    {
        if (minimumAdditionalMsec === maximumAdditionalMsec) {
            return this.formatMilliseconds(minimumAdditionalMsec);
        }

        return `${this.formatMilliseconds(minimumAdditionalMsec)} - ${this.formatMilliseconds(maximumAdditionalMsec)}`;
    }

    private formatMilliseconds(value: number): string
    {
        if (value <= 0) {
            return "0ms";
        }

        if (value < 1000) {
            return `${Math.round(value)}ms`;
        }

        return `${(value / 1000).toFixed(1)}s`;
    }

    private formatSignedMilliseconds(value: number): string
    {
        const roundedValue = Math.round(value);

        if (roundedValue > 0) {
            return `+${this.formatMilliseconds(roundedValue)}`;
        }

        if (roundedValue < 0) {
            return `-${this.formatMilliseconds(Math.abs(roundedValue))}`;
        }

        return "0ms";
    }

    private formatGapMilliseconds(value: number): string
    {
        if (value < 0) {
            return `-${this.formatMilliseconds(Math.abs(value))}`;
        }

        return this.formatMilliseconds(value);
    }

    private getActionFromFilename(filename: string): string {
        if (filename.includes("hack")) {
            return "hack";
        }

        if (filename.includes("grow")) {
            return "grow";
        }

        if (filename.includes("weaken")) {
            return "weaken";
        }

        if (filename.includes("share")) {
            return "share";
        }

        return "other";
    }

    private print(message: string): void
    {
        this.context.ns.print(message);
    }

    private printSection(title: string): void
    {
        this.print(" ");
        this.print(`===== ${title.toUpperCase()} =====`);
    }

    private printTable(table: Table): void
    {
        for (const line of table.render()) {
            this.print(line);
        }
    }
}
