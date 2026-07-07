import { DarknetServerDetails, NS } from "@ns";
import { scanDNetFilesystem } from "src/dnet/file-handler";
import { DNetStockCommand } from "src/dnet/types";

import {
    DNET_AUTH_THREADS,
    DNET_AUTH_WORKER_SCRIPT,
    DNET_CACHE_WORKER_SCRIPT,
    DNET_CRAWLER_SCRIPT,
    DNET_FILES,
    DNET_LOOP_DELAY,
    DNET_MEMORY_THREADS,
    DNET_MEMORY_WORKER_SCRIPT,
    DNET_MIGRATION_THREADS,
    DNET_MIGRATION_WORKER_SCRIPT,
    DNET_PHISHING_RAM_RESERVE,
    DNET_PHISHING_WORKER_SCRIPT,
    DNET_SHUTDOWN_COMMAND,
    DNET_CONTROL_PORT,
    DNET_STOCK_PORT,
    DNET_STOCK_THREADS,
    DNET_STOCK_WORKER_SCRIPT,
    DNET_NODE_STATE_PORT,
} from "src/dnet/constants";

export async function main(ns: NS): Promise<void>
{
    ns.disableLog("ALL");

    while (!shouldShutdown(ns)) {
        await runCycle(ns);
        await ns.sleep(DNET_LOOP_DELAY);
    }
}

async function runCycle(ns: NS): Promise<void>
{
    const currentHost = ns.getHostname();

    const cacheFiles = await scanDNetFilesystem(ns);
    for (const file of cacheFiles) {
        startCacheWorker(ns, currentHost, file);
    }

    await startLocalPhishingWorker(ns, currentHost);
    await startStockWorkerIfRequested(ns, currentHost);

    const neighbors = ns.dnet.probe();

    for (const hostname of neighbors) {
        const details = ns.dnet.getServerDetails(hostname);

        if (!details.isOnline || !details.isConnectedToCurrentServer) {
            continue;
        }

        if (!details.hasSession) {
            await startAuthWorker(ns, currentHost, hostname);
            continue;
        }

        await startMemoryWorker(ns, currentHost, hostname);
        await infestTarget(ns, hostname);
    }

    reportCurrentNodeState(ns, currentHost, cacheFiles, neighbors);
}

async function startAuthWorker(ns: NS, currentHost: string, target: string): Promise<void>
{
    if (ns.isRunning(DNET_AUTH_WORKER_SCRIPT, currentHost, target)) {
        return;
    }

    await ensureFiles(ns, currentHost);

    const threads = Math.min(DNET_AUTH_THREADS, calculateThreads(ns, currentHost, DNET_AUTH_WORKER_SCRIPT));

    if (threads <= 0) {
        return;
    }

    ns.exec(DNET_AUTH_WORKER_SCRIPT, currentHost, threads, target);
}

function startCacheWorker(ns: NS, currentHost: string, file: string): void
{
    if (ns.isRunning(DNET_CACHE_WORKER_SCRIPT, currentHost, file)) {
        return;
    }

    const threads = calculateThreads(ns, currentHost, DNET_CACHE_WORKER_SCRIPT);

    if (threads <= 0) {
        return;
    }

    ns.exec(DNET_CACHE_WORKER_SCRIPT, currentHost, 1, file);
}

async function startMemoryWorker(ns: NS, currentHost: string, target: string): Promise<void>
{
    if (ns.dnet.getBlockedRam(target) <= 0) {
        return;
    }

    if (ns.isRunning(DNET_MEMORY_WORKER_SCRIPT, currentHost, target)) {
        return;
    }

    const threads = Math.min(
        DNET_MEMORY_THREADS,
        calculateThreads(ns, currentHost, DNET_MEMORY_WORKER_SCRIPT)
    );

    if (threads <= 0) {
        return;
    }

    ns.exec(DNET_MEMORY_WORKER_SCRIPT, currentHost, threads, target);
}

