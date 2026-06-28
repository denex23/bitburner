import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { WorkerAction } from "src/utils/constants";
import { TARGET_ACTION } from "src/utils/constants";
import { SCRIPT_RAM } from 'src/utils/constants';

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
        workerIndex = this.allocateWork(workers, workTargets, jobs, workerIndex);

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

    private allocateWork(workers: ServerInfo[], targets: TargetInfo[], jobs: WorkerJob[], startIndex: number): number 
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
        
        const workRam = totalRam * 0.8;
        
        let workerIndex = startIndex;
        for (const target of targets) {
            if (workerIndex >= workers.length) break;

            const allocatedRam = (target.priority / totalPriority) * workRam;
            let assignedRam = 0;

            while (workerIndex < workers.length && assignedRam < allocatedRam) {
                const worker = workers[workerIndex];

                jobs.push(this.createJob(worker, target.hostname, TARGET_ACTION[target.state]));

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

        let targetIndex = 0;
        for (let workerIndex = startIndex; workerIndex < workers.length; workerIndex++) {
            const worker = workers[workerIndex];
            const target = targets[targetIndex % targets.length];

            jobs.push(this.createJob(worker, target.hostname, TARGET_ACTION[target.state]));
            
            targetIndex++;
        }
    }

    private createJob(worker: ServerInfo, target: string, action: WorkerAction): WorkerJob 
    {
        const threads = this.calculateThreads(worker.maxRam, target, action);

        return {
            hostname: worker.hostname,
            target,
            action,
            threads,
            allocatedRam: worker.maxRam,
        };
    }

    private calculateThreads(workerRam: number, target: string, action: WorkerAction): number {
        const maxThreads = Math.floor(workerRam / SCRIPT_RAM[action]);

        if (action !== WorkerAction.Hack) {
            return maxThreads;
        }

        return Math.min(maxThreads, this.calculateHackThreads(target));
    }

    private calculateHackThreads(target: string): number {
        const hackPercentage = this.context.ns.hackAnalyze(target);
        const moneyToHack = 0.1;

        if (hackPercentage <= 0) {
            return 0;
        }

        return Math.max(1, Math.floor(moneyToHack / hackPercentage));
    }
}