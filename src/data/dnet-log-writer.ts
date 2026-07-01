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

        ns.print(`${event.type?.toUpperCase()} [${new Date(event.time).toLocaleTimeString("de-DE")}] ${event.host}: ${event.message} Context: ${event.context}`);
    }
}