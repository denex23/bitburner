import { NS } from "@ns";

import {
    DNET_CRAWLER_SCRIPT,
    DNET_ENTRY_SERVER,
    DNET_FILES,
} from "src/dnet/constants";

import {
    LOG_WRITER,
    PASSWORD_WRITER,
    TXT_WRITER,
} from "src/utils/constants";

export async function main(ns: NS): Promise<void>
{
    ns.disableLog("ALL");

    startIfMissing(ns, PASSWORD_WRITER, "home");
    startIfMissing(ns, LOG_WRITER, "home");
    startIfMissing(ns, TXT_WRITER, "home");

    while (true) {
        await deployFiles(ns, DNET_ENTRY_SERVER);

        if (!ns.isRunning(DNET_CRAWLER_SCRIPT, DNET_ENTRY_SERVER, DNET_ENTRY_SERVER)) {
            const pid = ns.exec(DNET_CRAWLER_SCRIPT, DNET_ENTRY_SERVER, 1, DNET_ENTRY_SERVER);

            if (pid === 0) {
                ns.tprint(`[DNET] failed to start crawler on ${DNET_ENTRY_SERVER}`);
            } else {
                ns.tprint(`[DNET] crawler started on ${DNET_ENTRY_SERVER}, pid=${pid}`);
            }
        }

        await ns.dnet.nextMutation();
    }
}

function startIfMissing(ns: NS, script: string, host: string): void
{
    if (ns.scriptRunning(script, host)) {
        return;
    }

    ns.exec(script, host, 1);
}

async function deployFiles(ns: NS, host: string): Promise<void>
{
    for (const file of DNET_FILES) {
        if (!ns.fileExists(file, "home")) {
            ns.tprint(`[DNET] missing file on home: ${file}`);
            continue;
        }

        await ns.scp(file, host, "home");
    }
}