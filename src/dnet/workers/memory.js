/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = String(ns.args[0] ?? "");

    if (!target) {
        return;
    }

    while (ns.dnet.getBlockedRam(target) > 0) {
        await ns.dnet.memoryReallocation(target);
    }
}