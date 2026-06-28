import { AbstractInfo } from "src/models/abstract-info"

export interface ServerInfo extends AbstractInfo 
{
    rooted: boolean;
    maxRam: number;
    chance: number;
    hackTime: number;
    growth: number;
    requiredPorts: number;
    requiredHackLevel: number;
}