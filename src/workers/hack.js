export async function main(ns)
{
    const target = String(ns.args[0]);
    const additionalMsec = Number(ns.args[1]);

    await ns.hack(target, { additionalMsec });
}
