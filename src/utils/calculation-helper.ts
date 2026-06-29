import { AbstractInfo } from "src/models/abstract-info"

export function calculateSecurityDelta(server: AbstractInfo): number 
{
    return server.currentSecurity - server.minSecurity;
}

export function calculateSecurityRatio(server: AbstractInfo): number 
{
  return server.currentSecurity / Math.max(1, server.minSecurity);
}

export function calculateMoneyRatio(server: AbstractInfo): number 
{
  return server.currentMoney / Math.max(1, server.maxMoney);
}