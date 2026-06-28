import { Context } from "src/models/context"
import { ServerInfo } from "src/models/server-info"
import { TargetInfo } from "src/models/target-info"
import { calculateScore } from "src/targets/target-score"
import { TargetState } from 'src/utils/constants';
import { STATE_WEIGHT } from "src/utils/constants"
import { calculateMoneyRatio, calculateSecurityDelta, calculateSecurityRatio } from "/src/utils/calculation-helper"

export class TargetSelector 
{
    constructor(protected readonly context: Context) {}

    public select(servers: ServerInfo[]): TargetInfo[] 
    {
        const targets: TargetInfo[] = [];

        for (const server of servers) {
            if (!server.rooted || server.maxMoney <= 0 || server.chance < 0.5) {
                continue;
            }

            const score = calculateScore(server);
            const state = this.determineState(server);
            const priority = this.calculatePriority(server, score, state);

            targets.push({
                hostname: server.hostname,
                score,
                state,
                priority: priority,
                maxMoney: server.maxMoney,
                currentMoney: server.currentMoney,
                minSecurity: server.minSecurity,
                currentSecurity: server.currentSecurity,
            });
        }

        return this.sortTargets(targets).slice(0, 15);
    }

    private determineState(server: ServerInfo): TargetState 
    {
        const moneyRatio = calculateMoneyRatio(server);
        const securityDelta = calculateSecurityDelta(server);

        if (securityDelta > 5) {
            return TargetState.Weaken;
        }

        if (moneyRatio < 0.90) {
            return TargetState.Grow;
        }

        return TargetState.Farm;
    }

    private sortTargets(targets: TargetInfo[]): TargetInfo[] 
    {
        return targets.sort((a, b) => {
            const stateDiff = STATE_WEIGHT[b.state] - STATE_WEIGHT[a.state];

            return (stateDiff !== 0) ? stateDiff : b.priority - a.priority;
        });
    }

    private calculatePriority(server: ServerInfo, score: number, state: TargetState): number 
    {
        if (TargetState.Weaken === state) {
            return this.calculateWeakenPriority(server, score, STATE_WEIGHT[state]);
        }

        if (TargetState.Grow === state) {
            return this.calculateGrowPriority(server, score, STATE_WEIGHT[state]);
        }

        return score * STATE_WEIGHT[state];
    }

    private calculateWeakenPriority(server: ServerInfo, score: number, stateWeight: number): number
    {
        return score * stateWeight * calculateSecurityRatio(server);
    }

    private calculateGrowPriority(server: ServerInfo, score: number, stateWeight: number): number 
    {
        const moneyDeficit = Math.max(0, (1 - calculateMoneyRatio(server)));

        return score * stateWeight * moneyDeficit * calculateSecurityRatio(server);
    }
}