import { NS } from "@ns";

const LOG_PORT = 24;
const NULL_PORT_DATA = "NULL PORT DATA";

export interface LogEvent
{
    host: string;
    type?: string;
    message: string;
    context?: unknown;
    time: number;
}

export async function main(ns: NS): Promise<void>
{
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.setTailTitle("Darknet Crawler");

    while (true) {
        const processedMessages = handlePendingMessages(ns);

        if (0 === processedMessages) {
            await ns.nextPortWrite(LOG_PORT);
        }
    }
}

function handlePendingMessages(ns: NS): number
{
    let processedMessages = 0;

    while (true) {
        const message = ns.readPort(LOG_PORT);

        if (NULL_PORT_DATA === message) {
            return processedMessages;
        }

        processedMessages++;
        const event = JSON.parse(String(message)) as LogEvent;

        ns.print(formatLogEvent(event));
    }
}

function formatLogEvent(event: LogEvent): string
{
    const time = new Date(event.time).toLocaleTimeString("de-DE");

    if (event.context === undefined) {
        return `${event.type?.toUpperCase()} [${time}] ${event.host}: ${event.message}`;
    }

    return `${event.type?.toUpperCase()} [${time}] ${event.host}: ${event.message} ${JSON.stringify(event.context)}`;
}