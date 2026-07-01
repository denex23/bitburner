export interface LogEvent
{
    host: string;
    type?: string;
    message: string;
    context?: unknown;
    time: number;
}