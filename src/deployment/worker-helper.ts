import { ServerInfo } from "src/models/server-info";
import { RESERVED_HOME_RAM } from "src/utils/constants";

export function getWorkerRam(server: ServerInfo): number
{
    return (server.hostname === "home")
        ? Math.max(0, server.maxRam - RESERVED_HOME_RAM)
        : server.maxRam
}

export function isWorkerServer(server: ServerInfo): boolean
{
    return server.rooted && getWorkerRam(server) > 0;
}