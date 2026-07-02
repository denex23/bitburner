import { NS } from "@ns";

const ARCHIVE_DIR = "src/data/dnet/archive/";
const DNET_FILE_ARCHIVE_PORT = 26
const NULL_PORT_DATA = "NULL PORT DATA";

interface DnetFileArchiveMessage 
{
    filename: string;
    content: string;
    createdAt: number;
};

export async function main(ns: NS): Promise<void>
{
    while (true) {
        const processedMessages = handlePendingMessages(ns);

        if (0 === processedMessages) {
            await ns.nextPortWrite(DNET_FILE_ARCHIVE_PORT);
        }
    }
}

function handlePendingMessages(ns: NS): number
{
    let processedMessages = 0;

    while (true) {
        const message = ns.readPort(DNET_FILE_ARCHIVE_PORT);

        if (NULL_PORT_DATA === message) {
            return processedMessages;
        }

        processedMessages++;
        const fielMessage = JSON.parse(String(message)) as DnetFileArchiveMessage;

        mergeDataFile(ns, fielMessage);
    }
}

function mergeDataFile(ns: NS, fileMessage: DnetFileArchiveMessage): void
{
    const localFile = `${ARCHIVE_DIR}${fileMessage.filename}`;
    const sourceContent = ns.read(fileMessage.content).trim();

    if ("" === sourceContent) {
        return;
    }

    const archiveContent = ns.fileExists(localFile, "home")
        ? ns.read(localFile)
        : "";

    if (archiveContent.includes(sourceContent)) {
        return;
    }

    ns.write(localFile, buildArchiveEntry(fileMessage.createdAt, sourceContent), "a",);
}

function buildArchiveEntry(date: number, content: string): string
{
    return [
        "",
        new Date(date).toISOString(),
        content,
        "",
    ].join("\n");
}