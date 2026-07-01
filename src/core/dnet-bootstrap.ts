import { NS } from "@ns";

const CRAWLER_SCRIPT = "src/core/dnet-crawler.ts";
const PASSWORD_WRITER = "src/data/password-writer.ts";
const LOG_WRITER = "src/data/dnet-log-writer.ts";
const ENTRY_SERVER = "darkweb";

export async function main(ns: NS): Promise<void>
{
    startIfMissing(ns, PASSWORD_WRITER, "home");
    startIfMissing(ns, LOG_WRITER, "home");

    await ns.scp(CRAWLER_SCRIPT, ENTRY_SERVER);

    if (!ns.scriptRunning(CRAWLER_SCRIPT, ENTRY_SERVER)) {
        ns.exec(CRAWLER_SCRIPT, ENTRY_SERVER, 1);
    }
}

function startIfMissing(ns: NS, script: string, host: string): void
{
    if (ns.scriptRunning(script, host)) {
        return;
    }

    ns.exec(script, host, 1);
}