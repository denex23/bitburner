import { NS } from '@ns';

export async function main(ns: NS): Promise<void>
{
    const target = String(ns.args.shift());
    const path = findPath(ns, "home", target);

    if (path.length === 0) {
        ns.tprint(`No path found to ${target}`);
        return;
    }

    ns.tprint(path.join(" -> "));
}

function findPath(ns: NS, start: string, target: string): string[]
{
    const visited = new Set<string>();

    return findPathRecursive(ns, start, target, visited);
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