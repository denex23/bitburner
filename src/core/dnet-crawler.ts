import { AutocompleteData, DarknetServerDetails, NS } from '@ns'

const LOG_PORT = 24;
const PASSWORD_PORT = 23;
const PASSWORD_FILE = "src/data/dnet_passwords.json";

export async function main(ns: NS)
{
    while (true) {
        const nearbyServers = ns.dnet.probe();

        for (const hostname of nearbyServers) {
            const authenticationSuccessful = await serverSolver(ns, hostname);
            if (!authenticationSuccessful) {
                continue; // If we failed to auth, just move on to the next server
            }

            await reallocateRam(ns, hostname);
            await infestTarget(ns, hostname);
        }

        openLocalCacheFiles(ns);
        await runPhishingAttack(ns)
        
        await ns.sleep(5000);
    }
}

async function serverSolver(ns: NS, hostname: string): Promise<boolean>
{
    const details = ns.dnet.getServerDetails(hostname);

    if (!details.isConnectedToCurrentServer || !details.isOnline) {
        return false;
    }

    if (details.hasSession) {
        return true;
    }

    const passwords = await loadKnownPasswords(ns);
    if (Object.hasOwn(passwords, hostname)) {
        const result = ns.dnet.connectToSession(hostname, passwords[hostname]);

        // DEBUG
        await reportLog(ns, "Result: connectToSession()", result);

        return result.success;
    }

    return authenticateByModel(ns, hostname, details);
};

async function reallocateRam(ns: NS, hostname: string): Promise<void>
{
    // TODO: Check if attempts are sufficient
    for (let attempts = 0; attempts < 10 && ns.dnet.getBlockedRam(hostname) > 0; attempts++) {
        const result = await ns.dnet.memoryReallocation(hostname);

        // DEBUG
        await reportLog(ns, "Result: memoryReallocation()", result);
        if (!result.success) { // geändert
            return; // geändert
        }
    }
}

async function infestTarget(ns: NS, hostname: string): Promise<void>
{
    await ns.scp(ns.getScriptName(), hostname);

    ns.exec(ns.getScriptName(), hostname, {
        preventDuplicates: true,
    });
}

async function runPhishingAttack(ns: NS): Promise<void>
{
    const result = await ns.dnet.phishingAttack();

    if (!result.success) {
        // DEBUG - possible later ERROR log 
        await reportLog(ns, "Result: phishingAttack()", result)

        return;
    }

    if (isCacheFile(result.message)) {
        handleCacheFile(ns, result.message);
    }

    // DEBUG
    await reportLog(ns, "Result: phishingAttack()", result)
}

function openLocalCacheFiles(ns: NS): void
{
    for (const file of ns.ls(ns.getHostname()).filter(file => isCacheFile(file))) {
        handleCacheFile(ns, file)
    }
}

function isCacheFile(filename: string): boolean
{
    return filename.endsWith(".cache");
}

async function handleCacheFile(ns: NS, file: string): Promise<void>
{
    const result = ns.dnet.openCache(file);

    // DEBUG
    await reportLog(ns, "Result: openCache()", result);
}

async function loadKnownPasswords(ns: NS): Promise<Record<string, string>>
{
    const host = ns.getHostname();

    await ns.scp(PASSWORD_FILE, host, "home");


    if (!ns.fileExists(PASSWORD_FILE, host)) {
        return {};
    }

    return JSON.parse(ns.read(PASSWORD_FILE)) as Record<string, string>;
}

async function reportPassword(ns: NS, hostname: string, password: string): Promise<void>
{
    await writePortReliable(ns, PASSWORD_PORT, JSON.stringify({ hostname, password }));
}

async function reportLog(ns: NS, message: string, context?: unknown, type?: string): Promise<void>
{
    await writePortReliable(ns, LOG_PORT, buildLogMessage(ns, message, context, type));
}

function tryReportLog(ns: NS, message: string, context?: unknown, type?: string): void
{
    ns.tryWritePort(LOG_PORT, buildLogMessage(ns, message, context, type));
}

