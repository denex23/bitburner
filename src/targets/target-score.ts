import { Server } from "@ns"
import { ServerInfo } from "src/models/server-info"
import { SCRIPT_RAM, TARGET_HACK_RATIO, GROW_SECURITY_INCREASE, HACK_SECURITY_INCREASE, WorkerAction } from "src/utils/constants"
import { Context } from "/src/models/context";

export function calculateScore(context: Context, serverInfo: ServerInfo): number 
{
    if (serverInfo.maxMoney <= 0) {
        return 0;
    }

    const ns = context.ns;
    const player = context.getPlayer();
    const server = createOptimalServer(context, serverInfo);
    const hackChance = ns.formulas.hacking.hackChance(server, player);
    const hackPercent = ns.formulas.hacking.hackPercent(server, player);
    const weakenTime = ns.formulas.hacking.weakenTime(server, player);

    if (hackChance <= 0 || hackPercent <= 0 || weakenTime <= 0) {
        return 0;
    }

    const hackThreads = Math.max(1, Math.floor(TARGET_HACK_RATIO / hackPercent));
    const stolenMoney = serverInfo.maxMoney * hackPercent * hackThreads * hackChance;
    const moneyAfterHack = Math.max(1, serverInfo.maxMoney - stolenMoney);

    server.moneyAvailable = moneyAfterHack;

    const growThreads = ns.formulas.hacking.growThreads(server, player, serverInfo.maxMoney);
    const hackWeakenThreads = Math.ceil((hackThreads * HACK_SECURITY_INCREASE) / ns.formulas.hacking.weakenEffect(1));
    const growWeakenThreads = Math.ceil((growThreads * GROW_SECURITY_INCREASE) / ns.formulas.hacking.weakenEffect(1));
    const totalRam = (hackThreads * SCRIPT_RAM[WorkerAction.Hack])
        + (growThreads * SCRIPT_RAM[WorkerAction.Grow])
        + ((hackWeakenThreads + growWeakenThreads) * SCRIPT_RAM[WorkerAction.Weaken]);

    if (totalRam <= 0) {
        return 0;
    }

    const moneyPerSecond = stolenMoney / (weakenTime / 1000);
    const ramPenalty = Math.max(1, Math.log2(totalRam));

    return moneyPerSecond / ramPenalty;
}

function createOptimalServer(context: Context, serverInfo: ServerInfo): Server
{
    const server = context.getServer(serverInfo.hostname);

    server.moneyAvailable = server.moneyMax;
    server.hackDifficulty = server.minDifficulty;

    return server;
}