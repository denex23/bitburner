import { NS } from '@ns';
import { Context } from 'src/models/context';
import { Scanner } from "src/network/scanner";
import { Rooter } from "src/network/rooter";
import { TargetSelector } from "src/targets/target-selector";
import { Allocator } from "src/deployment/allocator";
import { Deployer } from "src/deployment/deployer";
import { DebugReporter } from 'src/debug/debug-reporter';

export async function main(ns: NS) 
{
    const context = new Context(ns)
    const debugReporter = new DebugReporter(context);
    const scanner = new Scanner(context);
    const rooter = new Rooter(context);
    const selector = new TargetSelector(context);
    const allocator = new Allocator(context);
    const deployer = new Deployer(context);

    initTail(ns);

    while (true) {
        // Scan & Rooting
        const servers = scanner.scan();
        rooter.root(servers);

        // Plan
        const targets = selector.select(servers);
        const jobs = allocator.allocate(servers, targets);

        // Refresh server/worker
        await deployer.deploy(servers, jobs);

        // Debugging
        ns.clearLog();
        ns.ui.setTailTitle(`Reports - ${new Date().toLocaleString("de-DE")}`);
        debugReporter.report(servers, targets, jobs);

        await ns.sleep(60000);
    }
}

export function initTail(ns: NS): void
{
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.moveTail(60, 0);
    ns.ui.resizeTail(800, 1275);
    ns.ui.setTailMinimized(true);
    ns.atExit(() => { ns.ui.closeTail() });
}