import { NS } from '@ns';
import { Context } from 'src/models/context';
import { Scanner } from 'src/network/scanner';
import { Rooter } from 'src/network/rooter';
import { TargetSelector } from 'src/targets/target-selector';
import { TargetInfo } from 'src/models/target-info';
import { CONTROLLER_INTERVAL_MS } from 'src/utils/constants';
import { ARBITER_SCORE_PORT, TargetScore } from '/src/deployment/claude_arbiter-protocol';

const RAM_ARBITER = 'src/deployment/claude_ram-arbiter.ts';
const BATCH_MANAGER = 'src/deployment/claude_batch-manager.ts';
const MAX_MANAGERS = 10;
const REPLY_PORT_BASE = 100;

export async function main(ns: NS): Promise<void>
{
    ns.disableLog('ALL');

    const context = new Context(ns);
    const scanner = new Scanner(context);
    const rooter = new Rooter(context);
    const selector = new TargetSelector(context);
    const replyPorts = new Map<string, number>();

    while (true) {
        context.beginTick();
        ensureArbiter(ns);

        const servers = scanner.scan();
        rooter.root(servers);
        const targets = selector.select(servers);

        const wanted = [...targets].sort((a, b) => b.score - a.score).slice(0, MAX_MANAGERS);

        publishScores(ns, wanted);
        syncManagers(ns, wanted.map(t => t.hostname), replyPorts);

        await ns.sleep(CONTROLLER_INTERVAL_MS);
    }
}

function ensureArbiter(ns: NS): void
{
    if (!ns.ps('home').some(process => process.filename === RAM_ARBITER)) {
        ns.exec(RAM_ARBITER, 'home', 1);
    }
}

function publishScores(ns: NS, wanted: TargetInfo[]): void
{
    ns.clearPort(ARBITER_SCORE_PORT);
    ns.writePort(ARBITER_SCORE_PORT, wanted.map(t => ({ target: t.hostname, score: t.score })) satisfies TargetScore[]);
}

function syncManagers(ns: NS, wanted: string[], replyPorts: Map<string, number>): void
{
    const wantedSet = new Set(wanted);
    const running = new Map<string, number>();

    for (const process of ns.ps('home')) {
        if (process.filename === BATCH_MANAGER) {
            running.set(String(process.args[0] ?? ''), process.pid);
        }
    }

    for (const [target, pid] of running) {
        if (!wantedSet.has(target)) ns.kill(pid);
    }

    for (const target of wanted) {
        if (!running.has(target)) {
            ns.exec(BATCH_MANAGER, 'home', 1, target, replyPortFor(target, replyPorts));
        }
    }
}

function replyPortFor(target: string, replyPorts: Map<string, number>): number
{
    let port = replyPorts.get(target);
    if (port === undefined) {
        port = REPLY_PORT_BASE + replyPorts.size;
        replyPorts.set(target, port);
    }

    return port;
}