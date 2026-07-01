import { NS } from "@ns";

const PASSWORD_PORT = 23;
const PASSWORD_FILE = "src/data/dnet_passwords.json";

interface PasswordReport
{
    hostname: string;
    password: string;
}

export async function main(ns: NS): Promise<void>
{
    const passwords = readPasswords(ns);

    while (true) {
        const raw = ns.readPort(PASSWORD_PORT);

        if (raw === "NULL PORT DATA") {
            await ns.sleep(1000);
            continue;
        }

        const report = parseReport(raw);

        if (report === null || report.hostname === "" || report.password === "") {
            continue;
        }

        passwords[report.hostname] = report.password;
        writePasswords(ns, passwords);
    }
}

function readPasswords(ns: NS): Record<string, string>
{
    if (!ns.fileExists(PASSWORD_FILE, "home")) {
        return {};
    }

    return JSON.parse(ns.read(PASSWORD_FILE)) as Record<string, string>;
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