async function startMigrationWorker(ns: NS, currentHost: string, target: string): Promise<void>
{
    if (ns.isRunning(DNET_MIGRATION_WORKER_SCRIPT, currentHost, target)) {
        return;
    }

    const threads = Math.min(
        DNET_MIGRATION_THREADS,
        calculateThreads(ns, currentHost, DNET_MIGRATION_WORKER_SCRIPT)
    );

    if (threads <= 0) {
        return;
    }

    ns.exec(DNET_MIGRATION_WORKER_SCRIPT, currentHost, threads, target);
}

async function startLocalPhishingWorker(ns: NS, currentHost: string): Promise<void>
{
    if (!ns.dnet.isDarknetServer(currentHost)) {
        return;
    }

    if (ns.scriptRunning(DNET_PHISHING_WORKER_SCRIPT, currentHost)) {
        return;
    }

    const scriptRam = ns.getScriptRam(DNET_PHISHING_WORKER_SCRIPT, currentHost);

    if (scriptRam <= 0) {
        return;
    }

    const availableRam = ns.getServerMaxRam(currentHost)
        - ns.getServerUsedRam(currentHost)
        - DNET_PHISHING_RAM_RESERVE;

    const threads = Math.floor(availableRam / scriptRam);

    if (threads <= 0) {
        return;
    }

    ns.exec(DNET_PHISHING_WORKER_SCRIPT, currentHost, threads);
}

async function startStockWorkerIfRequested(ns: NS, currentHost: string): Promise<void>
{
    const command = readStockCommand(ns);

    if (null === command) {
        return;
    }

    if (ns.isRunning(DNET_STOCK_WORKER_SCRIPT, currentHost, command.symbol)) {
        return;
    }

    const threads = Math.min(
        DNET_STOCK_THREADS,
        calculateThreads(ns, currentHost, DNET_STOCK_WORKER_SCRIPT)
    );

    if (threads <= 0) {
        return;
    }

    ns.exec(
        DNET_STOCK_WORKER_SCRIPT,
        currentHost,
        threads,
        command.symbol
    );
}

function readStockCommand(ns: NS): DNetStockCommand | null
{
    const value = ns.peek(DNET_STOCK_PORT);

    if ("NULL PORT DATA" === value) {
        return null;
    }

    const raw = ns.readPort(DNET_STOCK_PORT);

    if ("string" !== typeof raw) {
        return null;
    }

    try {
        const command = JSON.parse(raw) as DNetStockCommand;

        if (!command.symbol) {
            return null;
        }

        return command;
    } catch {
        return null;
    }
}

async function infestTarget(ns: NS, target: string): Promise<void>
{
    await ensureFiles(ns, target);

    if (ns.isRunning(DNET_CRAWLER_SCRIPT, target)) {
        return;
    }

    const pid = ns.exec(DNET_CRAWLER_SCRIPT, target, 1, target);

    if (pid === 0) {
        // Error log(ns, "ERROR", "Crawler could't be deployed", { target});
    }
}

async function ensureFiles(ns: NS, target: string): Promise<void>
{
    for (const file of DNET_FILES) {
        await ns.scp(file, target, "home");
    }
}

function reportCurrentNodeState(ns: NS, currentHost: string, cacheFiles: string[], neighbors: string[]): void
{
    const details: DarknetServerDetails & { isOnline: boolean } = ns.dnet.getServerDetails(currentHost);

    ns.tryWritePort(
        DNET_NODE_STATE_PORT,
        JSON.stringify({
            hostname: currentHost,
            neighborCount: neighbors.length,
            cacheFiles: cacheFiles.length,
            hasSession: details.hasSession,
            isOnline: details.isOnline,
            timestamp: Date.now(),
        })
    );
}

function calculateThreads(ns: NS, host: string, script: string): number
{
    const scriptRam = ns.getScriptRam(script, host);

    if (scriptRam <= 0) {
        return 0;
    }

    return Math.floor((ns.getServerMaxRam(host) - ns.getServerUsedRam(host)) / scriptRam);
}

function shouldShutdown(ns: NS): boolean
{
    return ns.peek(DNET_CONTROL_PORT) === DNET_SHUTDOWN_COMMAND;
}