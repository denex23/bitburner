import { NS } from '@ns';
import { DASHBOARD_SNAPSHOT_FILE, TargetState, WorkerAction } from 'src/utils/constants';
import { DashboardSnapshot } from 'src/models/dashboard-snapshot';
import { TargetInfo } from '/src/models/target-info';
import { Table } from '/src/debug/table';
import { Alignment } from '/src/debug/cell-alignment';
import { TargetRow } from '/src/debug/reports/target-row';
import { WorkerJob } from '/src/models/worker-job';

const MONEY_ATTENTION_THRESHOLD = 0.95;
const SECURITY_ATTENTION_OFFSET = 0.5;

type TargetColumn = {
    title: string;
    alignment?: Alignment;
    value: (target: TargetInfo) => string;
};

export async function main(ns: NS): Promise<void>
{
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.setTailTitle("Dashboard");
    ns.ui.resizeTail(1000, 900);

    while (true) {
        ns.clearLog();

        const content = ns.read(DASHBOARD_SNAPSHOT_FILE);

        if (!content) {
            ns.print("Waiting for snapshot...");
            return;
        }

        const snapshot = JSON.parse(content) as DashboardSnapshot;
        printPlayerStats(ns);
        printSummary(ns, snapshot);
        printAttentionTarget(ns, snapshot.targets);
        printFarmTarget(ns, snapshot.targets);
        printPrepTarget(ns, snapshot.targets, snapshot.jobs);

        await ns.sleep(1000);
    }
}

function printPlayerStats(ns: NS): void
{
    const player = ns.getPlayer();

    printSection(ns, "Player Stats");
    ns.print(`Hack: ${player.skills.hacking}`);
    ns.print(`Money: ${ns.format.number(player.money)}€`);
}

function printSummary(ns: NS, snapshot: DashboardSnapshot): void
{
    printSection(ns, "Summary");
    ns.print(`Updated: ${snapshot.createdAt.toLocaleString("de-DE") }`)
    ns.print(`RAM: ${ns.format.ram(snapshot.plannedRam)} / ${ns.format.ram(snapshot.totalWorkerRam)} planned, ${ns.format.ram(snapshot.availableWorkerRam)} free`);
    ns.print(`Targets: ${filterFarmTargets(snapshot.targets).length} farm, ${filterPrepTargets(snapshot.targets).length} prep, ${filterAttentionTargets(snapshot.targets).length} attention`);
    ns.print(`Jobs: ${snapshot.jobs.length} total, ${filterShareJobs(snapshot.jobs).length} share`);
}

function printFarmTarget(ns: NS, targets: TargetInfo[]): void
{
    printTargetTable(
        ns,
        "Farm Targets",
        "WARN No Farm Targets!\n",
        filterFarmTargets(targets),
    );
}

function printPrepTarget(ns: NS, targets: TargetInfo[], jobs: WorkerJob[]): void
{
    printTargetTable(
        ns,
        "Prep Targets",
        "INFO No Prep Targets!\n",
        filterPrepTargets(targets),
        [{
            title: "Runtime",
            alignment: Alignment.Right,
            value: target => formatRemainingRuntime(ns, target, jobs),
        }],
    );
}

function printAttentionTarget(ns: NS, targets: TargetInfo[]): void
{
    printTargetTable(
        ns,
        "Attention Targets",
        "SUCCESS No Attention Targets!\n",
        filterAttentionTargets(targets),
    );
}

function filterPrepTargets(targets: TargetInfo[]): TargetInfo[]
{
    return targets
        .filter(target => TargetState.Farm !== target.state)
        .sort((a, b) => b.priority - a.priority);
}


function filterFarmTargets(targets: TargetInfo[]): TargetInfo[]
{
    return targets
        .filter(target => TargetState.Farm === target.state)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 10);
}

function filterAttentionTargets(targets: TargetInfo[]): TargetInfo[]
{
    return targets
        .filter(target =>
            TargetState.Farm === target.state
            && (
                target.currentMoney < target.maxMoney * MONEY_ATTENTION_THRESHOLD
                || target.currentSecurity > target.minSecurity + SECURITY_ATTENTION_OFFSET
            )
        )
        .sort((a, b) => b.priority - a.priority);
}

function printTargetTable(
    ns: NS,
    title: string,
    emptyMessage: string,
    targets: TargetInfo[],
    columns: TargetColumn[] = [],
): void
{
    if (targets.length <= 0) {
        ns.print(" ");
        ns.print(emptyMessage);
        return;
    }

    const table = new Table();
    buildTargetHeader(table);

    for (const column of columns) {
        table.column(column.title, undefined, column.alignment);
    }

    buildTargetRows(ns, table, targets, columns);

    printSection(ns, title);
    printTable(ns, table);
}

function buildTargetHeader(table: Table): void{
    table.column("Target")
        .column("State")
        .column("Score", undefined, Alignment.Right)
        .column("Priority", undefined, Alignment.Right)
        .column("Money", undefined, Alignment.Right)
        .column("Security", undefined, Alignment.Right);
}

function buildTargetRows(ns: NS, table: Table, targets: TargetInfo[], columns: TargetColumn[] = []): void
{
    for (const target of targets) {
        table.row(
            target.hostname,
            target.state,
            ns.format.number(target.score),
            ns.format.number(target.priority),
            `${ns.format.number(target.currentMoney)} / ${ns.format.number(target.maxMoney)}`,
            `${target.currentSecurity.toFixed(2)} / ${target.minSecurity.toFixed(2)}`,
            ...columns.map(column => column.value(target)),
        );
    }
}

function formatRemainingRuntime(ns: NS, target: TargetInfo, jobs: WorkerJob[]): string
{
    const remainingMs = calculateRemainingRuntime(ns, target, jobs);

    return remainingMs <= 0 ? "-" : formatDuration(remainingMs);
    
}

function formatDuration(milliseconds: number): string
{
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }

    return `${seconds}s`;
}

function calculateRemainingRuntime(ns: NS, target: TargetInfo, jobs: WorkerJob[]): number
{
    const latestFinishAt = jobs
        .filter(job =>
            job.target === target.hostname
            && WorkerAction.Weaken === job.action
        )
        .reduce(
            (latest, job) => Math.max(latest, calculateJobFinishAt(ns, target, job)),
            0,
        );

    return Math.max(0, latestFinishAt - Date.now());
}

function calculateJobFinishAt(ns: NS, target: TargetInfo, job: WorkerJob): number
{
    return job.createdAt
        + (job.delayMs ?? 0)
        + calculateJobRuntime(ns, target, job.action);
}

function calculateJobRuntime(ns: NS, target: TargetInfo, action: WorkerAction): number
{
    const player = ns.getPlayer();
    const server = ns.getServer(target.hostname);

    if (undefined === server) {
        return 0;
    }

    if (WorkerAction.Weaken === action) {
        return ns.formulas.hacking.weakenTime(server, player);
    }

    if (WorkerAction.Grow === action) {
        return ns.formulas.hacking.growTime(server, player);
    }

    if (WorkerAction.Hack === action) {
        return ns.formulas.hacking.hackTime(server, player);
    }

    return 0;
}

function filterShareJobs(jobs: WorkerJob[]): WorkerJob[]
{
    return jobs.filter(job => WorkerAction.Share === job.action);
} 

function printSection(ns: NS, title: string): void
{
    ns.print(" ");
    ns.print(`===== ${title.toUpperCase()} =====`);
}

function printTable(ns: NS, table: Table): void
{
    for(const line of table.render()) {
        ns.print(line);
    }
}