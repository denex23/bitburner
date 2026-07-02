import { AutocompleteData, DarknetServerDetails, NS } from '@ns'

const LOG_PORT = 24;
const PASSWORD_PORT = 23;
const DNET_CONTROL_PORT = 25;
const FILE_ARCHIVE_PORT = 26

const PASSWORD_FILE = "src/data/dnet/dnet_passwords.json";

const SHUTDOWN_COMMAND = "shutdown";
 
const STORM_SEED_FILENAME = "STORM_SEED.exe"

const FILE_SUFFIX = {
    Cache: ".cache",
    Lit: ".lit",
    Data: ".data.txt",
} as const;

const LAIKA_PASSWORDS = [
    "fido",
    "spot",
    "rover",
    "max",
] as const;

const FRESH_INSTALL_PASSWORDS: Record<string, string> = {
    "numeric:4": "0000",
    "numeric:5": "12345",
    "alphabetic:5": "admin",
    "alphabetic:8": "password",
} as const;

const LIT_BLACKLIST = new Set<string>([
    "cache-note-1.lit",
    "cache-note-2.lit",
    "darkweb-rebooted-again.lit",
    "dog-name-ideas.lit",
    "factory-default.lit",
    "hackers-starting-handbook.lit",
    "raw-data.lit",
    "secrets-in-the-depths.lit",
    "server-offline-problem.lit",
    "stasis-link.lit",
    "timing-attack.lit",
    "partial-password-jutsu.lit",
]);

const TXT_BLACKLIST = new Set<string>([
    "THE_TRUTH.data.txt",
    "access.data.txt",
    "admin.data.txt",
    "credentials.data.txt",
    "dreams.data.txt",
    "journal.data.txt",
    "key.data.txt",
    "login.data.txt",
    "notes.data.txt",
    "password.data.txt",
    "root.data.txt",
    "search_history.data.txt",
    "secrets.data.txt",
    "thoughts.data.txt",
]);

export async function main(ns: NS)
{
    while (!shouldShutdown(ns)) {
        const nearbyServers = ns.dnet.probe();

        for (const hostname of nearbyServers) {
            const authenticationSuccessful = await serverSolver(ns, hostname);
            if (!authenticationSuccessful) {
                continue; // If we failed to auth, just move on to the next server
            }

            await reallocateRam(ns, hostname);
            await infestTarget(ns, hostname);
        }

        await scanFilesystem(ns);
        await startPhishingAttack(ns);
        
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

        return result.success;
    }

    return authenticateByModel(ns, hostname, details);
};

async function reallocateRam(ns: NS, hostname: string): Promise<void>
{
    // TODO: Check if 10 tryCounts  are sufficient
    for (let tryCount = 0; tryCount < 10 && ns.dnet.getBlockedRam(hostname) > 0; tryCount++) {
        const result = await ns.dnet.memoryReallocation(hostname);

        if (!result.success) { 
            return; 
        }
    }
}

function infestTarget(ns: NS, hostname: string): void
{
    ns.scp(ns.getScriptName(), hostname);
    ns.exec(ns.getScriptName(), hostname, { preventDuplicates: true });
}

async function startPhishingAttack(ns: NS): Promise<void>
{
    const result = await ns.dnet.phishingAttack();

    if (!result.success) {
        return;
    }

    if (isCacheFile(result.message)) {
        handleCacheFile(ns, result.message);
    }

    // TODO Display only if not a cache. Atm i want to see the msg also it is a cache file
    ns.toast(result.message, ns.enums.ToastVariant.SUCCESS);
}

async function scanFilesystem(ns: NS): Promise<void>
{
    for (const file of ns.ls(ns.getHostname())) {
        if (isCacheFile(file)) {
            handleCacheFile(ns, file);
            continue;
        }

        if (isStormSeed(file)) {
            //ns.dnet.unleashStormSeed();
            continue
        }

        if (isLiteratureFile(file)) {
            handleLiteratureFile(ns, file);
            continue
        }

        if (isTextFile(file)) {
            await handleTextFile(ns, file);
            continue
        }
    }
}

function isCacheFile(filename: string): boolean
{
    return filename.endsWith(FILE_SUFFIX.Cache);
}

function isStormSeed(filename: string): boolean
{
    return filename === STORM_SEED_FILENAME;
}

function isLiteratureFile(filename: string): boolean
{
    return filename.endsWith(FILE_SUFFIX.Lit);
}

function isTextFile(filename: string): boolean
{
    return filename.endsWith(FILE_SUFFIX.Data);
}

