/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    if (!ns.dnet.isDarknetServer(ns.getHostname())) {
        return;
    }

    await ns.dnet.phishingAttack();
}