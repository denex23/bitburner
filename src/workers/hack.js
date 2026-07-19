export async function main(ns)
{
    const target = String(ns.args[0]);
    const additionalMsec = Number(ns.args[1]);
    const batchId = String(ns.args[2]);
    const hostname = String(ns.args[3]);
    const threads = Number(ns.args[4]);
    const telemetryPort = Number(ns.args[5]);
    const telemetryFailurePort = Number(ns.args[6]);

    await ns.hack(target, { additionalMsec });

    const landedAt = Date.now();
    const telemetryWasWritten = ns.tryWritePort(telemetryPort, {
        batchId,
        target,
        action: "hack",
        hostname,
        threads,
        additionalMsec,
        landedAt,
    });

    if (false === telemetryWasWritten) {
        ns.tryWritePort(telemetryFailurePort, landedAt);
    }
}
