import { Alignment } from "/src/debug/cell-alignment";

export interface Column
{
    name: string;
    width: number|undefined;
    alignment: Alignment
}