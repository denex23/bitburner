import { NS } from "@ns";

import {
    DNET_FILE_ARCHIVE_PORT,
    FILE_SUFFIX,
    LIT_BLACKLIST,
    STORM_SEED_FILENAME,
    TXT_BLACKLIST,
} from "src/dnet/constants";

import { DNetFileArchiveMessage } from "src/dnet/types";

export async function scanDNetFilesystem(ns: NS): Promise<string[]>
{
    const cacheFiles: string[] = [];

    for (const file of ns.ls(ns.getHostname())) {
        if (isCacheFile(file)) {
            cacheFiles.push(file);
            continue;
        }

        if (isStormSeed(file)) {
            ns.toast("STORM_SEED detected but intentionally ignored", ns.enums.ToastVariant.INFO);
            continue;
        }

        if (isLiteratureFile(file)) {
            await handleLiteratureFile(ns, file);
            continue;
        }

        if (isTextFile(file)) {
            await handleTextFile(ns, file);
        }
    }

    return cacheFiles;
}

export function countCacheFiles(ns: NS): number
{
    return ns.ls(ns.getHostname())
        .filter(isCacheFile)
        .length;
}

function isCacheFile(filename: string): boolean
{
    return filename.endsWith(FILE_SUFFIX.Cache);
}

function isStormSeed(filename: string): boolean
{
    return filename === STORM_SEED_FILENAME;
}

function isLiteratureFile(filename: string): boolean
{
    return filename.endsWith(FILE_SUFFIX.Lit);
}

function isTextFile(filename: string): boolean
{
    return filename.endsWith(FILE_SUFFIX.Data);
}

async function handleLiteratureFile(ns: NS, file: string): Promise<boolean>
{
    if (LIT_BLACKLIST.has(file) || ns.fileExists(file, "home")) {
        return false;
    }

    const copied = await ns.scp(file, "home", ns.getHostname());

    return copied;
}

async function handleTextFile(ns: NS, file: string): Promise<void>
{
    if (TXT_BLACKLIST.has(file)) {
        return;
    }

    const payload: DNetFileArchiveMessage = {
        filename: file,
        content: ns.read(file),
        sourceHost: ns.getHostname(),
        createdAt: Date.now(),
    };

    await writePortReliable(ns, DNET_FILE_ARCHIVE_PORT, JSON.stringify(payload));
}

async function writePortReliable(ns: NS, port: number, payload: string): Promise<void>
{
    while (!ns.tryWritePort(port, payload)) {
        await ns.sleep(500);
    }
}