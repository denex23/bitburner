import { Alignment } from "src/debug/cell-alignment";
import { AllocationRow } from "src/debug/reports/allocation-row";
import { TargetRow } from "./reports/target-row";
import { Table } from "src/debug/table";
import { Context } from "src/models/context";
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";

export class DebugReporter 
{
    constructor(private readonly context: Context) {}

    public report(servers: ServerInfo[], targets: TargetInfo[], jobs: WorkerJob[]): void
    {
        this.printDate();
        this.reportTargets(targets);
        this.reportAllocation(jobs);
        this.reportWorkers(servers);
        this.reportStaleWorkers(servers, jobs);
    }

    private reportTargets(targets: TargetInfo[]): void
    {
        this.printTargets(this.buildTargetsReport(targets));
        
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
        this.printAllocation(this.buildAllocationReport(jobs))
    }

    private buildAllocationReport(jobs: WorkerJob[]): AllocationRow[]
    {
        const rows = new Map<string, AllocationRow>();

        for (const job of jobs) {
            const row = rows.get(job.target);

            if (row) {
                row.workers++;
                row.threads += job.threads;
                row.ram += job.allocatedRam;

                continue;
            }

            rows.set(job.target, {
                target: job.target,
                action: job.action,
                workers: 1,
                threads: job.threads,
                ram: job.allocatedRam,
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
            .column("Action")
            .column("Workers", undefined, Alignment.Right)
            .column("Threads", undefined, Alignment.Right)
            .column("RAM", undefined, Alignment.Right);

        for (const row of rows) {
            table.row(
                row.target,
                row.action,
                row.workers.toString(),
                row.threads.toString(),
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
            if (server.hostname === "home" || !server.rooted) {
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
            if (server.hostname === "home" || !server.rooted) {
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

        return "other";
    }

    private print(message: string): void 
    {
        this.context.ns.tprint(message);
    }

    private printDate(): void
    {
        const date = new Date(Date.now()); 
        const locale: Intl.LocalesArgument = "de-DE";

        this.print(date.toLocaleString(locale));
    }

    private printSection(title: string): void 
    {
        this.print("");
        this.print(`===== ${title.toUpperCase()} =====`);
    }

    private printTable(table: Table): void 
    {
        for (const line of table.render()) {
            this.print(line);
        }
    }
}