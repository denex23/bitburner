import { NS } from '@ns';

export async function main(ns: NS)
{
    let last = ns.getMoneySources().sinceStart.hacking; // Feldname per Autocomplete gegenchecken
    while (true) {
        await ns.sleep(5000);
        const now = ns.getMoneySources().sinceStart.hacking;
        ns.tprint(`hack total ${ns.format.number(now)}  (+${ns.format.number((now - last) / 5)}/s)`);
        last = now;
    }
}