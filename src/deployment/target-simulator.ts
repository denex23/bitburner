import { Server } from "@ns";
import { Context } from "src/models/context";
import { ScheduledBatchOperation } from "src/models/scheduled-batch-operation";
import { TargetInfo } from "src/models/target-info";
import { WorkerAction } from "src/utils/constants";
import {
    calculateHackSecurityIncrease,
    calculateGrowSecurityIncrease
} from 'src/utils/calculation-helper';

export class TargetSimulator
{
    constructor(private readonly context: Context) { }

    public simulateUntil(
        target: TargetInfo,
        pendingOperations: ScheduledBatchOperation[],
        until: number,
    ): Server
    {
        const simulatedServer = this.context.toFormulaServer(target);
        const targetOperations = pendingOperations
            .filter(operation =>
                operation.target === target.hostname
                && operation.landingAt <= until
            )
            .sort((left, right) => left.landingAt - right.landingAt);

        for (const operation of targetOperations) {
            this.applyPendingOperation(simulatedServer, operation);
        }

        return simulatedServer;
    }

    public simulateAfterPendingOperations(target: TargetInfo, pendingOperations: ScheduledBatchOperation[]): Server
    {
        return this.simulateUntil(target, pendingOperations, Number.POSITIVE_INFINITY);
    }

    public calculateActionTimeAt(
        target: TargetInfo,
        pendingOperations: ScheduledBatchOperation[],
        action: WorkerAction,
        startsAt: number,
    ): number
    {
        const server = this.simulateUntil(target, pendingOperations, startsAt);

        return this.calculateActionTime(action, server);
    }

    private calculateActionTime(action: WorkerAction, server: Server): number
    {
        const formulas = this.context.ns.formulas.hacking;
        const player = this.context.getPlayer();

        if (WorkerAction.Hack === action) {
            return formulas.hackTime(server, player);
        }

        if (WorkerAction.Grow === action) {
            return formulas.growTime(server, player);
        }

        if (WorkerAction.Weaken === action) {
            return formulas.weakenTime(server, player);
        }

        return 0;
    }

    private applyPendingOperation(server: Server, operation: ScheduledBatchOperation): void
    {
        if (WorkerAction.Hack === operation.action) {
            this.applyPendingHack(server, operation);
            return;
        }

        if (WorkerAction.Grow === operation.action) {
            this.applyPendingGrow(server, operation);
            return;
        }

        if (WorkerAction.Weaken === operation.action) {
            this.applyPendingWeaken(server, operation);
        }
    }

    private applyPendingHack(server: Server, operation: ScheduledBatchOperation): void
    {
        const player = this.context.getPlayer();
        const hackPercent = this.context.ns.formulas.hacking.hackPercent(server, player);
        const hackRatio = Math.min(1, Math.max(0, hackPercent * operation.threads));
        const moneyAvailable = server.moneyAvailable ?? 0;
        const effectiveThreads = hackPercent > 0
            ? Math.min(operation.threads, Math.ceil(1 / hackPercent))
            : operation.threads;

        server.moneyAvailable = Math.max(0, moneyAvailable * (1 - hackRatio));
        this.increaseServerSecurity(server, calculateHackSecurityIncrease(effectiveThreads));
    }

    private applyPendingGrow(server: Server, operation: ScheduledBatchOperation): void
    {
        const formulas = this.context.ns.formulas.hacking;
        const player = this.context.getPlayer();

        for (const fragment of operation.fragments) {
            const moneyBefore = server.moneyAvailable ?? 0;
            const moneyAfter = formulas.growAmount(
                server,
                player,
                fragment.threads,
                fragment.cpuCores,
            );

            if (moneyAfter === moneyBefore) {
                continue;
            }

            const requiredThreads = formulas.growThreads(
                server,
                player,
                moneyAfter,
                fragment.cpuCores,
            );
            const effectiveThreads = Number.isFinite(requiredThreads)
                ? Math.min(fragment.threads, Math.max(0, Math.ceil(requiredThreads)))
                : fragment.threads;

            server.moneyAvailable = moneyAfter;
            this.increaseServerSecurity(server, calculateGrowSecurityIncrease(effectiveThreads));
        }
    }

    private applyPendingWeaken(server: Server, operation: ScheduledBatchOperation): void
    {
        const weakenEffect = operation.fragments.reduce(
            (totalEffect, fragment) => totalEffect + this.context.ns.formulas.hacking.weakenEffect(
                fragment.threads,
                fragment.cpuCores,
            ),
            0,
        );
        const minimumSecurity = server.minDifficulty ?? 1;
        const currentSecurity = server.hackDifficulty ?? minimumSecurity;

        server.hackDifficulty = Math.max(minimumSecurity, currentSecurity - weakenEffect);
    }

    private increaseServerSecurity(server: Server, securityIncrease: number): void
    {
        const minimumSecurity = server.minDifficulty ?? 1;
        const currentSecurity = server.hackDifficulty ?? minimumSecurity;

        server.hackDifficulty = Math.min(100, currentSecurity + securityIncrease);
    }
}
