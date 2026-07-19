import { AbstractInfo } from "src/models/abstract-info"
import { HACK_SECURITY_INCREASE, GROW_SECURITY_INCREASE } from "src/utils/constants";

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

export function calculateHackSecurityIncrease(threads: number): number
{
  return threads * HACK_SECURITY_INCREASE;
}

export function calculateGrowSecurityIncrease(threads: number): number
{
  return threads * GROW_SECURITY_INCREASE;
}
