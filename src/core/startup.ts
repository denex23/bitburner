import { NS, ProgramName } from "@ns";
import { CloudServer, CONTROLLER_SCRIPT, FACTION_SERVERS } from "src/utils/constants";

export async function main(ns: NS): Promise<void>
{
    await runStartup(ns);
}

async function runStartup(ns: NS): Promise<void>
{
    startController(ns);
    if (0 < getSourceFileLevel(ns, 4)) {
        await buyTorAndPrograms(ns);
        await installFactionBackdoors(ns);
    }

    await buyCloudServers(ns);
}

function getSourceFileLevel(ns: NS, sourceFile: number): number
{
    return ns.singularity.getOwnedSourceFiles().find(file => file.n === sourceFile)?.lvl ?? 0;
}

async function buyTorAndPrograms(ns: NS): Promise<void>
{
    ns.singularity.purchaseTor();

    for (const program of getDarkwebProgramsNames(ns)) {
        while (!ns.fileExists(program, "home")) {
            if (ns.singularity.getDarkwebProgramCost(program) < ns.getServerMoneyAvailable()) {
                ns.singularity.purchaseProgram(program);

                ns.sleep(60000);
            }
        }
    }
}

function getDarkwebProgramsNames(ns: NS): ProgramName[]
{
    return [
        ns.enums.ProgramName.bruteSsh,
        ns.enums.ProgramName.ftpCrack,
        ns.enums.ProgramName.relaySmtp,
        ns.enums.ProgramName.httpWorm,
        ns.enums.ProgramName.sqlInject,
    ];
}

async function buyCloudServers(ns: NS): Promise<void>
{
    for (let i = 0; i < CloudServer.Count; i++) {
        const hostname = `${CloudServer.Prefix}-${i}`;
        if (ns.serverExists(hostname)) {
            continue;
        }

        if (ns.cloud.getServerCost(CloudServer.Ram) < ns.getServerMoneyAvailable("home")) {
            ns.cloud.purchaseServer(hostname, CloudServer.Ram);
        }
    }
}

async function installFactionBackdoors(ns: NS): Promise<void>
{
    for (const server of FACTION_SERVERS) {
        if (!ns.serverExists(server)) {
            continue;
        }

        if (ns.getServer(server).backdoorInstalled) {
            continue;
        }

        const path = findPath(ns, "home", server);

        if (path.length === 0) {
            continue;
        }

        await connectPath(ns, path);
        await ns.singularity.installBackdoor();
        ns.singularity.connect("home");
    }
}

function findPath(ns: NS, start: string, target: string): string[]
{
    return findPathRecursive(ns, start, target, new Set<string>());
}

function findPathRecursive(ns: NS, current: string, target: string, visited: Set<string>): string[]
{
    if (current === target) {
        return [current];
    }

    visited.add(current);

    for (const next of ns.scan(current)) {
        if (visited.has(next)) {
            continue;
        }

        const path = findPathRecursive(ns, next, target, visited);

        if (path.length > 0) {
            return [current, ...path];
        }
    }

    return [];
}

async function connectPath(ns: NS, path: string[]): Promise<void>
{
    ns.singularity.connect("home");

    for (const server of path.slice(1)) {
        ns.singularity.connect(server);
        await ns.sleep(10);
    }
}

function startController(ns: NS): void
{
    if (ns.scriptRunning(CONTROLLER_SCRIPT, "home")) {
        return;
    }

    ns.exec(CONTROLLER_SCRIPT, "home", 1);
}