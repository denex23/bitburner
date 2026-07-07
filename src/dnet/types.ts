export interface DNetPasswordMessage
{
    hostname: string;
    password: string;
}

export interface DNetLogMessage
{
    host: string;
    type: string;
    message: string;
    context?: unknown;
    time: number;
}

export interface DNetFileArchiveMessage
{
    filename: string;
    content: string;
    sourceHost: string;
    createdAt: number;
}

export interface DNetStockCommand
{
    symbol: string;
    priority?: number;
    createdAt?: number;
}

export interface DNetNodeStateMessage
{
    hostname: string;
    neighborCount: number;
    cacheFiles: number;
    hasSession: boolean;
    isOnline: boolean;
    timestamp: number;
}

export interface DNetNodeState
{
    hostname: string;
    lastSeen: number;
    depth: number;
    isOnline: boolean;
    hasSession: boolean;
    isLeaf: boolean;
    cacheFiles: number;
    neighborCount: number;
}