function buildLogMessage(ns: NS, message: string, context?: unknown, type: string = ""): string
{
    return JSON.stringify({
        host: ns.getHostname(),
        type,
        message,
        context,
        time: Date.now(),
    });
}

async function writePortReliable(ns: NS, port: number, payload: string): Promise<void>
{
    while (!ns.tryWritePort(port, payload)) {
        await ns.sleep(100);
    }
}

async function authenticateByModel(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    switch (details.modelId) {
        case "ZeroLogon":
            return authenticate(ns, hostname, "")

        case "DeskMemo_3.1":
            return authenticateDeskMemoServer(ns, hostname, details);

        case "CloudBlare(tm)":
            return authenticateCloudBlareServer(ns, hostname, details);

        case "PHP 5.4":
            return authenticatePHPServer(ns, hostname, details);

        case "OctantVoxel":
            return authenticateOctantVoxelServer(ns, hostname, details);

        case "Pr0verFl0":
            return authenticateProverServer(ns, hostname, details);

        case "Factori-Os":
            //return authenticateFactoriOsPassword(ns, hostname, details);
        // Hint: The password is divisible by 1 ;) numeric | see hint it says which numbers are divisors and heartbleed mentioed digits
        // Response.message: Password is not divisible by '15'

        case "AccountsManager_4.2":
        // binary search tree
        // Hint: The password is a number between 0 and 100
        // response.data: Higher|Lower

        case "BellaCuore":
        // Hint: The password is the value of the number 'CDXCI' -> 491
        // Data: CDXCI
        // Resolve roman numerals
        // subtraction rule: I could be in front of V (IV = 4) and X (IX = 9), X could be on front of L (XL = 40) or C (XC = 90) and C could be in front of D (CD = 400) or M (CM = 900) 
        // I = 1, V = 5, X = 10, L = 50, C = 100, D = 500, M = 1000,

        case "NIL":
        // Hint: you are one who's'nt authorized
        // Response.message: that wasn't right
        // data: yes,yesn't,yesn't,yesn't,yesn't
        // data: yes,yes,yes,yesn't,yesn't
        // -> something like Mastermind but it's enough to iterate with 11111 -> 99999 to get all positions

        case "DeepGreen":
            return authenticateDeepGreenServer(ns, hostname, details);
        
        case "OpenWebAccessPoint":
            // heartbleed mentioned clues
            // heartblled shows full password "Logging in with passcode: 1914501 ..." - random?

        case "FreshInstall_1.0":
            // Default Password ??? numeric

        case "Laika4":
            // Casual password hint. alphabetic
            // Hint: It's my dog's name

        

        // TODO: handle other models of darknet servers here

        // TODO: get recent server logs with `await ns.dnet.heartbleed(hostname)` for more detailed logging on failed auth attempts

        default:
            await reportLog(ns, "Unknown Server Model", details, "WARN");
            return false;
    }
}

async function authenticate(ns: NS, hostname: string, password: string): Promise<boolean>
{
    const result = await ns.dnet.authenticate(hostname, password);

    if (result.success) {
        await reportPassword(ns, hostname, password);
    }

    return result.success;
}

async function authenticateDeskMemoServer(ns: NS, hostname:string, details: DarknetServerDetails): Promise<boolean>
{
    const resultArr = details.passwordHint.match(new RegExp(`\\d\{${details.passwordLength}\}`, "g"));

    if (resultArr === null) {
        reportLog(ns, "No password result in method authenticateDeskMemoServer()", details, "ERROR");

        return false; // Error
    } else if (resultArr.length > 1) {
        reportLog(ns, "Suspicious password result in method authenticateDeskMemoServer()", { 
            expectedLength: 1, 
            actualLength: resultArr.length, 
            data: resultArr, 
            details: details 
        }, "INFO");
        
        return false;
    }
    
    return authenticate(ns, hostname, resultArr.shift()!);
};

