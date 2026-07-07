import { DarknetServerDetails, NS } from "@ns";
import { DNET_LOG_PORT, DNET_PASSWORD_FILE, DNET_PASSWORD_PORT } from "src/dnet/constants";
import { DNetLogMessage, DNetPasswordMessage } from "src/dnet/types";

type AuthenticatorContext = {
    ns: NS;
    hostname: string;
    details: DarknetServerDetails;
};

type Authenticator = (context: AuthenticatorContext) => Promise<boolean>;

const AUTHENTICATORS: Record<string, Authenticator> = {
    ZeroLogon: authenticateZeroLogonServer,
    "DeskMemo_3.1": authenticateDeskMemoServer,
    "CloudBlare(tm)": authenticateCloudBlareServer,
    "PHP 5.4": authenticatePHPServer,
    OctantVoxel: authenticateOctantVoxelServer,
    Pr0verFl0: authenticateProverServer,
    "Factori-Os": authenticateFactoriOsServer,
    "AccountsManager_4.2": authenticateAccountsManagerServer,
    BellaCuore: authenticateBellaCuoreServer,
    NIL: authenticateNilServer,
    "FreshInstall_1.0": authenticateFreshInstallServer,
    DeepGreen: authenticateDeepGreenServer,
    Laika4: authenticateLaikaServer,
    OpenWebAccessPoint: authenticateOpenWebAccessPointServer,
};

export async function authenticateByModel(context: AuthenticatorContext): Promise<boolean>
{
    const authenticator = AUTHENTICATORS[context.details.modelId];

    if (undefined === authenticator) {
        reportUnknownModel(context);

        return false;
    }

    return authenticator(context);
}

function reportUnknownModel(context: AuthenticatorContext): void
{
    const { ns, hostname, details } = context;

    ns.print(`Unknown darknet model '${details.modelId}' on ${hostname}`);
}

export async function authenticateTarget(ns: NS, hostname: string): Promise<boolean>
{
    const details = ns.dnet.getServerDetails(hostname);

    if (!details.isConnectedToCurrentServer || !details.isOnline) {
        return false;
    }

    if (details.hasSession) {
        return true;
    }

    const passwords = loadKnownPasswords(ns);

    if (Object.hasOwn(passwords, hostname)) {
        const result = ns.dnet.connectToSession(hostname, passwords[hostname]);

        return result.success;
    }

    return authenticateByModel({ns, hostname, details});
}

async function authenticate(context: AuthenticatorContext, password: string): Promise<boolean>
{
    const { ns, hostname } = context;
    const result = await ns.dnet.authenticate(hostname, password);

    if (result.success) {
        await reportPassword(context, password);
    }

    return result.success;
}

function loadKnownPasswords(ns: NS): Record<string, string>
{
    ns.scp(DNET_PASSWORD_FILE, ns.getHostname(), "home");

    if (!ns.fileExists(DNET_PASSWORD_FILE, ns.getHostname())) {
        return {};
    }

    try {
        return JSON.parse(ns.read(DNET_PASSWORD_FILE)) as Record<string, string>;
    } catch {
        return {};
    }
}

async function reportPassword(context: AuthenticatorContext, password: string): Promise<void>
{
    const payload: DNetPasswordMessage = {
        hostname: context.hostname,
        password,
    };

    await writePortReliable(context.ns, DNET_PASSWORD_PORT, JSON.stringify(payload));
}

/* TODO: Prüfen was genau wir brauchen
function log(ns: NS, type: string, message: string, context?: unknown): void
{
    const payload: DNetLogMessage = {
        host: ns.getHostname(),
        type,
        message,
        context,
        time: Date.now(),
    };

    ns.tryWritePort(DNET_LOG_PORT, JSON.stringify(payload));
}

function tryReportLog(ns: NS, message: string, context?: unknown, type?: string): void
{
    const payload:string = buildLogMessage(ns.getHostname(), message, context, type);
    ns.tryWritePort(DNET_LOG_PORT, payload);
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
}*/

async function writePortReliable(ns: NS, port: number, payload: string): Promise<void>
{
    while (!ns.tryWritePort(port, payload)) {
        await ns.sleep(500);
    }
}

async function authenticateZeroLogonServer(context: AuthenticatorContext): Promise<boolean>
{
    return authenticate(context, "");
}

async function authenticateDeskMemoServer(context: AuthenticatorContext): Promise<boolean>
{
    // The numeric password is always at the end of the hint/response message
    const resultArr = context.details.passwordHint.match(new RegExp(`\\d\{${context.details.passwordLength}\}`, "g"));

    if (resultArr === null) {
        tryReportLog(context.ns, "No password result in method authenticateDeskMemoServer()", { 
            targetHostname: context.hostname, 
            details: context.details 
        }, "ERROR");

        return false;
    } else if (resultArr.length > 1) {
        tryReportLog(context.ns, "Suspicious password result in method authenticateDeskMemoServer()", {
            targetHostname: context.hostname,
            expectedLength: 1,
            actualLength: resultArr.length,
            data: resultArr,
            details: context.details
        }, "INFO");

        return false;
    }

    return authenticate(context, resultArr.shift()!);
}

/*
    Ab hier deine bestehenden Solver-Funktionen aus dem alten Crawler einfügen:

    - authenticateCloudBlareServer
    - authenticatePHPServer
    - authenticateOctantVoxelServer
    - authenticateProverServer
    - authenticateFactoriOsServer
    - authenticateAccountsManagerServer
    - authenticateBellaCuoreServer
    - authenticateNilServer
    - authenticateFreshInstallServer
    - authenticateDeepGreenServer
    - authenticateLaikaServer
    - authenticateOpenWebAccessPointServer
    - parseRomanNumeral
    - parseDeepGreenMatches
    - readAuthDataFromRecentLogs
    - parseDarknetResultLog
    - parseAccountsManagerDirection
    - parseNilMatches
    - createCandidates
    - filterCandidates
    - findBestDivisor
    - uniquePermutation
    - usw.

    Die Funktionen aus deinem aktuellen Script passen hier fast 1:1 rein.
*/