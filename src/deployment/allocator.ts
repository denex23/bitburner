import { Server } from "@ns";
import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { TargetState, WorkerAction } from "src/utils/constants";
import { SCRIPT_RAM, TARGET_ACTION, TARGET_HACK_RATIO, HACK_SECURITY_INCREASE, GROW_SECURITY_INCREASE } from 'src/utils/constants';
import { calculateSecurityDelta } from 'src/utils/calculation-helper';
import { WorkerAllocation } from 'src/models/worker-allocation';
import { isWorkerServer, getWorkerRam } from 'src/deployment/worker-helper';

type FarmPlan = {
    hackThreads: number;
    growThreads: number;
    weakenThreads: number;
    totalRam: number;
}

type PrepPlan = {
    growThreads: number;
    weakenThreads: number;
    totalRam: number;
}

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
        this.allocateShare(workerAllocations, jobs);

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

            if (TargetState.Farm === target.state) {
                this.allocateFarmTarget(workers, jobs, target, targetRam);
                continue;
            }

            if (TargetState.Grow === target.state) {
                this.allocatePrepTarget(workers, jobs, target, targetRam);
                continue;
            }

            this.allocateTarget(workers, jobs, target, action, targetRam);
        }
    }

    private allocateTarget(workers: WorkerAllocation[], jobs: WorkerJob[], target: TargetInfo, action: WorkerAction, allowedRam: number): void 
    {
        this.allocateThreads(
            workers,
            jobs,
            target,
            action,
            this.calculateThreads(allowedRam, target, action),
        );
    }

    private allocateFarmTarget(workers: WorkerAllocation[], jobs: WorkerJob[], target: TargetInfo, allowedRam: number): void
    {
        const plan = this.createFarmPlan(target, allowedRam);

        if (null === plan) {
            return;
        }

        this.allocateThreads(workers, jobs, target, WorkerAction.Hack, plan.hackThreads);
        this.allocateThreads(workers, jobs, target, WorkerAction.Grow, plan.growThreads);
        this.allocateThreads(workers, jobs, target, WorkerAction.Weaken, plan.weakenThreads);
    }

    private allocatePrepTarget(workers: WorkerAllocation[], jobs: WorkerJob[], target: TargetInfo, allowedRam: number): void
    {
        const plan = this.createPrepPlan(target, allowedRam);

        if (null === plan) {
            return;
        }

        this.allocateThreads(workers, jobs, target, WorkerAction.Grow, plan.growThreads);
        this.allocateThreads(workers, jobs, target, WorkerAction.Weaken, plan.weakenThreads);
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

    private allocateThreads(workers: WorkerAllocation[], jobs: WorkerJob[], target: TargetInfo, action: WorkerAction, threads: number): void
    {
        let remainingThreads = threads;

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

    private allocateShare(workers: WorkerAllocation[], jobs: WorkerJob[]): void
    {
        for (const worker of this.getAvailableWorkers(workers, WorkerAction.Share)) {
            const threads = Math.floor(worker.availableRam / SCRIPT_RAM[WorkerAction.Share]);

            if (threads <= 0) {
                continue;
            }

            this.addShareJob(jobs, worker, threads);
        }
    }

    private addShareJob(jobs: WorkerJob[], worker: WorkerAllocation, threads: number): number
    {
        const allocatedRam = threads * SCRIPT_RAM[WorkerAction.Share];

        jobs.push({
            hostname: worker.hostname,
            target: "Share",
            action: WorkerAction.Share,
            threads,
            allocatedRam,
        });

        worker.availableRam -= allocatedRam;

        return allocatedRam;
    }

    private getAvailableWorkers(workers: WorkerAllocation[], action: WorkerAction): WorkerAllocation[] {
        return workers
            .filter(worker => worker.availableRam >= SCRIPT_RAM[action])
            .sort((a, b) => a.availableRam - b.availableRam);
    }

    private createPrepPlan(target: TargetInfo, allowedRam: number): PrepPlan | null
    {
        const maxGrowThreads = Math.min(this.calculateGrowThreads(target), Math.floor(allowedRam / SCRIPT_RAM[WorkerAction.Grow]));

        let min = 1;
        let max = maxGrowThreads;
        let bestPlan: PrepPlan | null = null;

        while (min <= max) {
            const growThreads = Math.floor(min + ((max - min) / 2));
            const plan = this.calculatePrepPlan(target, growThreads);

            if (plan.totalRam <= allowedRam) {
                bestPlan = plan;
                min = growThreads + 1;
                continue;
            }

            max = growThreads - 1;
        }

        return bestPlan;
    }

    private calculatePrepPlan(target: TargetInfo, growThreads: number): PrepPlan
    {
        const weakenEffect = this.context.ns.formulas.hacking.weakenEffect(1);
        const securityIncrease = calculateSecurityDelta(target) + this.calculateGrowSecurityIncrease(growThreads);
        const weakenThreads = weakenEffect <= 0 ? 0 : Math.ceil(securityIncrease / weakenEffect);

        return {
            growThreads,
            weakenThreads,
            totalRam: this.calculatePrepPlanRam(growThreads, weakenThreads),
        };
    }

    private calculatePrepPlanRam(growThreads: number, weakenThreads: number): number
    {
        return (growThreads * SCRIPT_RAM[WorkerAction.Grow]) + (weakenThreads * SCRIPT_RAM[WorkerAction.Weaken]);
    }

    private createFarmPlan(target: TargetInfo, allowedRam: number): FarmPlan | null
    {
        const maxHackThreads = Math.min(this.calculateHackThreads(target), Math.floor(allowedRam / SCRIPT_RAM[WorkerAction.Hack]));

        let min = 1;
        let max = maxHackThreads;
        let bestPlan: FarmPlan | null = null;

        while (min <= max) {
            const hackThreads = Math.floor(min + ((max - min) / 2));
            const plan = this.calculateFarmPlan(target, hackThreads);

            if (plan.totalRam <= allowedRam) {
                bestPlan = plan;
                min = hackThreads + 1;
                continue;
            }

            max = hackThreads - 1;
        }

        return bestPlan;
    }

    private calculateFarmPlan(target: TargetInfo, hackThreads: number): FarmPlan
    {
        const ns = this.context.ns;
        const server = this.createServerSnapshot(target);
        const player = ns.getPlayer();
        const hackRatio = Math.min(TARGET_HACK_RATIO, ns.formulas.hacking.hackPercent(server, player) * hackThreads);

        server.moneyAvailable = Math.max(1, target.currentMoney * (1 - hackRatio));

        const growThreads = Math.max(1, Math.ceil(ns.formulas.hacking.growThreads(server, player, target.maxMoney)));
        const securityIncrease = calculateSecurityDelta(target)
            + this.calculateHackSecurityIncrease(hackThreads)
            + this.calculateGrowSecurityIncrease(growThreads);

        const weakenEffect = ns.formulas.hacking.weakenEffect(1);
        const weakenThreads = weakenEffect <= 0 ? 0 : Math.ceil(securityIncrease / weakenEffect);

        return {
            hackThreads,
            growThreads,
            weakenThreads,
            totalRam: this.calculateFarmPlanRam(hackThreads, growThreads, weakenThreads),
        };
    }

    private calculateFarmPlanRam(hackThreads: number, growThreads: number, weakenThreads: number): number
    {
        return (hackThreads * SCRIPT_RAM[WorkerAction.Hack]) 
            + (growThreads * SCRIPT_RAM[WorkerAction.Grow])
            + (weakenThreads * SCRIPT_RAM[WorkerAction.Weaken]);
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
        const server = this.createServerSnapshot(target);
        const player = this.context.ns.getPlayer();
        const hackRatioPerThread = this.context.ns.formulas.hacking.hackPercent(server, player);

        if (hackRatioPerThread <= 0) {
            return 0;
        }

        return Math.max(1, Math.floor(TARGET_HACK_RATIO / hackRatioPerThread));
    }

    private calculateWeakenThreads(target: TargetInfo): number 
    {
        const securityDelta = calculateSecurityDelta(target);
        const weakenEffect = this.context.ns.formulas.hacking.weakenEffect(1);

        if (securityDelta <= 0 || weakenEffect <= 0) {
            return 0;
        }

        return Math.ceil(securityDelta / weakenEffect);
    }

    private calculateGrowThreads(target: TargetInfo): number 
    {
        const server = this.createServerSnapshot(target);
        const player = this.context.ns.getPlayer();

        if (target.currentMoney >= target.maxMoney) {
            return 0;
        }

        return Math.max(1, Math.ceil(this.context.ns.formulas.hacking.growThreads(server, player, target.maxMoney)));
    }

    private calculateHackSecurityIncrease(threads: number): number
    {
        return threads * HACK_SECURITY_INCREASE;
    }

    private calculateGrowSecurityIncrease(threads: number): number
    {
        return threads * GROW_SECURITY_INCREASE;
    }

    private createServerSnapshot(target: TargetInfo): Server
    {
        const server = this.context.ns.getServer(target.hostname);

        server.moneyAvailable = Math.max(1, target.currentMoney);
        server.moneyMax = target.maxMoney;
        server.hackDifficulty = target.currentSecurity;
        server.minDifficulty = target.minSecurity;

        return server;
    }
}