function handleCacheFile(ns: NS, file: string): boolean
{
    return ns.dnet.openCache(file).success;
}

function handleLiteratureFile(ns: NS, file: string): boolean
{
    if (LIT_BLACKLIST.has(file) || ns.fileExists(file, "home")) {
        return false;
    }

    return ns.scp(file, "home");
}

async function handleTextFile(ns: NS, file: string): Promise<void>
{
    if (TXT_BLACKLIST.has(file)) {
        return;
    }

    return writePortReliable(ns, FILE_ARCHIVE_PORT, JSON.stringify({
        filename: file, 
        content: ns.read(file), 
        createdAt: Date.now(),
    }));
}

function loadKnownPasswords(ns: NS): Record<string, string>
{
    const host = ns.getHostname();

    ns.scp(PASSWORD_FILE, host, "home");


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
    const payload = buildLogMessage(ns.getHostname(), message, context, type)
    await writePortReliable(ns, LOG_PORT, payload);
}

function tryReportLog(ns: NS, message: string, context?: unknown, type?: string): void
{
    const payload:string = buildLogMessage(ns.getHostname(), message, context, type);
    ns.tryWritePort(LOG_PORT, payload);
}

function buildLogMessage(host: string, message: string, context?: unknown, type: string = ""): string
{
    return JSON.stringify({
        host,
        type,
        message,
        context,
        time: Date.now(),
    });
}

async function writePortReliable(ns: NS, port: number, payload: string): Promise<void>
{
    while (!ns.tryWritePort(port, payload)) {
        await ns.sleep(500);
    }
}

function shouldShutdown(ns: NS): boolean
{
    return ns.peek(DNET_CONTROL_PORT) === SHUTDOWN_COMMAND;
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
            return authenticateFactoriOsServer(ns, hostname, details);

        case "AccountsManager_4.2":
            return authenticateAccountsManagerServer(ns, hostname, details);

        case "BellaCuore":
            return authenticateBellaCuoreServer(ns, hostname, details);

        case "NIL":
            return authenticateNilServer(ns, hostname, details);

        case "FreshInstall_1.0":
            return authenticateFreshInstallServer(ns, hostname, details);

        case "DeepGreen":
            return authenticateDeepGreenServer(ns, hostname, details);
        
        case "Laika4":
            return authenticateLaikaServer(ns, hostname, details);

        case "OpenWebAccessPoint":
            return authenticateOpenWebAccessPointServer(ns, hostname, details);

        default:
            tryReportLog(ns, "Unknown Server Model", details, "WARN");
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
    // The numeric password is always at the end of the hint/response message
    const resultArr = details.passwordHint.match(new RegExp(`\\d\{${details.passwordLength}\}`, "g"));

    if (resultArr === null) {
        tryReportLog(ns, "No password result in method authenticateDeskMemoServer()", { targetHostname: hostname, details }, "ERROR");

        return false;
    } else if (resultArr.length > 1) {
        tryReportLog(ns, "Suspicious password result in method authenticateDeskMemoServer()", { 
            targetHostname: hostname,
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
    // The numeric password is always 'hidden' in the hint/respnse data e.g. #$5-.7*§4!_?
    const resultArr = details.data.match(new RegExp("\\d", "g"));

    if (resultArr === null) {
        tryReportLog(ns, "No password result in method authenticateCloudBlarePassword()", { targetHostname: hostname, details }, "ERROR");

        return false;
    } else if (resultArr.length !== details.passwordLength) {
        tryReportLog(ns, "Suspicious password result in method authenticateCloudBlarePassword()", {
            targetHostname: hostname,
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
    // The password is shuffled in the hint/response data.
    for (const value of uniquePermutation(details.data)) {
        if ((await authenticate(ns, hostname, value)).valueOf()) {
            return true;
        }
    }

    return false;
}

async function authenticateOctantVoxelServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    // The hint/response data contains a number and its base. The password is the representation of this number in the decimal system.
    const [baseValue, value] = details.data.split(",");
    const base = Number(baseValue);

    if (!Number.isInteger(base) || base < 2 || base > 36) {
        return false;
    }

    return authenticate(ns, hostname, parseInt(value, base).toString());
}

async function authenticateProverServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    // The hint/response data contains the buffer length. The Password can be everthing as long as it is a string which is twice as long as the buffer
    // and the first half is identical to the second half e.g. 'abcdeabcde' by a buffer lenght of 5 
    const buffer = Number(details.data);

    return authenticate(ns, hostname, "a".repeat(buffer * 2));
}

async function authenticateFactoriOsServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    // The reponse data contains true or false and indicates whether the password is divisible by the entered number or not.
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
            recentLogResult.logs
            ns.print(recentLogResult.logs);
        }

        const isDivisible = result.data;
        candidates = filterCandidates(candidates, divisor, isDivisible);
    }

    return false;
}

async function authenticateDeepGreenServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    // It's a Mastermind game. The response data contains <exactly matches>,<symbol match but wrong position>
    const passwordDigits: string[] = [];

    for (let digit = 0; digit <= 9; digit++) {
        const candidate = String(digit).repeat(details.passwordLength);
        const result = await ns.dnet.authenticate(hostname, candidate);

        if (result.success) {
            await reportPassword(ns, hostname, candidate);
            return true;
        }

        const matches = parseDeepGreenMatches(result.data);

        if (null === matches) {
            tryReportLog(ns, "Unexpected response data in authenticateDeepGreenServer()", {
                targetHostname: hostname,
                passwordCandidate: candidate,
                result,
                details,
            }, "ERROR");

            return false;
        }

        const digitCount = matches.exact + matches.misplaced;

        for (let count = 0; count < digitCount; count++) {
            passwordDigits.push(String(digit));
        }

        if (passwordDigits.length === details.passwordLength) {
            break;
        }

        if (passwordDigits.length > details.passwordLength) {
            tryReportLog(ns, "Too many password digits found in authenticateDeepGreenServer()", {
                targetHostname: hostname,
                passwordCandidate: candidate,
                passwordDigits,
                result,
                details,
            }, "ERROR");

            return false;
        }
    }

    if (passwordDigits.length !== details.passwordLength) {
        tryReportLog(ns, "Not enough password digits found in authenticateDeepGreenServer()", {
            targetHostname: hostname,
            passwordDigits,
            details,
        }, "ERROR");

        return false;
    }

    for (const password of uniquePermutation(passwordDigits.join(""))) {
        if (await authenticate(ns, hostname, password)) {
            return true;
        }
    }

    return false;
}

