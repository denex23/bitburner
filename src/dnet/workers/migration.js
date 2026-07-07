/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");

    const target = String(ns.args[0] ?? "");

    if (!target || target === ns.getHostname()) {
        return;
    }

    await ns.dnet.induceServerMigration(target);
}