import { NS } from '@ns'
import { PASSWORD_WRITER, LOG_WRITER } from "../utils/constants";

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

    ns.scriptKill(PASSWORD_WRITER);
    ns.scriptKill(LOG_WRITER);

    ns.tprint("Writer processes killed.");
}