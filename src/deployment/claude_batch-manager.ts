import { NS, Player, Server } from '@ns';
import { ARBITER_REQUEST_PORT, ARBITER_TIMEOUT_MS, ReserveRequest, ReserveReply } from '/src/deployment/claude_arbiter-protocol';
import {
    SCRIPT_MAP, SCRIPT_RAM, WorkerAction,
    HACK_SECURITY_INCREASE, GROW_SECURITY_INCREASE,
    TARGET_HACK_RATIO, BATCH_SPACING_MS, RESERVED_HOME_RAM,
} from 'src/utils/constants';

const SECURITY_TOLERANCE = 0.01;
const MONEY_TOLERANCE = 0.99;
const BATCH_INTERVAL_MS = 5 * BATCH_SPACING_MS;
const WORKER_SCRIPTS = new Set<string>(Object.values(SCRIPT_MAP));

interface BatchOp
{
    action: WorkerAction;
    threads: number;
    landAt: number;
    actionTime: number;
}

export async function main(ns: NS): Promise<void>
{
    const target = String(ns.args[0]);
    const replyPort = Number(ns.args[1]);
    ns.disableLog('ALL');

    await prepTarget(ns, target, replyPort);

    let nextLand = Date.now() + ns.formulas.hacking.weakenTime(optimalServer(ns, target), ns.getPlayer()) + BATCH_INTERVAL_MS;
    let batch = 0;
    let tick = 0;

    while (true) {
        const now = Date.now();
        const floorAnchor = now + ns.formulas.hacking.weakenTime(optimalServer(ns, target), ns.getPlayer()) + BATCH_SPACING_MS;
        nextLand = Math.max(nextLand, floorAnchor);

        if (await reserveAndExec(ns, target, planBatch(ns, target, nextLand), replyPort)) {
            batch++;
            nextLand += BATCH_INTERVAL_MS;
        }

        if (++tick % 5 === 0) logStatus(ns, target, batch);
        await ns.sleep(BATCH_INTERVAL_MS);
    }
}

// Just for Debug
function logStatus(ns: NS, target: string, batch: number): void
{
    const server = ns.getServer(target);
    const moneyPct = (server.moneyAvailable! / server.moneyMax!) * 100;
    const secOver = server.hackDifficulty! - server.minDifficulty!;
    const pool = getWorkers(ns).reduce((sum, h) => sum + freeRam(ns, h), 0);

    ns.print(`... poolFree ${(pool / 1e3).toFixed(1)}TB`);
    ns.print(`#${batch}  money ${moneyPct.toFixed(1)}%  sec +${secOver.toFixed(3)}  inflight ${countInFlight(ns, target)}`);
}

function countInFlight(ns: NS, target: string): number
{
    let count = 0;

    for (const host of getWorkers(ns)) {
        for (const process of ns.ps(host)) {
            if (WORKER_SCRIPTS.has(process.filename) && String(process.args[0] ?? '') === target) {
                count++;
            }
        }
    }

    return count;
}

function planBatch(ns: NS, target: string, anchor: number): BatchOp[]
{
    const player = ns.getPlayer();
    const server = optimalServer(ns, target);

    const hackTime = ns.formulas.hacking.hackTime(server, player);
    const growTime = ns.formulas.hacking.growTime(server, player);
    const weakenTime = ns.formulas.hacking.weakenTime(server, player);
    const weakenEffect = ns.formulas.hacking.weakenEffect(1);

    const hackPercent = ns.formulas.hacking.hackPercent(server, player);
    const hackThreads = Math.max(1, Math.floor(TARGET_HACK_RATIO / hackPercent));
    const hackWeaken = Math.ceil((hackThreads * HACK_SECURITY_INCREASE) / weakenEffect);

    const afterHack: Server = { ...server, moneyAvailable: Math.max(1, server.moneyMax! * (1 - TARGET_HACK_RATIO)) };
    const growThreads = Math.max(1, Math.ceil(ns.formulas.hacking.growThreads(afterHack, player, server.moneyMax!)));
    const growWeaken = Math.ceil((growThreads * GROW_SECURITY_INCREASE) / weakenEffect);

    return [
        { action: WorkerAction.Hack, threads: hackThreads, landAt: anchor - BATCH_SPACING_MS, actionTime: hackTime },
        { action: WorkerAction.Weaken, threads: hackWeaken, landAt: anchor, actionTime: weakenTime },
        { action: WorkerAction.Grow, threads: growThreads, landAt: anchor + BATCH_SPACING_MS, actionTime: growTime },
        { action: WorkerAction.Weaken, threads: growWeaken, landAt: anchor + 2 * BATCH_SPACING_MS, actionTime: weakenTime },
    ];
}

