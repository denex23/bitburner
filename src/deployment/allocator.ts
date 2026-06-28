import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { WorkerAction } from "src/utils/constants";
import { TARGET_ACTION } from "src/utils/constants";
import { SCRIPT_RAM } from 'src/utils/constants';
import { calculateMoneyRatio, calculateSecurityDelta } from '../utils/calculation-helper';

export class Allocator 
{
    constructor(private readonly context: Context) {}

    public allocate(servers: ServerInfo[], targets: TargetInfo[]): WorkerJob[] 
    {
        const {ns} = this.context;
        const jobs: WorkerJob[] = [];
        const workers = this.getWorkers(servers);
        const workTargets = targets
            .filter(t => t.state !== "farm")
            .sort((a, b) => b.priority - a.priority);

        const farmTargets = targets
            .filter(t => t.state === "farm")
            .sort((a, b) => b.priority - a.priority);

        let workerIndex = 0;
        workerIndex = this.allocateWork(workers, workTargets, jobs, workerIndex, farmTargets.length === 0);

        this.allocateFarm(workers, farmTargets, jobs, workerIndex);

        return jobs;
    }

    private getWorkers(servers: ServerInfo[]): ServerInfo[] 
    {
        return servers
            .filter(server =>
                server.rooted &&
                server.maxRam > 0 &&
                server.hostname !== "home"
            )
            .sort((a, b) =>
                b.maxRam - a.maxRam
            );
    }

    private allocateWork(workers: ServerInfo[], targets: TargetInfo[], jobs: WorkerJob[], startIndex: number, useAllRam: boolean = false): number 
    {
        if (targets.length === 0) {
            return startIndex;
        }

        const totalPriority = targets.reduce(
            (sum, target) => sum + target.priority, 0
        );

        const totalRam = workers.reduce(
            (sum, worker) => sum + worker.maxRam, 0
        );
        
        const workRam = useAllRam ? totalRam : totalRam * 0.8;
        
        let workerIndex = startIndex;
        for (const target of targets) {
            if (workerIndex >= workers.length) break;

            const allocatedRam = (target.priority / totalPriority) * workRam;
            let assignedRam = 0;

            while (workerIndex < workers.length && assignedRam < allocatedRam) {
                const worker = workers[workerIndex];

                jobs.push(this.createJob(worker, target, TARGET_ACTION[target.state]));

                assignedRam += worker.maxRam;
                workerIndex++;
            }
        }

        return workerIndex;
    }

    private allocateFarm(workers: ServerInfo[], targets: TargetInfo[], jobs: WorkerJob[], startIndex: number): void 
    {
        if (targets.length === 0) {
            return;
        }

        const maxFarmWorkers = Math.ceil(workers.length * 0.2);
        const farmWorkers = workers.slice(startIndex, startIndex + maxFarmWorkers);
        const totalPriority = targets.reduce(
            (sum, target) => sum + target.priority, 0
        );

        for (const target of targets) {
            const targetWorkerCount = Math.floor((target.priority / totalPriority) * farmWorkers.length);

            for (let i = 0; i < targetWorkerCount; i++) {
                const worker = farmWorkers.shift();

                if (worker === undefined) {
                    return;
                }

                jobs.push(this.createJob(worker, target, TARGET_ACTION[target.state]));
            }
        }
    }

    private createJob(worker: ServerInfo, target: TargetInfo, action: WorkerAction): WorkerJob 
    {
        const threads = this.calculateThreads(worker.maxRam, target, action);

        return {
            hostname: worker.hostname,
            target: target.hostname,
            action,
            threads,
            allocatedRam: threads * SCRIPT_RAM[action],
        };
    }

    private calculateThreads(workerRam: number, target: TargetInfo, action: WorkerAction): number 
    {
        const maxThreads = Math.floor(workerRam / SCRIPT_RAM[action]);

        if (WorkerAction.Hack === action) {
            return Math.min(maxThreads, this.calculateHackThreads(target));
        }

        if (WorkerAction.Weaken === action) {
            return Math.min(maxThreads, this.calculateWeakenThreads(target));
        }

        if (WorkerAction.Grow === action) {
            return Math.min(maxThreads, this.calculateGrowThreads(target));
        }
        
        return maxThreads;
    }

    private calculateHackThreads(target: TargetInfo): number 
    {
        const hackPercentage = this.context.ns.hackAnalyze(target.hostname);
        const moneyToHack = 0.1;

        if (hackPercentage <= 0) {
            return 0;
        }

        return Math.max(1, Math.floor(moneyToHack / hackPercentage));
    }

    private calculateWeakenThreads(target: TargetInfo): number 
    {
        const securityDelta = calculateSecurityDelta(target);

        // TODO: exchange 0.05 with ns.weakenAnalyze(threads, cores) when using cores
        return Math.max(1, Math.ceil(securityDelta / 0.05));
    }

    private calculateGrowThreads(target: TargetInfo): number 
    {
        const multiplier = target.maxMoney / Math.max(1, target.currentMoney);

        return Math.max(1, Math.ceil(this.context.ns.growthAnalyze(target.hostname, multiplier)));
    }
}