async function authenticateCloudBlareServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    const resultArr = details.passwordHint.match(new RegExp("\\d", "g"));

    if (resultArr === null) {
        reportLog(ns, "No password result in method authenticateCloudBlarePassword()", details, "ERROR");

        return false;
    } else if (resultArr.length !== details.passwordLength) {
        reportLog(ns, "Suspicious password result in method authenticateCloudBlarePassword()", { 
            expectedLength: 1, 
            actualLength: resultArr.length, 
            data: resultArr, 
            details: details 
        }, "INFO");
        
        return false;
    }

    return authenticate(ns, hostname, resultArr.join("")!);
};

async function authenticatePHPServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    for (const value of uniquePermutation(details.data)) {
        if ((await authenticate(ns, hostname, value)).valueOf()) {
            return true;
        }
    }

    return false;
}

async function authenticateOctantVoxelServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    const [baseValue, value] = details.data.split(",");
    const base = Number(baseValue);

    if (!Number.isInteger(base) || base < 2 || base > 36) {
        return false;
    }

    return authenticate(ns, hostname, parseInt(value, base).toString());
}

async function authenticateProverServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    const buffer = Number(details.data);

    return authenticate(ns, hostname, "a".repeat(buffer * 2));
}

async function authenticateFactoriOsServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    return false;

    let candidates = createCandidates(details.passwordLength);

    while (candidates.length > 0) {
        const divisor = candidates.length === 1
            ? candidates[0]
            : findBestDivisor(candidates);

        const result = await ns.dnet.authenticate(hostname, String(divisor));

        if (result.success) {
            await reportPassword(ns, hostname, String(divisor));
            return true;
        }

        if (result.success === false) {
            const recentLogResult = await ns.dnet.heartbleed(hostname, { peek: true });
            ns.print(recentLogResult.logs);
          }

        const isDivisible = result.message.includes("is|is not divisible"); // forgot to note the message -.-
        candidates = filterCandidates(candidates, divisor, isDivisible);
    }

    return false;
}

async function authenticateDeepGreenServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    return false;
    // Mastermind game - numeric - hints in heartbleed -> date n,m - where n = How many symbols match exactly and m = How many symbols match but are in wrong place, heartbleed mentioed digits
    // await ns.dnet.heartbleed(hostname)
    for (let i = 0; i < 10; i++) {
        let password: string = `${i}`.repeat(details.passwordLength);
        const result = await ns.dnet.authenticate(hostname, password);
    }

    return false;
}

function createCandidates(length: number): number[]
{
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    const candidates: number[] = [];

    for (let value = min; value <= max; value++) {
        candidates.push(value);
    }

    return candidates;
}

function filterCandidates(candidates: number[], divisor: number, isDivisible: boolean): number[]
{
    return candidates.filter(candidate =>
        isDivisible
            ? candidate % divisor === 0
            : candidate % divisor !== 0
    );
}

function findBestDivisor(candidates: number[]): number
{
    let bestDivisor = 2;
    let bestScore = Number.MAX_SAFE_INTEGER;

    const max = Math.max(...candidates);

    for (let divisor = 2; divisor <= max; divisor++) {
        const divisibleCount = candidates.filter(candidate => candidate % divisor === 0).length;

        if (divisibleCount === 0 || divisibleCount === candidates.length) {
            continue;
        }

        const score = Math.abs(candidates.length / 2 - divisibleCount);

        if (score < bestScore) {
            bestScore = score;
            bestDivisor = divisor;
        }
    }

    return bestDivisor;
}

function getPermutations(value: string): string[]
{
    if (value.length <= 1) {
        return [value];
    }

    const permutations: string[] = [];

    for (let i = 0; i < value.length; i++) {
        const currentChar = value[i];
        const remaining = value.slice(0, i) + value.slice(i + 1);

        for (const permutation of getPermutations(remaining)) {
            permutations.push(currentChar + permutation);
        }
    }

    return permutations;
}

function uniquePermutation(value: string): string[]
{
    return [...new Set(getPermutations(value))];
}

/** This lets you tab-complete putting "--tail" on the run command so you can see the script logs as it runs, if you want
 *  If you add support to the script to take other arguments, you can add them here as well for convenience
 *  @param {AutocompleteData} data */
export function autocomplete(data: AutocompleteData)
{
    return ["--tail"];
}