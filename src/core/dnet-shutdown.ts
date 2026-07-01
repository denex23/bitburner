import { NS } from '@ns'

const DNET_CONTROL_PORT = 25;
const SHUTDOWN_COMMAND = "shutdown";
const SHUTDOWN_SIGNAL_DURATION = 30_000

export async function main(ns: NS): Promise<void>
{
    ns.clearPort(DNET_CONTROL_PORT);
    ns.writePort(DNET_CONTROL_PORT, SHUTDOWN_COMMAND);

    ns.tprint("DNet crawler shutdown signal sent.");

    await ns.sleep(SHUTDOWN_SIGNAL_DURATION);

    ns.clearPort(DNET_CONTROL_PORT);

    ns.tprint("DNet crawler shutdown signal cleared.");
}