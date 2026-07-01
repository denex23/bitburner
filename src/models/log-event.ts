export interface LogEvent
{
    host: string;
    message: string;
    context?: unknown;
    time: number;
}