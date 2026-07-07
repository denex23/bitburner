import { authenticateTarget } from "src/dnet/dnet-auth-solver";

/** @param {NS} ns  */
export async function main(ns) {
    ns.disableLog("ALL");
    
    const target = String(ns.args[0] ?? "");

    if (!target) {
        return;
    }

    await authenticateTarget(ns, target);
}