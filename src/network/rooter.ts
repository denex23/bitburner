import { Context } from '/src/models/context';

import { ServerInfo } from "/src/models/server-info"
import { RootResult } from "/src/models/root-result"

export class Rooter {
    constructor(protected readonly context: Context) {}

    public root(servers: ServerInfo[]): RootResult[] {
        const results: RootResult[] = [];
        const availablePorts = this.getAvailablePortPrograms();

        for (const server of servers) {
            if (server.hostname === "home") {
                continue;
            }

            results.push(this.tryRoot(server, availablePorts));
        }

        return results;
    }

    private tryRoot(server: ServerInfo, availablePorts: number): RootResult {
        const {ns} = this.context;

        if (server.rooted) {
            return {
                hostname: server.hostname,
                success: true,
                alreadyRooted: true,
                requiredPorts: server.requiredPorts,
                availablePorts: availablePorts,
            }
        }

        if (availablePorts < server.requiredPorts) {
            return {
                hostname: server.hostname,
                success: false,
                alreadyRooted: false,
                requiredPorts: server.requiredPorts,
                availablePorts: availablePorts,
            };
        }

        this.openPorts(server.hostname);
        ns.nuke(server.hostname);

        return {
            hostname: server.hostname,
            success: ns.hasRootAccess(server.hostname),
            alreadyRooted: false,
            requiredPorts: server.requiredPorts,
            availablePorts: availablePorts,
        };
    }

    private getAvailablePortPrograms(): number {
        const {ns} = this.context;
        let count = 0;

        if (ns.fileExists("BruteSSH.exe")) count++;
        if (ns.fileExists("FTPCrack.exe")) count++;
        if (ns.fileExists("relaySMTP.exe")) count++;
        if (ns.fileExists("HTTPWorm.exe")) count++;
        if (ns.fileExists("SQLInject.exe")) count++;

        return count;
    }

    private openPorts(hostname: string): void {
        const {ns} = this.context;
        if (ns.fileExists("BruteSSH.exe", "home")) ns.brutessh(hostname);
        if (ns.fileExists("FTPCrack.exe", "home")) ns.ftpcrack(hostname);
        if (ns.fileExists("relaySMTP.exe", "home")) ns.relaysmtp(hostname);
        if (ns.fileExists("HTTPWorm.exe", "home")) ns.httpworm(hostname);
        if (ns.fileExists("SQLInject.exe", "home")) ns.sqlinject(hostname);
    }
}
