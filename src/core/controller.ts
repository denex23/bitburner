import { NS } from '@ns';
import { Context } from '/src/models/context';
import { Scanner } from "/src/network/scanner";
import { Rooter } from "/src/network/rooter";
import { TargetSelector } from "/src/targets/target-selector";
import { Allocator } from "/src/deployment/allocator";
import { Deployer } from "/src/deployment/deployer";
import { DebugReporter } from '/src/debug/debug-reporter';
import { calculateMoneyRatio, calculateSecurityDelta } from "/src/utils/calculation-helper"

export async function main(ns: NS) 
{
    const context = new Context(ns)
    const scanner = new Scanner(context);
    const rooter = new Rooter(context);
    const selector = new TargetSelector(context);
    const allocator = new Allocator(context);
    const deployer = new Deployer(context);
    const debugReporter = new DebugReporter();

    while (true) {
        const servers = scanner.scan();
        const rootResults = rooter.root(servers);
        const targets = selector.select(servers);
        const jobs = allocator.allocate(servers, targets);

        debugReporter.report(servers, targets, jobs);
        deployer.deploy(servers, jobs);

        await ns.sleep(60000);
    }
}