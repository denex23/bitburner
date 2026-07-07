/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const file = String(ns.args[0] ?? "");

    if (!file) {
        return;
    }

    ns.dnet.openCache(file, true);
}