async function reserveAndExec(ns: NS, target: string, ops: BatchOp[], replyPort: number): Promise<boolean>
{
    ns.clearPort(replyPort);
    const reserveNow = Date.now();

    ns.writePort(ARBITER_REQUEST_PORT, {
        target, replyPort,
        ops: ops.map(op => ({
            threads: op.threads,
            ramPerThread: SCRIPT_RAM[op.action],
            durationMs: Math.max(0, op.landAt - reserveNow),
        })),
    } satisfies ReserveRequest);

    const reply = await waitReply(ns, replyPort, ARBITER_TIMEOUT_MS);
    if (!reply?.granted) return false;

    for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        for (const { host, threads } of reply.placements[i]) {
            await ns.scp(SCRIPT_MAP[op.action], host);
            const additionalMsec = Math.max(0, op.landAt - Date.now() - op.actionTime);   // JETZT, nicht bei planBatch
            ns.exec(SCRIPT_MAP[op.action], host, threads, target, additionalMsec);
        }
    }
    return true;
}

async function waitReply(ns: NS, replyPort: number, timeoutMs: number): Promise<ReserveReply | null>
{
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
        const raw = ns.readPort(replyPort);
        if (raw !== 'NULL PORT DATA') return raw as ReserveReply;
        await ns.sleep(10);
    }

    return null;
}

function isPrepped(ns: NS, target: string): boolean
{
    const server = ns.getServer(target);

    return server.hackDifficulty! <= server.minDifficulty! + SECURITY_TOLERANCE
        && server.moneyAvailable! >= server.moneyMax! * MONEY_TOLERANCE;
}

async function prepTarget(ns: NS, target: string, replyPort: number): Promise<void>
{
    while (!isPrepped(ns, target)) {
        const server = ns.getServer(target);
        const player = ns.getPlayer();

        if (server.hackDifficulty! > server.minDifficulty! + SECURITY_TOLERANCE) {
            await weakenToMin(ns, target, server, player, replyPort);
        } else {
            await growToMax(ns, target, server, player, replyPort);
        }
    }
}

async function weakenToMin(ns: NS, target: string, server: Server, player: Player, replyPort: number): Promise<void>
{
    const secDelta = server.hackDifficulty! - server.minDifficulty!;
    const threads = Math.ceil(secDelta / ns.formulas.hacking.weakenEffect(1));
    const weakenTime = ns.formulas.hacking.weakenTime(server, player);

    const placed = await reserveAndExec(ns, target, [
        { action: WorkerAction.Weaken, threads, landAt: Date.now() + weakenTime, actionTime: weakenTime },
    ], replyPort);

    await ns.sleep(placed ? weakenTime + BATCH_SPACING_MS : BATCH_SPACING_MS);
}

async function growToMax(ns: NS, target: string, server: Server, player: Player, replyPort: number): Promise<void>
{
    const weakenEffect = ns.formulas.hacking.weakenEffect(1);
    const snapshot: Server = { ...server, hackDifficulty: server.minDifficulty! };

    const growThreads = Math.max(1, Math.ceil(ns.formulas.hacking.growThreads(snapshot, player, server.moneyMax!)));
    const growWeaken = Math.ceil((growThreads * GROW_SECURITY_INCREASE) / weakenEffect);
    const weakenTime = ns.formulas.hacking.weakenTime(server, player);
    const growTime = ns.formulas.hacking.growTime(server, player);

    const base = Date.now();
    const placed = await reserveAndExec(ns, target, [
        { action: WorkerAction.Grow, threads: growThreads, landAt: base + weakenTime - BATCH_SPACING_MS, actionTime: growTime },
        { action: WorkerAction.Weaken, threads: growWeaken, landAt: base + weakenTime, actionTime: weakenTime },
    ], replyPort);

    await ns.sleep(placed ? weakenTime + BATCH_SPACING_MS : BATCH_SPACING_MS);
}

function optimalServer(ns: NS, target: string): Server
{
    const server = ns.getServer(target);

    server.moneyAvailable = server.moneyMax;
    server.hackDifficulty = server.minDifficulty;

    return server;
}

function getWorkers(ns: NS): string[]
{
    const seen = new Set<string>();
    const stack = ['home'];
    const workers: string[] = [];

    while (stack.length > 0) {
        const host = stack.pop()!;

        if (seen.has(host)) {
            continue;
        }

        seen.add(host);

        for (const neighbor of ns.scan(host)) {
            stack.push(neighbor);
        }

        if (ns.hasRootAccess(host) && ns.getServerMaxRam(host) > 0) {
            workers.push(host);
        }
    }

    return workers;
}

function freeRam(ns: NS, host: string): number
{
    const reserve = host === 'home' ? RESERVED_HOME_RAM : 0;

    return Math.max(0, ns.getServerMaxRam(host) - ns.getServerUsedRam(host) - reserve);
}