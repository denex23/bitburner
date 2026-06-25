import { NS } from '@ns';
import { Context } from "/src/models/context";

import { Scanner } from "src/network/scanner";
import { Rooter } from "src/network/rooter";

export async function main(ns: NS) {
    const context = new Context(ns)
    const scanner = new Scanner(context);
    const rooter = new Rooter(context);
    const servers = scanner.scan();
    const results = rooter.root(servers);

    for (const result of results) {
        ns.tprint(
            `${result.hostname} | ` +
            `success=${result.success} | ` +
            `already=${result.alreadyRooted}`
        );
    }
}