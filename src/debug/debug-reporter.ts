import { Alignment } from "src/debug/cell-alignment";
import { AllocationRow } from "src/debug/reports/allocation-row";
import { TargetRow } from "src/debug/reports/target-row";
import { Table } from "src/debug/table";
import { Context } from "src/models/context";
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { SCRIPT_MAP, TargetState, WorkerAction } from "src/utils/constants";

export class DebugReporter 
{
    constructor(private readonly context: Context) {}

    public report(servers: ServerInfo[], targets: TargetInfo[], jobs: WorkerJob[]): void
    {
        this.reportTargets(targets, jobs);
        this.reportAllocation(jobs);
        this.reportWorkers(servers);
        //this.reportStaleWorkers(servers, jobs);
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

            if (undefined !== job.batchId) {
                batchIds.add(job.batchId);
                operationKeys.add(`${job.batchId}|${job.action}|${job.delayMs}`);
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
                row.minDelayMs = Math.min(row.minDelayMs, job.delayMs);
                row.maxDelayMs = Math.max(row.maxDelayMs, job.delayMs);

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
                minDelayMs: job.delayMs,
                maxDelayMs: job.delayMs,
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
            .column("Delay", undefined, Alignment.Right)
            .column("RAM", undefined, Alignment.Right);

        for (const row of rows) {
            table.row(
                row.target,
                row.batches.toString(),
                row.operations.toString(),
                this.formatActions(row.actions),
                row.processes.toString(),
                this.formatThreadsByAction(row.threadsByAction),
                this.formatDelay(row.minDelayMs, row.maxDelayMs),
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

    private formatDelay(minDelayMs: number, maxDelayMs: number): string
    {
        if (minDelayMs === maxDelayMs) {
            return this.formatMilliseconds(minDelayMs);
        }

        return `${this.formatMilliseconds(minDelayMs)} - ${this.formatMilliseconds(maxDelayMs)}`;
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
