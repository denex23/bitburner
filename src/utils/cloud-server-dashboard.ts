import { NS } from '@ns';

export async function main(ns: NS)
{
    initTail(ns);

    const ram: number = ns.args.length > 0 ? parseInt(ns.args[0].toString()) : 0;
    const cloudServer = ns.cloud.getServerNames();
    const maxServerCount = ns.cloud.getServerLimit();
    const maxRamLimit = ns.cloud.getRamLimit();
    

    ns.print("=== Cloud-Server Overview ===")
    ns.print(`Aktuelle Anzahl: ${cloudServer.length} / ${maxServerCount}`)
    ns.print(`Max RAM per Server: ${ns.format.ram(maxRamLimit)}`);

    if (maxServerCount !== cloudServer.length) {
        ns.print("Serverkosten:");
        for (let i = 1; i <= maxRamLimit; i *= 2) {
            ns.print(`${ns.format.ram(i)} - ${ns.format.number(ns.cloud.getServerCost(i), 3)}€`);
        }
    }

    
    if (cloudServer.length > 0) {
        let total: number = 0;

        ns.print("\nServer in Besitz:");
        for (const server of cloudServer) {
            const currentRam = ns.getServerMaxRam(server);
            let line = `${server} | ${ns.format.ram(currentRam)}`
            if (currentRam < maxRamLimit) {
                const updateRam = (ram > currentRam) ? ram : currentRam * 2
                const cost = ns.cloud.getServerUpgradeCost(server, updateRam);
                total += cost;
                line += ` | Upgrade to ${ns.format.ram(updateRam)} cost: ${ns.format.number(cost)}€`;
            }

            ns.print(line);
        }

        if (total > 0) {
            ns.print(`\nGesamte Updatekosten: ${ns.format.number(total)}€`);
        }
    }
}

export function initTail(ns: NS): void
{
    ns.disableLog("ALL");
    ns.clearLog();
    ns.ui.openTail();
    ns.ui.moveTail(60, 10);
    ns.ui.resizeTail(600, 1000);
}