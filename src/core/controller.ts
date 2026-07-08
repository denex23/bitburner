import { NS } from '@ns';
import { Context } from 'src/models/context';
import { Scanner } from "src/network/scanner";
import { Rooter } from "src/network/rooter";
import { TargetSelector } from "src/targets/target-selector";
import { Allocator } from "src/deployment/allocator";
import { Deployer } from "src/deployment/deployer";
import { DebugReporter } from 'src/debug/debug-reporter';
import { BatchScheduler } from "src/deployment/batch-scheduler";
import { CONTROLLER_INTERVAL_MS } from "src/utils/constants";
import { isWorkerServer, getWorkerRam } from 'src/deployment/worker-helper';
import { DashboardSnapshotWriter } from 'src/data/dshboard-writer';
import { DashboardSnapshot } from 'src/models/dashboard-snapshot';

export async function main(ns: NS) 
{
    const context = new Context(ns)
    const debugReporter = new DebugReporter(context);
    const scanner = new Scanner(context);
    const rooter = new Rooter(context);
    const selector = new TargetSelector(context);
    const allocator = new Allocator(context);
    const deployer = new Deployer(context);
    const batchScheduler = new BatchScheduler(context);
    const snapshotWriter = new DashboardSnapshotWriter(context);

    initTail(ns);

    while (true) {
        // Scan & Rooting
        const servers = scanner.scan();
        rooter.root(servers);

        // Plan
        const targets = selector.select(servers);
        const availableTargets = batchScheduler.getAvailableTargets(targets);
        const jobs = allocator.allocate(servers, availableTargets);
        batchScheduler.register(jobs, targets);
        const protectedJobs = batchScheduler.getProtectedJobs(jobs);

        const totalWorkerRam = servers
            .filter(server => isWorkerServer(server))
            .reduce((sum, server) => sum + getWorkerRam(server), 0);

        const availableWorkerRam = servers
            .filter(server => isWorkerServer(server))
            .reduce((sum, server) => sum + Math.max(
                0,
                getWorkerRam(server) - ns.getServerUsedRam(server.hostname)
            ), 0);

        const plannedRam = protectedJobs.reduce(
            (sum, job) => sum + job.allocatedRam,
            0
        );

        const snapshot: DashboardSnapshot = {
            createdAt: Date.now(),
            totalWorkerRam,
            availableWorkerRam,
            plannedRam,
            targets,
            jobs: protectedJobs,
        };

        // Refresh server/worker
        await deployer.deploy(servers, jobs, protectedJobs);

        // Debugging
        ns.clearLog();
        ns.ui.setTailTitle(`Reports - ${new Date().toLocaleString("de-DE")}`);
        debugReporter.report(servers, targets, protectedJobs);

        snapshotWriter.write(snapshot);

        await ns.sleep(CONTROLLER_INTERVAL_MS);
    }
}

export function initTail(ns: NS): void
{
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.moveTail(60, 10);
    ns.ui.resizeTail(800, 1260);
    ns.ui.setTailMinimized(true);
    ns.atExit(() => { ns.ui.closeTail() });
}
