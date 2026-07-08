export const TargetState = {
    Weaken: "weaken",
    Grow: "grow",
    Farm: "farm",
} as const;

export type TargetState = typeof TargetState[keyof typeof TargetState];

export const WorkerAction = {
    Hack: "hack",
    Grow: "grow",
    Weaken: "weaken",
    Share: "share",
} as const;

export type WorkerAction = typeof WorkerAction[keyof typeof WorkerAction];

export const CloudServer = {
    Prefix: "cloud-server",
    Count: 25,
    Ram: 4096,
} as const;

export type CloudServer = typeof CloudServer[keyof typeof CloudServer];

export const RESERVED_HOME_RAM = 128;
export const CONTROLLER_SCRIPT = "src/core/controller.ts";

export const PASSWORD_WRITER = "src/data/password-writer.ts";
export const LOG_WRITER = "src/data/dnet-log-writer.ts";
export const TXT_WRITER = "src/data/dnet-txt-writer.ts";

export const DASHBOARD_SNAPSHOT_FILE = "/tmp/dashboard-snapshot.txt";

export const SHARE_TARGET = "Share";
export const SHARE_RAM_BUFFER = 32;

export const TARGET_HACK_RATIO = 0.30;
export const HACK_SECURITY_INCREASE = 0.002;
export const GROW_SECURITY_INCREASE = 0.004;
export const MAX_HACK_THREADS_PER_TARGET = 48;

export const FARM_RAM_RATIO = 0.7;
export const PREP_RAM_RATIO = 0.3;

export const MAX_ACTIVE_BATCHES_PER_TARGET = 6;
export const BATCH_SPACING_MS = 200;
export const CONTROLLER_INTERVAL_MS = 5000;

export const FACTION_SERVERS = [
    "CSEC",
    "avmnite-02h",
    "I.I.I.I",
    "run4theh111z",
];

export const CORPORATION_SERVERS = [
    "fulcrumassets",
    "fulcrumtech",
    "ecorp",
    "megacorp",
    "4sigma", 
    "kuai-gong",
    "nwo",
    "omnitek",
    "blade",
    "b-and-a",
    "clarkinc",  
];

export const TARGET_ACTION: Record<TargetState, WorkerAction> = {
    [TargetState.Weaken]: WorkerAction.Weaken,
    [TargetState.Grow]: WorkerAction.Grow,
    [TargetState.Farm]: WorkerAction.Hack,
};

export const STATE_WEIGHT: Record<TargetState, number> = {
    [TargetState.Weaken]: 1,
    [TargetState.Grow]: 2,
    [TargetState.Farm]: 3,
};

export const SCRIPT_MAP: Record<WorkerAction, string> = {
    [WorkerAction.Hack]: "src/workers/hack.js",
    [WorkerAction.Grow]: "src/workers/grow.js",
    [WorkerAction.Weaken]: "src/workers/weaken.js",
    [WorkerAction.Share]: "src/workers/share.js",
};

export const SCRIPT_RAM: Record<WorkerAction, number> = {
    [WorkerAction.Hack]: 1.7,
    [WorkerAction.Grow]: 1.75,
    [WorkerAction.Weaken]: 1.75,
    [WorkerAction.Share]: 4,
};
