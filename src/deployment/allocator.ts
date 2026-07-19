import { Server } from "@ns";
import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { TargetInfo } from "src/models/target-info";
import { WorkerJob } from "src/models/worker-job";
import { WorkerAllocation } from 'src/models/worker-allocation';
import { isWorkerServer, getWorkerRam } from 'src/deployment/worker-helper';
import { ScheduledBatchOperation } from 'src/models/scheduled-batch-operation';
import { TargetSimulator } from "src/deployment/target-simulator";
import {
    calculateSecurityDelta,
    calculateHackSecurityIncrease,
    calculateGrowSecurityIncrease,
} from 'src/utils/calculation-helper';
import {
    SCRIPT_RAM,
    SCRIPT_MAP,
    TARGET_ACTION,
    TARGET_HACK_RATIO,
    BATCH_SPACING_MS,
    MAX_HACK_THREADS_PER_TARGET,
    FARM_RAM_RATIO,
    PREP_RAM_RATIO,
    SHARE_RAM_BUFFER,
    SHARE_TARGET,
    TargetState,
    WorkerAction,
} from 'src/utils/constants';

const MAX_TIMELINE_CALCULATION_ATTEMPTS = 10;
const TIMELINE_TOLERANCE_MS = 1;

type FarmThreads = {
    hack: number;
    weakenAfterHack: number;
    grow: number;
    weakenAfterGrow: number;
};

type FarmDelays = {
    hack: number;
    weakenAfterHack: number;
    grow: number;
    weakenAfterGrow: number;
};

type FarmPlan = {
    threads: FarmThreads;
    delays: FarmDelays;
    totalRam: number;
};

type PrepThreads = {
    grow: number;
    weaken: number;
};

type PrepDelays = {
    grow: number;
    weaken: number;
};

type PrepPlan = {
    threads: PrepThreads;
    delays: PrepDelays;
    totalRam: number;
};

export class Allocator
{
    private readonly targetSimulator: TargetSimulator;

    constructor(private readonly context: Context)
    {
        this.targetSimulator = new TargetSimulator(context);
    }

