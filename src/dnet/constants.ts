import { WorkerAction } from "src/utils/constants";

export const DNET_ENTRY_SERVER = "darkweb";

export const DNET_CRAWLER_SCRIPT = "src/dnet/agent.ts";

export const DNET_AUTH_WORKER_SCRIPT = "src/dnet/workers/auth.ts";
export const DNET_CACHE_WORKER_SCRIPT = "src/dnet/workers/cache.ts";
export const DNET_MEMORY_WORKER_SCRIPT = "src/dnet/workers/memory.ts";
export const DNET_MIGRATION_WORKER_SCRIPT = "src/dnet/workers/migration.ts";
export const DNET_PHISHING_WORKER_SCRIPT = "src/dnet/workers/phishing.ts";
export const DNET_STOCK_WORKER_SCRIPT = "src/dnet/workers/stock.ts";

export const DNET_FILES = [
    DNET_CRAWLER_SCRIPT,
    DNET_AUTH_WORKER_SCRIPT,
    DNET_CACHE_WORKER_SCRIPT,
    DNET_MEMORY_WORKER_SCRIPT,
    DNET_MIGRATION_WORKER_SCRIPT,
    DNET_PHISHING_WORKER_SCRIPT,
    DNET_STOCK_WORKER_SCRIPT,
    "src/dnet/constants.ts",
    "src/dnet/types.ts",
    "src/dnet/file-handler.ts",
    "src/dnet/auth-solver.ts",
] as const;

export const DNET_PASSWORD_FILE = "src/data/dnet/passwords.json";
export const DNET_NODE_STATE_FILE = "src/data/dnet/nodes.json";

export const DNET_PASSWORD_PORT = 23;
export const DNET_LOG_PORT = 24;
export const DNET_CONTROL_PORT = 25;
export const DNET_FILE_ARCHIVE_PORT = 26;
export const DNET_STOCK_PORT = 27;
export const DNET_NODE_STATE_PORT = 28;

export const DNET_SHUTDOWN_COMMAND = "shutdown";

export const DNET_LOOP_DELAY = 5_000;
export const DNET_CONTROLLER_DELAY = 10_000;

export const DNET_AUTH_THREADS = 8;
export const DNET_MEMORY_THREADS = 16;
export const DNET_MIGRATION_THREADS = 8;
export const DNET_STOCK_THREADS = 16;

export const DNET_PHISHING_RAM_RESERVE = 8;

export const STORM_SEED_FILENAME = "STORM_SEED.exe";

export const FILE_SUFFIX = {
    Cache: ".cache",
    Lit: ".lit",
    Data: ".data.txt",
} as const;

export const LIT_BLACKLIST = new Set<string>([
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

export const TXT_BLACKLIST = new Set<string>([
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