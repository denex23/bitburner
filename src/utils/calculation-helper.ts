import { AbstractInfo } from "src/models/abstract-info"

export function calculateSecurityDelta(server: AbstractInfo): number 
{
    return server.currentSecurity - server.minSecurity;
}

export function calculateMoneyRatio(server: AbstractInfo): number 
{
  return server.currentMoney / Math.max(server.maxMoney, 1);
}