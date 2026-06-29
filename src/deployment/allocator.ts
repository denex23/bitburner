import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { WorkerAction } from "src/utils/constants";
import { TARGET_ACTION } from "src/utils/constants";
import { SCRIPT_RAM } from 'src/utils/constants';
import { calculateSecurityDelta} from 'src/utils/calculation-helper';
import { WorkerAllocation } from 'src/models/worker-allocation';
import { isWorkerServer, getWorkerRam } from 'src/deployment/worker-helper';

export class Allocator 
{
    constructor(private readonly context: Context) {}

    public allocate(servers: ServerInfo[], targets: TargetInfo[]): WorkerJob[] 
    {
        const jobs: WorkerJob[] = [];
        const workerAllocations = this.getWorkerAllocations(servers);
        const workTargets = targets
            .filter(t => t.state !== "farm")
            .sort((a, b) => b.priority - a.priority);

        const farmTargets = targets
            .filter(t => t.state === "farm")
            .sort((a, b) => b.priority - a.priority);

        this.allocateWorker(workerAllocations, workTargets, jobs, farmTargets.length === 0);
        this.allocateWorker(workerAllocations, farmTargets, jobs);

        return jobs;
    }

    private getWorkerAllocations(servers: ServerInfo[]): WorkerAllocation[]
    {
        return servers
            .filter(server => isWorkerServer(server) )
            .sort((a, b) => b.maxRam - a.maxRam)
            .map<WorkerAllocation>(server => { 
                return {
                    hostname: server.hostname,
                    availableRam: getWorkerRam(server)
                };
            });
    }

    private allocateWorker(workers: WorkerAllocation[], targets: TargetInfo[], jobs: WorkerJob[], useAllRam: boolean = false): void 
    {
        if (targets.length === 0) {
            return;
        }

        const totalPriority = targets.reduce(
            (sum, target) => sum + target.priority, 0
        );

        const totalRam = workers.reduce(
            (sum, worker) => sum + worker.availableRam, 0
        );

        const workRam = useAllRam ? totalRam : totalRam * 0.8;

        for (const target of targets) {
            const action = TARGET_ACTION[target.state];
            const targetRam = (target.priority / totalPriority) * workRam;

            this.allocateTarget(workers, jobs, target, action, targetRam);
        }
    }

    private allocateTarget(workers: WorkerAllocation[], jobs: WorkerJob[], target: TargetInfo, action: WorkerAction, allowedRam: number): void 
    {
        let remainingThreads = this.calculateThreads(allowedRam, target, action);

        for (const worker of this.getAvailableWorkers(workers, action)) {
            if (remainingThreads <= 0) {
                return;
            }

            const workerThreads = Math.min(remainingThreads, Math.floor(worker.availableRam / SCRIPT_RAM[action]));

            if (workerThreads <= 0) {
                continue;
            }

            this.addJob(jobs, worker, target, action, workerThreads);

            remainingThreads -= workerThreads;
        }
    }

    private addJob(jobs: WorkerJob[], worker: WorkerAllocation, target: TargetInfo, action: WorkerAction, threads: number): number
    {
        if (threads <= 0) {
            return 0;
        }

        const allocatedRam = threads * SCRIPT_RAM[action];

        jobs.push({
            hostname: worker.hostname,
            target: target.hostname,
            action,
            threads,
            allocatedRam: allocatedRam,
        });

        worker.availableRam -= allocatedRam;

        return allocatedRam;
    }

    private getAvailableWorkers(workers: WorkerAllocation[], action: WorkerAction): WorkerAllocation[] {
        return workers
            .filter(worker => worker.availableRam >= SCRIPT_RAM[action])
            .sort((a, b) => a.availableRam - b.availableRam);
    }

    private calculateThreads(allowedRam: number, target: TargetInfo, action: WorkerAction): number 
    {
        const remainingThreads = Math.floor(Math.max(0, allowedRam) / SCRIPT_RAM[action]);

        if (WorkerAction.Hack === action) {
            return Math.min(remainingThreads, this.calculateHackThreads(target));
        }

        if (WorkerAction.Weaken === action) {
            return Math.min(remainingThreads, this.calculateWeakenThreads(target));
        }

        if (WorkerAction.Grow === action) {
            return Math.min(remainingThreads, this.calculateGrowThreads(target));
        }
        
        return remainingThreads;
    }

    private calculateHackThreads(target: TargetInfo): number 
    {
        const hackRatioPerThread = this.context.ns.hackAnalyze(target.hostname);
        const targetHackRatio = 0.1;

        if (hackRatioPerThread <= 0) {
            return 0;
        }

        return Math.max(1, Math.floor(targetHackRatio / hackRatioPerThread));
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