async function authenticateAccountsManagerServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    // It is a binary search. The Hint gives the min and max value. In the response the data field tells us if the pasword is 'Higher' oder 'Lower'
    const range = extractPasswordRange(details);

    if (null === range) {
        tryReportLog(ns, "Could not extract password range in authenticateAccountsManagerServer()", { targetHostname: hostname, details }, "ERROR");

        return false;
    }

    let min = range.min;
    let max = range.max;

    while (min <= max) {
        const password = String(Math.floor(min + ((max - min) / 2)));
        const result = await ns.dnet.authenticate(hostname, password);

        if (result.success) {
            await reportPassword(ns, hostname, password);
            
            return true;
        }

        if ("Higher" === result.data) {
            min = Number(password) + 1;
            continue;
        }

        if ("Lower" === result.data) {
            max = Number(password) - 1;
            continue;
        }

        tryReportLog(ns, "Unexpected response data in authenticateAccountsManagerServer()", {
            targetHostname: hostname,
            password,
            result,
            details,
        }, "ERROR");

        return false;
    }

    return false;
}

async function authenticateBellaCuoreServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    // In the data field is a roman numeral. The password is the numeral written in Arabic numerals.
    const password = parseRomanNumeral(details.data);

    if (null === password) {
        tryReportLog(ns, "Could not parse roman numeral in authenticateBellaCuoreServer()", details, "ERROR");
        return false;
    }

    return authenticate(ns, hostname, String(password));
}

function parseRomanNumeral(value: string): number | null
{
    const romanNumeralValues: Record<string, number> = {
        IV: 4,
        IX: 9,
        XL: 40,
        XC: 90,
        CD: 400,
        CM: 900,
        I: 1,
        V: 5,
        X: 10,
        L: 50,
        C: 100,
        D: 500,
        M: 1000,
    };

    const tokens = value.match(/CM|CD|XC|XL|IX|IV|M|D|C|L|X|V|I/g);

    if (null === tokens || tokens.join("") !== value) {
        return null;
    }

    return tokens.reduce(
        (sum, token) => sum + romanNumeralValues[token],
        0,
    );
}

