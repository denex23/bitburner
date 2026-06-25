import { Context } from "/src/models/context";

import { ServerInfo } from "/src/models/server-info";

export class Scanner {
    constructor(protected readonly context: Context) {}

    public scan(): ServerInfo[] {
        const discovered: Set<string> = new Set<string>();
        const servers: ServerInfo[] = [];

        this.scanRecursive("home", discovered, servers);

        return servers;
    }

    private scanRecursive(hostname: string, discovered: Set<string>, servers: ServerInfo[]): void {
        if (discovered.has(hostname)){
            return;
        } 

        discovered.add(hostname);
        servers.push(this.createServerInfo(hostname));

        for (const neighbor of this.context.ns.scan(hostname)) {
            this.scanRecursive(neighbor, discovered, servers);
        }
    }

    private createServerInfo(hostname: string): ServerInfo {
        const ns = this.context.ns;
        const server = ns.getServer(hostname);

        // We trust the game that server ist always correct
        return {
            hostname: server.hostname,
            rooted: server.hasAdminRights,
            requiredPorts: server.numOpenPortsRequired!,
            requiredHackLevel: server.requiredHackingSkill!,
            maxRam: server.maxRam,
            maxMoney: server.moneyMax!,
            currentMoney: server.moneyAvailable!,
            minSecurity: server.minDifficulty!,
            currentSecurity: server.hackDifficulty!,
            growth: server.serverGrowth!,
            hackTime: ns.getHackTime(),
            chance: ns.hackAnalyzeChance(server.hostname),
        };
    }
}