import { NS } from '@ns';

export async function main(ns: NS)
{
    const ram: number = ns.args.length > 0 ? parseInt(ns.args[0].toString()) : 8;
    const cloudServer = ns.cloud.getServerNames();

    if (cloudServer.length > 0 && ram < ns.cloud.getRamLimit()) {
        for (const server of cloudServer) {
            const currentRam = ns.getServerMaxRam(server);
            if (currentRam < ram) {
                ns.cloud.upgradeServer(server, ram);
            } 
        }
    }
}