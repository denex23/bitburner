import { NS, Player, Server } from '@ns';
import { TargetInfo } from 'src/models/target-info';

export class Context 
{
    private player?: Player;
    private readonly serverCache = new Map<string, Server>();

    constructor(public readonly ns: NS,) {}

    public beginTick(): void
    {
        this.player = undefined;
        this.serverCache.clear();
    }

    public getPlayer(): Player
    {
        return this.player ??= this.ns.getPlayer();
    }

    public getServer(hostname: string): Server
    {
        let server = this.serverCache.get(hostname);

        if (server === undefined) {
            server = this.ns.getServer(hostname);
            this.serverCache.set(hostname, server);
        }

        return { ...server };
    }

    public toFormulaServer(target: TargetInfo): Server
    {
        const server = this.getServer(target.hostname);

        server.moneyAvailable = Math.max(1, target.currentMoney);
        server.moneyMax = target.maxMoney;
        server.hackDifficulty = target.currentSecurity;

        return server;
    }
}