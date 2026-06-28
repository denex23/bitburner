import { TargetState } from "src/utils/constants";

export interface TargetRow
{
    target: string,
    state: TargetState,
    score: number,
    priority: number,
    currentMoney: number,
    maxMoney: number,
    currentSecurity: number,
    minSecurity: number,
}