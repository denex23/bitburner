import { NS } from "@ns";

import {
    DNET_CONTROLLER_DELAY,
    DNET_CRAWLER_SCRIPT,
    DNET_FILES,
    DNET_PASSWORD_FILE,
} from "src/dnet/constants";

export async function main(ns: NS): Promise<void>
{
    ns.disableLog("ALL");

    while (true) {
        await ensureStasisCrawlers(ns);

        await ns.dnet.nextMutation();
        await ns.sleep(DNET_CONTROLLER_DELAY);
    }
}

async function ensureStasisCrawlers(ns: NS): Promise<void>
{
    const passwords = loadPasswords(ns);
    const stasisHosts = ns.dnet.getStasisLinkedServers(false);

    for (const host of stasisHosts) {
        if (!ns.dnet.isDarknetServer(host)) {
            continue;
        }

        const password = passwords[host];

        if (!password) {
            continue;
        }

        const session = ns.dnet.connectToSession(host, password);

        if (!session.success) {
            continue;
        }

        await deployFiles(ns, host);

        if (ns.isRunning(DNET_CRAWLER_SCRIPT, host, host)) {
            continue;
        }

        const pid = ns.exec(DNET_CRAWLER_SCRIPT, host, 1, host);

        if (pid !== 0) {
            ns.tprint(`[DNET] restarted crawler on stasis host ${host}`);
        }
    }
}

async function deployFiles(ns: NS, host: string): Promise<void>
{
    for (const file of DNET_FILES) {
        await ns.scp(file, host, "home");
    }
}

function loadPasswords(ns: NS): Record<string, string>
{
    if (!ns.fileExists(DNET_PASSWORD_FILE, "home")) {
        return {};
    }

    try {
        return JSON.parse(ns.read(DNET_PASSWORD_FILE)) as Record<string, string>;
    } catch {
        return {};
    }
}