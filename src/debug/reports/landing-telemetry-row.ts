import { WorkerAction } from "src/utils/constants";

export interface LandingTelemetryRow
{
    action: WorkerAction;
    operations: number;
    expectedFragments: number;
    reportedFragments: number;
    missingFragments: number;
    averageDriftMs: number;
    minimumDriftMs: number;
    maximumDriftMs: number;
    maximumFragmentSpreadMs: number;
}
