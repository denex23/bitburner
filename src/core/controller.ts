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

        // Refresh server/worker
        await deployer.deploy(servers, jobs, protectedJobs);

        // Debugging
        ns.clearLog();
        ns.ui.setTailTitle(`Reports - ${new Date().toLocaleString("de-DE")}`);
        debugReporter.report(servers, targets, protectedJobs);

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
