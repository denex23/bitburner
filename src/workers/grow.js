export async function main(ns) 
{
    const target = String(ns.args[0]);

    while (true) {
        await ns.grow(target);
    }
}