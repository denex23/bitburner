import { ServerInfo } from "src/models/server-info"

export function calculateScore(server: ServerInfo): number 
{
    // credits to ChatGPT which had the idea with Math.log10
    return server.maxMoney <= 0
        ? 0
        : (
            server.maxMoney 
            * Math.log10(server.maxMoney) 
            * Math.min(1, (server.maxMoney / 100_000_000))
            * server.growth 
            * server.chance
        ) / (server.minSecurity + 1);
}