import { NS } from '@ns';
import { ARBITER_REQUEST_PORT, ARBITER_SCORE_PORT, ReserveRequest } from '/src/deployment/claude_arbiter-protocol';

export async function main(ns: NS): Promise<void>
{
    const replyPort = 900;

    // Dem Arbiter ein Budget fürs Test-Target geben (voller Pool, da einziges Target)
    ns.clearPort(ARBITER_SCORE_PORT);
    ns.writePort(ARBITER_SCORE_PORT, [{ target: 'probe', score: 1 }]);
    await ns.sleep(100);

    ns.clearPort(replyPort);
    ns.writePort(ARBITER_REQUEST_PORT, {
        target: 'probe',
        replyPort,
        ops: [
            { threads: 500000, ramPerThread: 1.75, durationMs: 8000 },
            { threads: 200000, ramPerThread: 1.75, durationMs: 8000 },
        ],
    } satisfies ReserveRequest);

    await ns.sleep(100);
    ns.tprint('reply: ' + JSON.stringify(ns.readPort(replyPort)));
}