async function authenticateNilServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    // Trial and Error. The repsonse.data field tells us for every position if it has the correct "yes" number or not "yesn't"
    const password = Array<string>(details.passwordLength).fill("");

    for (let digit = 0; digit <= 9; digit++) {
        const candidate = String(digit).repeat(details.passwordLength);
        const result = await ns.dnet.authenticate(hostname, candidate);

        if (result.success) {
            await reportPassword(ns, hostname, candidate);

            return true;
        }

        const matches = parseNilMatches(result.data, details.passwordLength);

        if (null === matches) {
            tryReportLog(ns, "Unexpected response data in authenticateNilServer()", {
                targetHostname: hostname,
                passwordCandidate: candidate,
                result,
                details,
            }, "ERROR");

            return false;
        }

        for (let index = 0; index < matches.length; index++) {
            if ("yes" === matches[index]) {
                password[index] = String(digit);
            }
        }

        if (password.every(value => "" !== value)) {
            return authenticate(ns, hostname, password.join(""));
        }
    }

    return false;
}

async function authenticateLaikaServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    for (const password of LAIKA_PASSWORDS) {
        if (password.length !== details.passwordLength) {
            continue;
        }

        if (await authenticate(ns, hostname, password)) {
            return true;
        }
    }

    tryReportLog(ns, "No matching Laika password found", {
        targetHostname: hostname,
        knownPasswords: LAIKA_PASSWORDS,
        details,
    }, "INFO");

    return false;
}

async function authenticateOpenWebAccessPointServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    const passwordCandidate = "0".repeat(details.passwordLength);
    const result = await ns.dnet.authenticate(hostname, passwordCandidate);

    if (result.success) {
        await reportPassword(ns, hostname, passwordCandidate);
        return true;
    }

    for (const password of extractOpenWebAccessPointPasswords(result.data, hostname, details.passwordLength)) {
        if (await authenticate(ns, hostname, password)) {
            return true;
        }
    }

    tryReportLog(ns, "No hostname credential found in OpenWebAccessPoint response", {
        targetHostname: hostname,
        passwordCandidate,
        result,
        details,
    }, "INFO");

    return false;
}

function extractOpenWebAccessPointPasswords(data: unknown, hostname: string, passwordLength: number): string[]
{
    if ("string" !== typeof data) {
        return [];
    }

    const escapedHostname = escapeRegExp(hostname);
    const pattern = new RegExp(`${escapedHostname}:([a-zA-Z0-9]+)`, "g");
    const passwords: string[] = [];

    for (const result of data.matchAll(pattern)) {
        if (result[1].length === passwordLength) {
            passwords.push(result[1]);
        }
    }

    return [...new Set(passwords)];
}

function escapeRegExp(value: string): string
{
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDeepGreenMatches(data: unknown): { exact: number, misplaced: number } | null
{
    if ("string" !== typeof data) {
        return null;
    }

    const result = data.match(/(\d+)\s*,\s*(\d+)/);

    if (null === result) {
        return null;
    }

    const exact = Number(result[1]);
    const misplaced = Number(result[2]);

    if (!Number.isInteger(exact) || !Number.isInteger(misplaced)) {
        return null;
    }

    return { exact, misplaced };
}

function parseNilMatches(data: unknown, expectedLength: number): string[] | null
{
    if ("string" !== typeof data) {
        return null;
    }

    const matches = data
        .split(",")
        .map(value => value.trim());

    if (matches.length !== expectedLength) {
        return null;
    }

    return matches;
}

async function authenticateFreshInstallServer(ns: NS, hostname: string, details: DarknetServerDetails): Promise<boolean>
{
    const password = getFreshInstallPassword(details);

    if (null === password) {
        tryReportLog(ns, "Unknown FreshInstall_1.0 password combination", {
            passwordFormat: details.passwordFormat,
            passwordLength: details.passwordLength,
            details,
        }, "WARN");

        return false;
    }

    return authenticate(ns, hostname, password);
}

function getFreshInstallPassword(details: DarknetServerDetails): string | null
{
    const key = `${details.passwordFormat}:${details.passwordLength}`;

    return FRESH_INSTALL_PASSWORDS[key] ?? null;
}

function extractPasswordRange(details: DarknetServerDetails): { min: number, max: number } | null
{
    const result = details.passwordHint.match(/between\s+(-?\d+)\s+and\s+(-?\d+)/i);

    if (null === result) {
        return null;
    }

    const min = Number(result[1]);
    const max = Number(result[2]);

    if (!Number.isInteger(min) || !Number.isInteger(max)) {
        return null;
    }

    return {
        min: Math.min(min, max),
        max: Math.max(min, max),
    };
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