import { NS } from '@ns'

export async function main(ns: NS)
{
    ns.scp("src/dev.ts", "darkweb");
    ns.exec("src/dev.ts", "darkweb");
}