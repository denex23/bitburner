import { ServerInfo } from "src/models/server-info"

export function calculateScore(server: ServerInfo): number {
    return server.maxMoney <= 0 
        ? 0 
        : (server.maxMoney * server.growth * server.chance) / (server.minSecurity + 1);
}