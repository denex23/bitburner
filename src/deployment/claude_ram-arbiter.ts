import { NS } from '@ns';
import { RESERVED_HOME_RAM } from 'src/utils/constants';
import
    {
        ARBITER_REQUEST_PORT, ARBITER_SCORE_PORT, ARBITER_TICK_MS,
        ReserveRequest, ReserveReply, TargetScore,
    } from '/src/deployment/claude_arbiter-protocol';

interface Reservation
{
    target: string;
    host: string;
    ram: number;
    expiresAt: number;
}

interface HostRam
{
    capacity: number;
    free: number;
};

const HOST_DISCOVERY_INTERVAL_MS = 5000;
const STATUS_LOG_INTERVAL_MS = 1000;

export async function main(ns: NS): Promise<void>
{
    ns.disableLog('ALL');
    ns.ui.openTail();

    const hosts = new Map<string, HostRam>();
    const usedByTarget = new Map<string, number>();
    const budget = new Map<string, number>();
    const reservations: Reservation[] = [];
    let scores: TargetScore[] = [];

    let lastDiscovery = 0;
    let lastStatusLog = 0;

    discoverHosts(ns, hosts);

    while (true) {
        const now = Date.now();

        pruneExpired(reservations, hosts, usedByTarget, now);

        scores = readLatestScores(ns, scores);
        refreshBudgets(scores, hosts, budget);

        if (now - lastDiscovery > HOST_DISCOVERY_INTERVAL_MS) {
            discoverHosts(ns, hosts);
            lastDiscovery = now;
        }

        let raw: unknown;
        while ((raw = ns.readPort(ARBITER_REQUEST_PORT)) !== 'NULL PORT DATA') {
            const req = raw as ReserveRequest;
            const placements = tryReserve(req, hosts, usedByTarget, budget, reservations, now);
            ns.writePort(req.replyPort, {
                granted: placements !== null,
                placements: placements ?? [],
            } satisfies ReserveReply);
        }

        if (now - lastStatusLog > STATUS_LOG_INTERVAL_MS) {
            logStatus(ns, hosts, usedByTarget, budget, reservations);
            lastStatusLog = now;
        }

        await ns.sleep(ARBITER_TICK_MS);
    }
}

function tryReserve(
    req: ReserveRequest,
    hosts: Map<string, HostRam>,
    usedByTarget: Map<string, number>,
    budget: Map<string, number>,
    reservations: Reservation[],
    now: number,
): ReserveReply['placements'] | null
{
    const totalRam = req.ops.reduce((sum, op) => sum + op.threads * op.ramPerThread, 0);

    if ((usedByTarget.get(req.target) ?? 0) + totalRam > (budget.get(req.target) ?? 0)) {
        return null;
    }

    const taken = new Map<string, number>();   // host -> in diesem Versuch vorgemerktes RAM
    const placements: ReserveReply['placements'] = [];

    for (const op of req.ops) {
        let remaining = op.threads;
        const spread: { host: string; threads: number }[] = [];

        for (const [host, state] of hosts) {
            if (remaining <= 0) break;
            const available = state.free - (taken.get(host) ?? 0);
            const fit = Math.min(remaining, Math.floor(available / op.ramPerThread));
            if (fit <= 0) continue;

            spread.push({ host, threads: fit });
            taken.set(host, (taken.get(host) ?? 0) + fit * op.ramPerThread);
            remaining -= fit;
        }

        if (remaining > 0) return null;
        placements.push(spread);
    }

    // Commit: nur die berührten Hosts anfassen
    for (const [host, ram] of taken) {
        hosts.get(host)!.free -= ram;
    }
    for (let i = 0; i < req.ops.length; i++) {
        for (const p of placements[i]) {
            reservations.push({ target: req.target, host: p.host, ram: p.threads * req.ops[i].ramPerThread, expiresAt: now + req.ops[i].durationMs });
        }
    }
    usedByTarget.set(req.target, (usedByTarget.get(req.target) ?? 0) + totalRam);

    return placements;
}

function pruneExpired(
    reservations: Reservation[],
    hosts: Map<string, HostRam>,
    usedByTarget: Map<string, number>,
    now: number,
): void
{
    for (let i = reservations.length - 1; i >= 0; i--) {
        const r = reservations[i];
        if (r.expiresAt > now) continue;

        const state = hosts.get(r.host);
        if (state) state.free += r.ram;

        usedByTarget.set(r.target, Math.max(0, (usedByTarget.get(r.target) ?? 0) - r.ram));
        reservations.splice(i, 1);
    }
}

function readLatestScores(ns: NS, previous: TargetScore[]): TargetScore[]
{
    let latest = previous;
    let raw: unknown;

    while ((raw = ns.readPort(ARBITER_SCORE_PORT)) !== 'NULL PORT DATA') {
        latest = raw as TargetScore[];
    }

    return latest;
}

function refreshBudgets(scores: TargetScore[], hosts: Map<string, HostRam>, budget: Map<string, number>): void
{
    const totalCapacity = [...hosts.values()].reduce((sum, ram) => sum + ram.capacity, 0);
    const totalScore = scores.reduce((sum, t) => sum + t.score, 0);

    budget.clear();
    if (totalScore <= 0) return;

    for (const { target, score } of scores) {
        budget.set(target, (score / totalScore) * totalCapacity);
    }
}

function discoverHosts(ns: NS, hosts: Map<string, HostRam>): void
{
    for (const host of scanAll(ns)) {
        if (!ns.hasRootAccess(host)) continue;

        const usable = Math.max(0, ns.getServerMaxRam(host) - (host === 'home' ? RESERVED_HOME_RAM : 0));
        if (usable <= 0) continue;

        const previous = hosts.get(host);
        if (undefined === previous) {
            hosts.set(host, {
                capacity: usable,
                free: usable
            })
        } else if (usable > previous.capacity) {
            previous.capacity = usable;
            previous.free += (usable - previous.capacity)
        }
    }
}

function scanAll(ns: NS): string[]
{
    const seen = new Set<string>();
    const stack = ['home'];

    while (stack.length > 0) {
        const host = stack.pop()!;
        if (seen.has(host)) continue;
        seen.add(host);
        for (const neighbor of ns.scan(host)) stack.push(neighbor);
    }

    return [...seen];
}

function logStatus(
    ns: NS,
    hosts: Map<string, HostRam>,
    usedByTarget: Map<string, number>,
    budget: Map<string, number>,
    reservations: Reservation[],
): void
{
    // ns.print via closure -> hier bewusst simpel gehalten
    const totalFree = [...hosts.values()].reduce((sum, ram) => sum + ram.free, 0);
    const lines = [...usedByTarget.entries()]
        .map(([t, used]) => `  ${t}: ${(used / 1e3).toFixed(1)}/${((budget.get(t) ?? 0) / 1e3).toFixed(1)}TB`);

    ns.print(`free ${(totalFree / 1e3).toFixed(1)}TB  res ${reservations.length}\n${lines.join('\n') }`);
}