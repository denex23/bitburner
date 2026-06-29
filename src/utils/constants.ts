// Define TargetState as const object
export const TargetState = {
    Weaken: "weaken",
    Grow: "grow",
    Farm: "farm",
} as const;

export type TargetState = typeof TargetState[keyof typeof TargetState];

// Define WorkerAction as const object
export const WorkerAction = {
    Hack: "hack",
    Grow: "grow",
    Weaken: "weaken",
} as const;

export type WorkerAction = typeof WorkerAction[keyof typeof WorkerAction];

// Define WorkerAction as const object
export const CloudServer = {
    Prefix: "cloud-server",
    Count: 25,
    Ram: 4096,
} as const;

export type CloudServer = typeof CloudServer[keyof typeof CloudServer];

export const RESERVED_HOME_RAM = 16;
export const CONTROLLER_SCRIPT = "src/core/controller.js";

export const FACTION_SERVERS = [
    "CSEC",
    "avmnite-02h",
    "I.I.I.I",
    "run4theh111z",
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
    [WorkerAction.Hack]: "src/workers/hack.ts",
    [WorkerAction.Grow]: "src/workers/grow.ts",
    [WorkerAction.Weaken]: "src/workers/weaken.ts",
};

export const SCRIPT_RAM: Record<WorkerAction, number> = {
    [WorkerAction.Hack]: 1.7,
    [WorkerAction.Grow]: 1.75,
    [WorkerAction.Weaken]: 1.75,
};