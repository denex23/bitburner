export const ARBITER_REQUEST_PORT = 1;
export const ARBITER_SCORE_PORT = 2;
export const ARBITER_TICK_MS = 200;
export const ARBITER_TIMEOUT_MS = 5 * ARBITER_TICK_MS;

export interface OpRequest
{
    threads: number;
    ramPerThread: number;
    durationMs: number;
}

export interface ReserveRequest
{
    target: string;
    replyPort: number;
    ops: OpRequest[];
}

export interface ReserveReply
{
    granted: boolean;
    placements: { host: string; threads: number }[][];
}

export interface TargetScore
{
    target: string;
    score: number;
}