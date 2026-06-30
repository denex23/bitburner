import { AutocompleteData, DarknetServerDetails, NS } from '@ns'

export async function main(ns: NS)
{
    const host = ns.getHostname();
    ns.atExit(() => {
        // In case this works, the server could delete themselve from passwort list
        ns.tprint(`Server ${host} is going Offline`);
    });

    while (true) {
        // Get a list of all darknet hostnames directly connected to the current server
        const nearbyServers = ns.dnet.probe();

        // Attempt to authenticate with each of the nearby servers, and spread this script to them
        for (const hostname of nearbyServers) {
            const authenticationSuccessful = await serverSolver(ns, hostname);
            if (!authenticationSuccessful) {
                continue; // If we failed to auth, just move on to the next server
            }

            // If we have successfully authenticated, we can now copy and run this script on the target server
            ns.scp(ns.getScriptName(), hostname);
            ns.exec(ns.getScriptName(), hostname, {
                preventDuplicates: true, // This prevents running multiple copies of this script
            });
        }

        // TODO: free up blocked ram on this server using ns.dnet.memoryReallocation
        const blockedRam = ns.dnet.getBlockedRam(host);
        while (blockedRam > 0) {
            const reallocationResult = await ns.dnet.memoryReallocation(host);
            if (reallocationResult.success) {
                ns.tprint(`${reallocationResult.code} | ${reallocationResult.message}`);
            }
        }

        // TODO: look for .cache files on this server and open them with ns.dnet.openCache
        for (const cache of ns.ls(host).filter(file => isCacheFile(file))) {
            handleCacheFile(ns, cache)
        }
        

        // TODO: take advantage of the extra ram on darknet servers to run ns.dnet.phishingAttack calls for money
        const darknetResult = await ns.dnet.phishingAttack();
        if (darknetResult.success) {
            if (isCacheFile(darknetResult.message)) {
                handleCacheFile(ns, darknetResult.message);
            } else {
                ns.tprint(`${darknetResult.code} | ${darknetResult.message}`)
            }
        }
        

        await ns.sleep(5000);
    }
}

export const isCacheFile = (filename: string) => { return filename.endsWith(".cache"); };

export const handleCacheFile = (ns: NS, file: string) => 
{  
    const cacheResult = ns.dnet.openCache(file);
    if (cacheResult.success) {
        ns.tprint(`${cacheResult.karmaLoss} | ${cacheResult.message}`);
    }
};

/** Attempts to authenticate with the specified server using the Darknet API.
 * @param {NS} ns
 * @param {string} hostname - the name of the server to attempt to authorize on
 */
export const serverSolver = async (ns: NS, hostname: string) =>
{
    // Get key info about the server, so we know what kind it is and how to authenticate with it
    const details = ns.dnet.getServerDetails(hostname);
    if (!details.isConnectedToCurrentServer || !details.isOnline) {
        // If the server isn't connected or is offline, we can't authenticate
        return false;
    }
    // If you are already authenticated to that server with this script, you don't need to do it again
    if (details.hasSession) {
        return true;
    }

    let password: string |undefined = "";

    switch (details.modelId) {
        case "ZeroLogon":
            return authenticate(ns, hostname, password);

        case "DeskMemo_3.1":
            password = crackDeskMemoPassword(ns, details);

            return (password !== undefined) ? authenticate(ns, hostname, password) : false

        case "CloudBlare(tm)":
            password = crackCloudBlarePassword(ns, details);
            return (password !== undefined) ? authenticate(ns, hostname, password) : false

        case "FreshInstall_1.0":
            // Default Password ??? numeric

        case "Laika4":
            // Hint is a real oldschool hint. alphabetic

        case "DeepGreen":
        // Mastermind game - numeric - hints in heartbleed -> date n,m - where n = How many symbols match exactly and m = How many symbols match but are in wrong place, heartbleed mentioed digits 
            // await ns.dnet.heartbleed(hostname)

        case "Factori-Os":
            // numeric | see hint it says which numbers are divisors and heartbleed mentioed digits

        case "Pr0verFl0":
            // alphanumeric | see hint, see heartbleed



        // TODO: handle other models of darknet servers here

        // TODO: get recent server logs with `await ns.dnet.heartbleed(hostname)` for more detailed logging on failed auth attempts

        default:
            ns.tprint(`Unrecognized modelId: ${details.modelId}`);
            return false;
    }
};

const crackDeskMemoPassword = (ns: NS, details: DarknetServerDetails) =>
{
    const regEx = new RegExp(`\\d\{${details.passwordLength}\}`, "g");
    const resultArr = details.passwordHint.match(regEx);
    if (resultArr === null) {
        // Error
        return undefined;
    } else if (resultArr.length > 1) {
        // Shouldn't be -> something wrong
        // possible iterate the and try every value
        return undefined;
    }

    return resultArr.shift();
};

const crackCloudBlarePassword = (ns: NS, details: DarknetServerDetails) =>
{
    const regEx = new RegExp("\\d", "g");
    const resultArr = details.passwordHint.match(regEx);
    if (resultArr === null) {
        // Error
        return undefined;
    } else if (resultArr.length !== details.passwordLength) {
        // Shouldn't be -> something wrong
        return undefined;
    }

    return resultArr.join("");
};

const crackDeepGreenPassword = (ns: NS, details: DarknetServerDetails) =>
{
    
    for (let i = 0; i < 10; i++) {
        let password: string = `${i}`.repeat(details.passwordLength - 1);
    }
    
    const regEx = new RegExp("\\d", "g");
    const resultArr = details.passwordHint.match(regEx);
    if (resultArr === null) {
        // Error
        return undefined;
    } else if (resultArr.length !== details.passwordLength) {
        // Shouldn't be -> something wrong
        return undefined;
    }

    return resultArr.join("");
    };

/** Authenticates on 'ZeroLogon' type servers, which always have an empty password.
 *  @param {NS} ns
 *  @param {string} hostname - the name of the server to attempt to authorize on
 */
const authenticate = async (ns: NS, hostname: string, password: string) =>
{
    const result = await ns.dnet.authenticate(hostname, "");
    // TODO: store discovered passwords somewhere safe, in case we need them later
    savePassword(ns, hostname, password)

    return result.success;
};

const savePassword = async (ns: NS, hostname: string, password: string) =>
{
    // ns.write("filename", "a");
};

/** This lets you tab-complete putting "--tail" on the run command so you can see the script logs as it runs, if you want
 *  If you add support to the script to take other arguments, you can add them here as well for convenience
 *  @param {AutocompleteData} data */
export function autocomplete(data: AutocompleteData)
{
    return ["--tail"];
}