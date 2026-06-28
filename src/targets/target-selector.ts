import { Context } from "src/models/context"
import { ServerInfo } from "src/models/server-info"
import { TargetInfo } from "src/models/target-info"
import { calculateScore } from "src/targets/target-score"
import { TargetState } from 'src/utils/constants';
import { STATE_WEIGHT } from "src/utils/constants"
import { calculateMoneyRatio, calculateSecurityDelta } from "/src/utils/calculation-helper"

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
        const moneyDeficit = 1 - calculateMoneyRatio(server);
        const securityDelta = calculateSecurityDelta(server);
        
        switch (state) {
        case TargetState.Weaken:
            return score * (securityDelta / 10);
        case TargetState.Grow:
            return score * moneyDeficit;
        case TargetState.Farm:
            return score;
        }
    }
}