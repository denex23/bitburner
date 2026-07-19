import { WorkerAction } from "src/utils/constants";

export interface LandingTelemetryOperation
{
    batchId: string;
    target: string;
    action: WorkerAction;
    operationIndex: number;
    additionalMsec: number;
    expectedLandingAt: number;
    expectedFragments: number;
}
