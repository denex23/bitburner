/** @param {NS} ns */
export async function main(ns) {
    ns.disableLog("ALL");
    
    const symbol = String(ns.args[0] ?? "");

    if (!symbol) {
        return;
    }

    await ns.dnet.promoteStock(symbol);
}