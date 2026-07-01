import { NS } from "@ns";

const PASSWORD_PORT = 23;
const PASSWORD_FILE = "src/data/dnet_passwords.json";
const NULL_PORT_DATA = "NULL PORT DATA";

interface PasswordReport
{
    hostname: string;
    password: string;
}

export async function main(ns: NS): Promise<void>
{
    const passwords = readPasswords(ns);

    while (true) {
        const processedMessages = handlePasswordMessages(ns, passwords);

        if (0 === processedMessages) {
            await ns.nextPortWrite(PASSWORD_PORT);
        }
    }
}

function readPasswords(ns: NS): Record<string, string>
{
    if (!ns.fileExists(PASSWORD_FILE, "home")) {
        return {};
    }

    return JSON.parse(ns.read(PASSWORD_FILE)) as Record<string, string>;
}

function handlePasswordMessages(ns: NS, passwords: Record<string, string>): number
{
    let processedMessages = 0;

    while (true) {
        const message = ns.readPort(PASSWORD_PORT);

        if (NULL_PORT_DATA === message) {
            return processedMessages;
        }

        processedMessages++;

        handleReport(ns, parseReport(message), passwords); 
    }
}

function handleReport(ns: NS, report: null|PasswordReport, passwords: Record<string, string>): void
{
    if (report === null || report.hostname === "" || report.password === "") {
        return;
    }

    passwords[report.hostname] = report.password;
    writePasswords(ns, passwords);
}

function writePasswords(ns: NS, passwords: Record<string, string>): void
{
    ns.write(PASSWORD_FILE, JSON.stringify(passwords, null, 2), "w");
}

function parseReport(raw: string): PasswordReport | null
{
    try {
        return JSON.parse(raw) as PasswordReport;
    } catch {
        return null;
    }
}