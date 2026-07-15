import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { calculateSecurityDelta } from 'src/utils/calculation-helper';
import { WorkerAllocation } from 'src/models/worker-allocation';
import { isWorkerServer, getWorkerRam } from 'src/deployment/worker-helper';
import { 
    SCRIPT_RAM, 
    SCRIPT_MAP,
    TARGET_ACTION, 
    TARGET_HACK_RATIO, 
    HACK_SECURITY_INCREASE, 
    GROW_SECURITY_INCREASE, 
    BATCH_SPACING_MS, 
    MAX_HACK_THREADS_PER_TARGET, 
    FARM_RAM_RATIO, 
    PREP_RAM_RATIO,
    SHARE_RAM_BUFFER,
    SHARE_TARGET,
    TargetState,
    WorkerAction,
} from 'src/utils/constants';

type FarmPlan = {
    hackThreads: number;
    growThreads: number;
    hackWeakenThreads: number;
    growWeakenThreads: number;
    totalRam: number;
}

type FarmDelays = {
    hack: number;
    hackWeaken: number;
    grow: number;
    growWeaken: number;
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
        const farmTargets = this.getTargetsByState(targets, TargetState.Farm);
        const prepTargets = this.getTargetsExceptState(targets, TargetState.Farm);
        const totalRam = this.calculateTotalAvailableRam(workerAllocations);

        this.allocateWorker(workerAllocations, farmTargets, jobs, totalRam * FARM_RAM_RATIO);
        this.allocateWorker(workerAllocations, prepTargets, jobs, totalRam * PREP_RAM_RATIO);
        this.allocateShare(workerAllocations, jobs);

        return jobs;
    }

    private getWorkerAllocations(servers: ServerInfo[]): WorkerAllocation[]
    {
        return servers
            .filter(server => isWorkerServer(server) )
            .sort((a, b) => b.maxRam - a.maxRam)
            .map<WorkerAllocation>(server => this.createWorkerAllocation(server));
    }

    private calculateTotalAvailableRam(workers: WorkerAllocation[]): number
    {
        return workers.reduce(
            (sum, worker) => sum + worker.availableRam, 0
        );
    }

    private getTargetsByState(targets: TargetInfo[], state: TargetState): TargetInfo[]
    {
        return this.sortTargetsByPriority(
            targets.filter(target => state === target.state)
        );
    }

    private getTargetsExceptState(targets: TargetInfo[], state: TargetState): TargetInfo[]
    {
        return this.sortTargetsByPriority(
            targets.filter(target => state !== target.state)
        );
    }

    private sortTargetsByPriority(targets: TargetInfo[]): TargetInfo[]
    {
        return targets.sort((a, b) => b.priority - a.priority);
    }

    private createWorkerAllocation(server: ServerInfo): WorkerAllocation
    {
        const workerRam = getWorkerRam(server);

        return {
            hostname: server.hostname,
            availableRam: Math.max(0, workerRam - this.getUsedRamWithoutShare(server.hostname)),
            freeRam: Math.max(0, workerRam - this.context.ns.getServerUsedRam(server.hostname)),
        };
    }

    private allocateWorker(workers: WorkerAllocation[], targets: TargetInfo[], jobs: WorkerJob[], ramBudget: number): void 
    {
        if (targets.length === 0) {
            return;
        }

        let remainingRam = ramBudget;

        for (const target of targets) {
            const action = TARGET_ACTION[target.state];
            const firstTargetJobIndex = jobs.length;

            if (TargetState.Farm === target.state) {
                this.allocateFarmTarget(workers, jobs, target, remainingRam);
            } else if (TargetState.Grow === target.state) {
                this.allocatePrepTarget(workers, jobs, target, remainingRam);
            } else {
                this.allocateTarget(workers, jobs, target, action, remainingRam);
            }

            const allocatedRam = jobs
                .slice(firstTargetJobIndex)
                .reduce((sum, job) => sum + job.allocatedRam, 0);

            remainingRam = Math.max(0, remainingRam - allocatedRam);

            if (remainingRam <= 0) {
                return;
            }
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

        const delays = this.createFarmDelays(target);
        const plannedWorkers = this.cloneWorkerAllocations(workers);
        const plannedJobs: WorkerJob[] = [];

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Hack,
            plan.hackThreads,
            delays.hack,
        )) {
            return;
        }

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Weaken,
            plan.hackWeakenThreads,
            delays.hackWeaken,
        )) {
            return;
        }

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Grow,
            plan.growThreads,
            delays.grow,
        )) {
            return;
        }

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Weaken,
            plan.growWeakenThreads,
            delays.growWeaken,
        )) {
            return;
        }

        this.commitPlannedAllocation(workers, plannedWorkers, jobs, plannedJobs);
    }

    private allocatePrepTarget(workers: WorkerAllocation[], jobs: WorkerJob[], target: TargetInfo, allowedRam: number): void
    {
        const plan = this.createPrepPlan(target, allowedRam);

        if (null === plan) {
            return;
        }

        const delays = this.createActionDelays(target);
        const plannedWorkers = this.cloneWorkerAllocations(workers);
        const plannedJobs: WorkerJob[] = [];

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Grow,
            plan.growThreads,
            delays[WorkerAction.Grow] ?? 0,
        )) {
            return;
        }

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Weaken,
            plan.weakenThreads,
            delays[WorkerAction.Weaken] ?? 0,
        )) {
            return;
        }

        this.commitPlannedAllocation(workers, plannedWorkers, jobs, plannedJobs);
    }

    private allocateThreads(
        workers: WorkerAllocation[],
        jobs: WorkerJob[],
        target: TargetInfo,
        action: WorkerAction,
        threads: number,
        delayMs: number = 0,
    ): boolean
    {
        let remainingThreads = threads;

        for (const worker of this.getAvailableWorkers(workers, action)) {
            if (remainingThreads <= 0) {
                return true;
            }

            const workerThreads = Math.min(remainingThreads, Math.floor(worker.availableRam / SCRIPT_RAM[action]));

            if (workerThreads <= 0) {
                continue;
            }

            this.addJob(jobs, worker, target, action, workerThreads, delayMs);

            remainingThreads -= workerThreads;
        }

        return remainingThreads <= 0;
    }

    private allocateShare(workers: WorkerAllocation[], jobs: WorkerJob[]): void
    {
        for (const worker of this.getAvailableShareWorkers(workers)) {
            const threads = this.calculateShareThreads(worker);

            if (threads <= 0) {
                continue;
            }

            this.addShareJob(jobs, worker, threads);
        }
    }

    private createFarmDelays(target: TargetInfo): FarmDelays
    {
        const ns = this.context.ns;
        const player = this.context.getPlayer();
        const server = this.context.toFormulaServer(target);
        const hackTime = ns.formulas.hacking.hackTime(server, player);
        const growTime = ns.formulas.hacking.growTime(server, player);
        const weakenTime = ns.formulas.hacking.weakenTime(server, player);

        return {
            hack: Math.max(0, weakenTime - hackTime - BATCH_SPACING_MS),
            hackWeaken: 0,
            grow: Math.max(0, weakenTime - growTime + BATCH_SPACING_MS),
            growWeaken: BATCH_SPACING_MS * 2,
        };
    }

    private cloneWorkerAllocations(workers: WorkerAllocation[]): WorkerAllocation[]
    {
        return workers.map(worker => ({
            ...worker,
        }));
    }

    private commitPlannedAllocation(
        workers: WorkerAllocation[],
        plannedWorkers: WorkerAllocation[],
        jobs: WorkerJob[],
        plannedJobs: WorkerJob[],
    ): void
    {
        const plannedWorkersByHostname = new Map(
            plannedWorkers.map(worker => [worker.hostname, worker])
        );

        for (const worker of workers) {
            const plannedWorker = plannedWorkersByHostname.get(worker.hostname);

            if (undefined === plannedWorker) {
                throw new Error(`Missing planned allocation for worker ${worker.hostname}.`);
            }

            worker.availableRam = plannedWorker.availableRam;
            worker.freeRam = plannedWorker.freeRam;
        }

        jobs.push(...plannedJobs);
    }

    private addJob(
        jobs: WorkerJob[],
        worker: WorkerAllocation,
        target: TargetInfo,
        action: WorkerAction,
        threads: number,
        delayMs: number = 0,
    ): void
    {
        if (threads <= 0) {
            return;
        }

        const allocatedRam = threads * SCRIPT_RAM[action];

        this.addWorkerJob(jobs, worker, {
            target: target.hostname,
            action,
            threads,
            allocatedRam,
            delayMs,
        });

    }

    private addShareJob(jobs: WorkerJob[], worker: WorkerAllocation, threads: number): void
    {
        const allocatedRam = threads * SCRIPT_RAM[WorkerAction.Share];

        this.addWorkerJob(jobs, worker, {
            target: SHARE_TARGET,
            action: WorkerAction.Share,
            threads,
            allocatedRam,
            delayMs: 0,
        });
    }

    private addWorkerJob(
        jobs: WorkerJob[],
        worker: WorkerAllocation,
        job: Omit<WorkerJob, "hostname" | "createdAt">,
    ): void
    {
        jobs.push({
            hostname: worker.hostname,
            createdAt: Date.now(),
            ...job,
        });

        this.reserveRam(worker, job.allocatedRam);
    }

    private reserveRam(worker: WorkerAllocation, allocatedRam: number): void
    {
        worker.availableRam = Math.max(0, worker.availableRam - allocatedRam);
        worker.freeRam = Math.max(0, worker.freeRam - allocatedRam);
    }

    private getAvailableWorkers(workers: WorkerAllocation[], action: WorkerAction): WorkerAllocation[] 
    {
        return workers
            .filter(worker => worker.availableRam >= SCRIPT_RAM[action])
            .sort((a, b) => a.availableRam - b.availableRam);
    }

    private getAvailableShareWorkers(workers: WorkerAllocation[]): WorkerAllocation[]
    {
        return workers
            .filter(worker => worker.freeRam >= SCRIPT_RAM[WorkerAction.Share])
            .sort((a, b) => a.freeRam - b.freeRam);
    }

    private getUsedRamWithoutShare(hostname: string): number
    {
        return this.context.ns.ps(hostname)
            .filter(process => SCRIPT_MAP[WorkerAction.Share] !== process.filename)
            .reduce(
                (sum, process) => sum + (this.context.ns.getScriptRam(process.filename, hostname) * process.threads),
                0,
            );
    }

    private createActionDelays(target: TargetInfo): Partial<Record<WorkerAction, number>>
    {
        const ns = this.context.ns;
        const player = this.context.getPlayer();
        const server = this.context.toFormulaServer(target);
        const hackTime = ns.formulas.hacking.hackTime(server, player);
        const growTime = ns.formulas.hacking.growTime(server, player);
        const weakenTime = ns.formulas.hacking.weakenTime(server, player);

        return {
            [WorkerAction.Hack]: Math.max(0, weakenTime - hackTime - (BATCH_SPACING_MS * 2)),
            [WorkerAction.Grow]: Math.max(0, weakenTime - growTime - BATCH_SPACING_MS),
            [WorkerAction.Weaken]: 0,
        };
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
        const player = this.context.getPlayer();
        const server = this.context.toFormulaServer(target);
        const hackRatio = Math.min(TARGET_HACK_RATIO, ns.formulas.hacking.hackPercent(server, player) * hackThreads);

        server.moneyAvailable = Math.max(1, target.currentMoney * (1 - hackRatio));
        server.hackDifficulty! += this.calculateHackSecurityIncrease(hackThreads);

        const growThreads = Math.max(1, Math.ceil(ns.formulas.hacking.growThreads(server, player, target.maxMoney)));

        const hackSecurityIncrease = calculateSecurityDelta(target)
            + this.calculateHackSecurityIncrease(hackThreads);

        const growSecurityIncrease = this.calculateGrowSecurityIncrease(growThreads);

        const weakenEffect = ns.formulas.hacking.weakenEffect(1);
        const hackWeakenThreads = weakenEffect <= 0 ? 0 : Math.ceil(hackSecurityIncrease / weakenEffect);
        const growWeakenThreads = weakenEffect <= 0 ? 0 : Math.ceil(growSecurityIncrease / weakenEffect);

        return {
            hackThreads,
            growThreads,
            hackWeakenThreads,
            growWeakenThreads,
            totalRam: this.calculateFarmPlanRam(hackThreads, growThreads, hackWeakenThreads, growWeakenThreads),
        };
    }

    private calculateFarmPlanRam(hackThreads: number, growThreads: number, hackWeakenThreads: number, growWeakenThreads: number): number
    {
        return (hackThreads * SCRIPT_RAM[WorkerAction.Hack]) 
            + (growThreads * SCRIPT_RAM[WorkerAction.Grow])
            + ((hackWeakenThreads + growWeakenThreads) * SCRIPT_RAM[WorkerAction.Weaken]);
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
        const player = this.context.getPlayer();
        const server = this.context.toFormulaServer(target);
        const hackRatioPerThread = this.context.ns.formulas.hacking.hackPercent(server, player);

        if (hackRatioPerThread <= 0) {
            return 0;
        }

        return Math.min(
            MAX_HACK_THREADS_PER_TARGET,
            Math.max(1, Math.floor(TARGET_HACK_RATIO / hackRatioPerThread)),
        );
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
        const player = this.context.getPlayer();
        const server = this.context.toFormulaServer(target);

        if (target.currentMoney >= target.maxMoney) {
            return 0;
        }

        return Math.max(1, Math.ceil(this.context.ns.formulas.hacking.growThreads(server, player, target.maxMoney)));
    }

    private calculateShareThreads(worker: WorkerAllocation): number
    {
        return Math.floor(
            Math.max(0, worker.availableRam - SHARE_RAM_BUFFER) / SCRIPT_RAM[WorkerAction.Share]
        );
    }

    private calculateHackSecurityIncrease(threads: number): number
    {
        return threads * HACK_SECURITY_INCREASE;
    }

    private calculateGrowSecurityIncrease(threads: number): number
    {
        return threads * GROW_SECURITY_INCREASE;
    }
}