import { NS } from "@ns";
import { LogEvent } from "src/models/log-event";

const LOG_PORT = 24;

export async function main(ns: NS): Promise<void>
{
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.setTailTitle("Darknet Crawler");

    while (true) {
        const raw = ns.readPort(LOG_PORT);

        if (raw === "NULL PORT DATA") {
            await ns.sleep(200);
            continue;
        }

        const event = JSON.parse(String(raw)) as LogEvent;

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