    public allocate(
        servers: ServerInfo[],
        targets: TargetInfo[],
        pendingOperations: ScheduledBatchOperation[],
    ): WorkerJob[]
    {
        const jobs: WorkerJob[] = [];
        const workerAllocations = this.getWorkerAllocations(servers);
        const farmTargets = this.getTargetsByState(targets, TargetState.Farm);
        const prepTargets = this.getTargetsExceptState(targets, TargetState.Farm);
        const totalRam = this.calculateTotalAvailableRam(workerAllocations);

        this.allocateWorker(workerAllocations, farmTargets, jobs, pendingOperations, totalRam * FARM_RAM_RATIO);
        this.allocateWorker(workerAllocations, prepTargets, jobs, pendingOperations, totalRam * PREP_RAM_RATIO);
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

    private allocateWorker(
        workers: WorkerAllocation[],
        targets: TargetInfo[],
        jobs: WorkerJob[],
        pendingOperations: ScheduledBatchOperation[],
        ramBudget: number
    ): void
    {
        if (targets.length === 0) {
            return;
        }

        let remainingRam = ramBudget;

        for (const target of targets) {
            const action = TARGET_ACTION[target.state];
            const firstTargetJobIndex = jobs.length;

            if (TargetState.Farm === target.state) {
                this.allocateFarmTarget(workers, jobs, pendingOperations, target, remainingRam);
            } else if (TargetState.Grow === target.state) {
                this.allocatePrepTarget(workers, jobs, pendingOperations, target, remainingRam);
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

    private allocateFarmTarget(
        workers: WorkerAllocation[],
        jobs: WorkerJob[],
        pendingOperations: ScheduledBatchOperation[],
        target: TargetInfo,
        allowedRam: number
    ): void
    {
        const plan = this.createFarmPlan(target, allowedRam, pendingOperations);

        if (null === plan) {
            return;
        }

        const plannedWorkers = this.cloneWorkerAllocations(workers);
        const plannedJobs: WorkerJob[] = [];

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Hack,
            plan.threads.hack,
            plan.delays.hack,
        )) {
            return;
        }

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Weaken,
            plan.threads.weakenAfterHack,
            plan.delays.weakenAfterHack,
        )) {
            return;
        }

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Grow,
            plan.threads.grow,
            plan.delays.grow,
        )) {
            return;
        }

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Weaken,
            plan.threads.weakenAfterGrow,
            plan.delays.weakenAfterGrow,
        )) {
            return;
        }

        this.commitPlannedAllocation(workers, plannedWorkers, jobs, plannedJobs);
    }

    private allocatePrepTarget(
        workers: WorkerAllocation[],
        jobs: WorkerJob[],
        pendingOperations: ScheduledBatchOperation[],
        target: TargetInfo,
        allowedRam: number
    ): void
    {
        const plan = this.createPrepPlan(target, allowedRam, pendingOperations);

        if (null === plan) {
            return;
        }

        const plannedWorkers = this.cloneWorkerAllocations(workers);
        const plannedJobs: WorkerJob[] = [];

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Grow,
            plan.threads.grow,
            plan.delays.grow,
        )) {
            return;
        }

        if (false === this.allocateThreads(
            plannedWorkers,
            plannedJobs,
            target,
            WorkerAction.Weaken,
            plan.threads.weaken,
            plan.delays.weaken,
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

    private createFarmPlan(
        target: TargetInfo,
        allowedRam: number,
        pendingOperations: ScheduledBatchOperation[],
    ): FarmPlan | null
    {
        const serverAfterPendingOperations = this.targetSimulator.simulateAfterPendingOperations(
            target,
            pendingOperations,
        );
        const delays = this.createFarmDelays(target, pendingOperations);
        const maximumHackThreads = Math.min(
            this.calculateHackThreadsForServer(serverAfterPendingOperations),
            Math.floor(allowedRam / SCRIPT_RAM[WorkerAction.Hack]),
        );

        let minimumCandidateHackThreads = 1;
        let maximumCandidateHackThreads = maximumHackThreads;
        let bestPlan: FarmPlan | null = null;

        while (minimumCandidateHackThreads <= maximumCandidateHackThreads) {
            const candidateHackThreads = Math.floor(
                minimumCandidateHackThreads
                + ((maximumCandidateHackThreads - minimumCandidateHackThreads) / 2),
            );

            const threads = this.calculateFarmThreads(
                serverAfterPendingOperations,
                candidateHackThreads,
            );

            const candidatePlan: FarmPlan = {
                threads,
                delays,
                totalRam: this.calculateFarmPlanRam(threads),
            };

            if (candidatePlan.totalRam <= allowedRam) {
                bestPlan = candidatePlan;
                minimumCandidateHackThreads = candidateHackThreads + 1;
                continue;
            }

            maximumCandidateHackThreads = candidateHackThreads - 1;
        }

        return bestPlan;
    }

    private calculateFarmThreads(serverAfterPendingOperations: Server, hackThreads: number): FarmThreads
    {
        const ns = this.context.ns;
        const player = this.context.getPlayer();
        const server = { ...serverAfterPendingOperations };

        const minimumSecurity = server.minDifficulty ?? 1;
        const currentSecurity = server.hackDifficulty ?? minimumSecurity;

        const currentMoney = Math.max(1, server.moneyAvailable ?? 0);
        const maximumMoney = server.moneyMax ?? currentMoney;

        const hackRatio = Math.min(TARGET_HACK_RATIO, ns.formulas.hacking.hackPercent(server, player) * hackThreads);

        server.moneyAvailable = Math.max(1, currentMoney * (1 - hackRatio));
        server.hackDifficulty = Math.min(100, currentSecurity + calculateHackSecurityIncrease(hackThreads));

        const securityToWeakenAfterHack = Math.max(0, server.hackDifficulty - minimumSecurity);
        const weakenEffect = ns.formulas.hacking.weakenEffect(1);
        const weakenAfterHackThreads = weakenEffect <= 0 ? 0 : Math.ceil(securityToWeakenAfterHack / weakenEffect);

        server.hackDifficulty = Math.max(minimumSecurity, server.hackDifficulty - (weakenAfterHackThreads * weakenEffect));

        const growThreads = Math.max(1, Math.ceil(ns.formulas.hacking.growThreads(server, player, maximumMoney)));
        const securityToWeakenAfterGrow = calculateGrowSecurityIncrease(growThreads);
        const weakenAfterGrowThreads = weakenEffect <= 0 ? 0 : Math.ceil(securityToWeakenAfterGrow / weakenEffect);

        return {
            hack: hackThreads,
            weakenAfterHack: weakenAfterHackThreads,
            grow: growThreads,
            weakenAfterGrow: weakenAfterGrowThreads,
        };
    }

    private calculateFarmPlanRam(threads: FarmThreads): number
    {
        return (threads.hack * SCRIPT_RAM[WorkerAction.Hack])
            + (threads.weakenAfterHack * SCRIPT_RAM[WorkerAction.Weaken])
            + (threads.grow * SCRIPT_RAM[WorkerAction.Grow])
            + (threads.weakenAfterGrow * SCRIPT_RAM[WorkerAction.Weaken]);
    }

    private createFarmDelays(target: TargetInfo, pendingOperations: ScheduledBatchOperation[]): FarmDelays
    {
        const planningStartedAt = Date.now();
        const lastPendingLandingAt = pendingOperations
            .filter(operation => operation.target === target.hostname)
            .reduce(
                (latestLandingAt, operation) => Math.max(latestLandingAt, operation.landingAt),
                planningStartedAt,
            );

        let hackLandingAt = lastPendingLandingAt + BATCH_SPACING_MS;
        let weakenAfterHackLandingAt = lastPendingLandingAt + (BATCH_SPACING_MS * 2);
        let growLandingAt = lastPendingLandingAt + (BATCH_SPACING_MS * 3);
        let weakenAfterGrowLandingAt = lastPendingLandingAt + (BATCH_SPACING_MS * 4);

        let hackStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Hack,
            hackLandingAt,
            planningStartedAt,
        );

        let weakenAfterHackStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Weaken,
            weakenAfterHackLandingAt,
            planningStartedAt,
        );

        let growStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Grow,
            growLandingAt,
            planningStartedAt,
        );

        let weakenAfterGrowStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Weaken,
            weakenAfterGrowLandingAt,
            planningStartedAt,
        );

        const earliestStartAt = Math.min(
            hackStartsAt,
            weakenAfterHackStartsAt,
            growStartsAt,
            weakenAfterGrowStartsAt,
        );

        const requiredTimelineShift = Math.max(0, planningStartedAt - earliestStartAt);

        hackLandingAt += requiredTimelineShift;
        weakenAfterHackLandingAt += requiredTimelineShift;
        growLandingAt += requiredTimelineShift;
        weakenAfterGrowLandingAt += requiredTimelineShift;

        hackStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Hack,
            hackLandingAt,
            planningStartedAt,
        );

        weakenAfterHackStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Weaken,
            weakenAfterHackLandingAt,
            planningStartedAt,
        );

        growStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Grow,
            growLandingAt,
            planningStartedAt,
        );

        weakenAfterGrowStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Weaken,
            weakenAfterGrowLandingAt,
            planningStartedAt,
        );

        const delayReferenceAt = Date.now();

        return {
            hack: Math.max(0, hackStartsAt - delayReferenceAt),
            weakenAfterHack: Math.max(0, weakenAfterHackStartsAt - delayReferenceAt),
            grow: Math.max(0, growStartsAt - delayReferenceAt),
            weakenAfterGrow: Math.max(0, weakenAfterGrowStartsAt - delayReferenceAt),
        };
    }

    private calculateActionStartAt(
        target: TargetInfo,
        pendingOperations: ScheduledBatchOperation[],
        action: WorkerAction,
        landingAt: number,
        earliestStartAt: number,
    ): number
    {
        let startsAt = landingAt - this.targetSimulator.calculateActionTimeAt(
            target,
            pendingOperations,
            action,
            earliestStartAt,
        );

        for (let attempt = 0; attempt < MAX_TIMELINE_CALCULATION_ATTEMPTS; attempt++) {
            const simulationAt = Math.max(earliestStartAt, startsAt);
            const actionTime = this.targetSimulator.calculateActionTimeAt(
                target,
                pendingOperations,
                action,
                simulationAt,
            );
            const calculatedStartsAt = landingAt - actionTime;

            if (Math.abs(calculatedStartsAt - startsAt) <= TIMELINE_TOLERANCE_MS) {
                return calculatedStartsAt;
            }

            startsAt = calculatedStartsAt;
        }

        return startsAt;
    }

    private createPrepPlan(
        target: TargetInfo,
        allowedRam: number,
        pendingOperations: ScheduledBatchOperation[],
    ): PrepPlan | null
    {
        const serverAfterPendingOperations = this.targetSimulator.simulateAfterPendingOperations(
            target,
            pendingOperations,
        );
        const delays = this.createPrepDelays(target, pendingOperations);
        const maximumGrowThreads = Math.min(
            this.calculateGrowThreadsForServer(serverAfterPendingOperations),
            Math.floor(allowedRam / SCRIPT_RAM[WorkerAction.Grow]),
        );

        let minimumCandidateGrowThreads = 1;
        let maximumCandidateGrowThreads = maximumGrowThreads;
        let bestPlan: PrepPlan | null = null;

        while (minimumCandidateGrowThreads <= maximumCandidateGrowThreads) {
            const candidateGrowThreads = Math.floor(
                minimumCandidateGrowThreads
                + ((maximumCandidateGrowThreads - minimumCandidateGrowThreads) / 2),
            );

            const threads = this.calculatePrepThreads(
                serverAfterPendingOperations,
                candidateGrowThreads,
            );

            const candidatePlan: PrepPlan = {
                threads,
                delays,
                totalRam: this.calculatePrepPlanRam(threads),
            };

            if (candidatePlan.totalRam <= allowedRam) {
                bestPlan = candidatePlan;
                minimumCandidateGrowThreads = candidateGrowThreads + 1;
                continue;
            }

            maximumCandidateGrowThreads = candidateGrowThreads - 1;
        }

        return bestPlan;
    }

    private calculatePrepThreads(serverAfterPendingOperations: Server, growThreads: number): PrepThreads
    {
        const minimumSecurity = serverAfterPendingOperations.minDifficulty ?? 1;
        const currentSecurity = serverAfterPendingOperations.hackDifficulty ?? minimumSecurity;
        const securityIncrease = Math.max(0, currentSecurity - minimumSecurity)
            + calculateGrowSecurityIncrease(growThreads);
        const weakenEffect = this.context.ns.formulas.hacking.weakenEffect(1);
        const weakenThreads = weakenEffect <= 0 ? 0 : Math.ceil(securityIncrease / weakenEffect);

        return {
            grow: growThreads,
            weaken: weakenThreads,
        };
    }

    private calculatePrepPlanRam(threads: PrepThreads): number
    {
        return (threads.grow * SCRIPT_RAM[WorkerAction.Grow])
            + (threads.weaken * SCRIPT_RAM[WorkerAction.Weaken]);
    }

    private createPrepDelays(target: TargetInfo, pendingOperations: ScheduledBatchOperation[]): PrepDelays
    {
        const planningStartedAt = Date.now();
        const lastPendingLandingAt = pendingOperations
            .filter(operation => operation.target === target.hostname)
            .reduce(
                (latestLandingAt, operation) => Math.max(latestLandingAt, operation.landingAt),
                planningStartedAt,
            );

        let growLandingAt = lastPendingLandingAt + BATCH_SPACING_MS;
        let weakenLandingAt = lastPendingLandingAt + (BATCH_SPACING_MS * 2);

        let growStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Grow,
            growLandingAt,
            planningStartedAt,
        );

        let weakenStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Weaken,
            weakenLandingAt,
            planningStartedAt,
        );

        const earliestStartAt = Math.min(growStartsAt, weakenStartsAt);
        const requiredTimelineShift = Math.max(0, planningStartedAt - earliestStartAt);

        growLandingAt += requiredTimelineShift;
        weakenLandingAt += requiredTimelineShift;

        growStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Grow,
            growLandingAt,
            planningStartedAt,
        );

        weakenStartsAt = this.calculateActionStartAt(
            target,
            pendingOperations,
            WorkerAction.Weaken,
            weakenLandingAt,
            planningStartedAt,
        );

        const delayReferenceAt = Date.now();

        return {
            grow: Math.max(0, growStartsAt - delayReferenceAt),
            weaken: Math.max(0, weakenStartsAt - delayReferenceAt),
        };
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
        return this.calculateHackThreadsForServer(
            this.context.toFormulaServer(target),
        );
    }

    private calculateHackThreadsForServer(server: Server): number
    {
        const player = this.context.getPlayer();
        const hackRatioPerThread = this.context.ns.formulas.hacking.hackPercent(
            server,
            player,
        );

        if (hackRatioPerThread <= 0) {
            return 0;
        }

        return Math.min(
            MAX_HACK_THREADS_PER_TARGET,
            Math.max(1, Math.floor(TARGET_HACK_RATIO / hackRatioPerThread)),
        );
    }

    private calculateGrowThreads(target: TargetInfo): number
    {
        return this.calculateGrowThreadsForServer(
            this.context.toFormulaServer(target),
        );
    }

    private calculateGrowThreadsForServer(server: Server): number
    {
        const currentMoney = server.moneyAvailable ?? 0;
        const maximumMoney = server.moneyMax ?? 0;

        if (currentMoney >= maximumMoney) {
            return 0;
        }

        return Math.max(
            1,
            Math.ceil(this.context.ns.formulas.hacking.growThreads(
                server,
                this.context.getPlayer(),
                maximumMoney,
            )),
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

    private calculateShareThreads(worker: WorkerAllocation): number
    {
        return Math.floor(
            Math.max(0, worker.availableRam - SHARE_RAM_BUFFER) / SCRIPT_RAM[WorkerAction.Share]
        );
    }
}
