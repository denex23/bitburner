import { NS } from '@ns';
import { Context } from "/src/models/context";

import { Scanner } from "src/network/scanner";

export async function main(ns: NS) {
    const context = new Context(ns)
    const scanner = new Scanner(context);
    const servers = scanner.scan();

    ns.tprint(`Gefundene Server: ${servers.length}`);

    for (const server of servers) {
        ns.tprint(`${server.hostname} | ` + `Root: ${server.rooted}`);
    }
}