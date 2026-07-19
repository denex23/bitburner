import { WorkerCompletionEvent } from "src/models/worker-completion-event";

export interface LandingTelemetrySample extends WorkerCompletionEvent
{
    expectedLandingAt: number;
    driftMs: number;
}
