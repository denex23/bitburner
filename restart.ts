import { NS } from '@ns';

export async function main(ns: NS) {
    ns.kill("src/core/controller.ts");
    ns.run("src/core/controller.ts");
}