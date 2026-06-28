export interface RootResult 
{
    hostname: string;
    success: boolean;
    alreadyRooted: boolean;
    requiredPorts: number;
    availablePorts: number;
}