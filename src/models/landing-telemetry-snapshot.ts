import { LandingTelemetryOperation } from "src/models/landing-telemetry-operation";
import { LandingTelemetrySample } from "src/models/landing-telemetry-sample";

export interface LandingTelemetrySnapshot
{
    operations: LandingTelemetryOperation[];
    samples: LandingTelemetrySample[];
    unmatchedEvents: number;
    portWriteFailures: number;
}
