import { NS } from "@ns";

export async function main(ns: NS): Promise<void>
{
    const visited = new Set<string>();

    printServerTree(ns, "home", "", true, visited);
}

function printServerTree(ns: NS, hostname: string, prefix: string, isLast: boolean, visited: Set<string>): void
{
    const connector = isLast ? "└─ " : "├─ ";
    ns.tprint(`${prefix}${connector}${hostname}`);

    visited.add(hostname);

    const children = ns.scan(hostname)
        .filter(server => !visited.has(server))
        .sort();

    const childPrefix = prefix + (isLast ? "   " : "│  ");

    for (let index = 0; index < children.length; index++) {
        printServerTree(
            ns,
            children[index],
            childPrefix,
            index === children.length - 1,
            visited,
        );
    }
}