import { AbstractInfo } from "src/models/abstract-info"
import { TargetState } from "src/utils/constants"

export interface TargetInfo extends AbstractInfo 
{
    score: number;
    state: TargetState;
    priority: number;
}