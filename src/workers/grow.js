export async function main(ns)
{
    const target = String(ns.args[0]);
    const additionalMsec = Number(ns.args[1]);
    const batchId = String(ns.args[2]);
    const operationIndex = Number(ns.args[3]);
    const hostname = String(ns.args[4]);
    const threads = Number(ns.args[5]);
    const telemetryPort = Number(ns.args[6]);
    const telemetryFailurePort = Number(ns.args[7]);

    await ns.grow(target, { additionalMsec });

    const landedAt = Date.now();
    const telemetryWasWritten = ns.tryWritePort(telemetryPort, {
        batchId,
        target,
        action: "grow",
        hostname,
        threads,
        operationIndex,
        additionalMsec,
        landedAt,
    });

    if (false === telemetryWasWritten) {
        ns.tryWritePort(telemetryFailurePort, landedAt);
    }
}
