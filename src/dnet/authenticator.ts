import { NS, DarknetServerDetails } from "/NetscriptDefinitions";

type Authenticator = (
    ns: NS,
    hostname: string,
    details: DarknetServerDetails,
) => Promise<boolean>;

type AuthenticatorContext = {
    ns: NS;
    hostname: string;
    details: DarknetServerDetails;
};

type DeepGreenMatches = {
    exact: number,
    misplaced: number,
}

const AUTHENTICATORS: Record<string, Authenticator> = {
    "ZeroLogon": authenticateZeroLogonServer,
    "DeskMemo_3.1": authenticateDeskMemoServer,
    "CloudBlare(tm)": authenticateCloudBlareServer,
    "PHP 5.4": authenticatePHPServer,
    "OctantVoxel": authenticateOctantVoxelServer,
    "Pr0verFl0": authenticateProverServer,
    "Factori-Os": authenticateFactoriOsServer,
    "AccountsManager_4.2": authenticateAccountsManagerServer,
    "BellaCuore": authenticateBellaCuoreServer,
    "NIL": authenticateNilServer,
    "FreshInstall_1.0": authenticateFreshInstallServer,
    "DeepGreen": authenticateDeepGreenServer,
    "Laika4": authenticateLaikaServer,
    "OpenWebAccessPoint": authenticateOpenWebAccessPointServer,
};

const LOG_PORT = 24;
const PASSWORD_PORT = 23;
const DNET_CONTROL_PORT = 25;
const FILE_ARCHIVE_PORT = 26



export async function authenticateByModel(context: AuthenticatorContext): Promise<boolean>
{
    const authenticator = AUTHENTICATORS[context.details.modelId];

    if (undefined === authenticator) {
        return false;
    }

    return authenticator(context);
}

async function authenticateDeepGreenServer(context: AuthenticatorContext): Promise<boolean>
{
    const parseMatches =  (data: unknown): DeepGreenMatches | null =>
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

    const addPasswordDigits = (passwordDigits: string[], digit: string, matches: DeepGreenMatches): void =>
    {
        const digitCount = matches.exact + matches.misplaced;

        for (let count = 0; count < digitCount; count++) {
            passwordDigits.push(digit);
        }
    }

    const { ns, hostname, details } = context;
    const passwordDigits: string[] = [];

    for (let digit = 0; digit <= 9; digit++) {
        const candidate = String(digit).repeat(details.passwordLength);
        const result = await ns.dnet.authenticate(hostname, candidate);

        if (result.success) {
            await reportPassword(ns, hostname, candidate);
            return true;
        }

        const matches = parseMatches(result.data)
            ?? await readAuthDataFromRecentLogs(context, candidate, parseMatches);

        if (null === matches) {
            reportLog(context, "No DeepGreen feedback available", { candidate, result }, "INFO");
            return false;
        }

        

        addPasswordDigits(passwordDigits, String(digit), matches);

        if (passwordDigits.length === details.passwordLength) {
            break;
        }

        if (passwordDigits.length > details.passwordLength) {
            reportLog(context, "Too many password digits found", { candidate, passwordDigits, result }, "ERROR");
            return false;
        }
    }

    if (passwordDigits.length !== details.passwordLength) {
        reportLog(context, "Not enough password digits found", { passwordDigits }, "ERROR");
        return false;
    }

    for (const password of uniquePermutation(passwordDigits.join(""))) {
        if (await authenticate(context, password)) {
            return true;
        }
    }

    return false;
}

async function readAuthDataFromRecentLogs<T>(ns: NS, hostname: string, parseData: AuthLogDataParser<T>): Promise<T | null>
{
    const result = await ns.dnet.heartbleed(hostname, { peek: true, logsToCapture: 3 });

    if (!result.success) {
        return null;
    }

    for (const log of result.logs) {
        const authResult = parseDarknetResultLog(log);

        if (null === authResult) {
            continue;
        }

        const parsedData = parseData(authResult.data, authResult);

        if (null !== parsedData) {
            return parsedData;
        }
    }

    return null;
}

async function reportPassword(ns: NS, hostname: string, password: string): Promise<void>
{
    await writePortReliable(ns, PASSWORD_PORT, JSON.stringify({ hostname, password }));
}

async function reportLog(context: AuthenticatorContext): Promise<void>
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