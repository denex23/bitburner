import { NS } from "@ns";

const MIN_CASH_RESERVE = 100_000_000;
const MAX_CASH_USAGE_RATIO = 0.5;
const BUY_FORECAST = 0.58;
const SELL_FORECAST = 0.53;
const MIN_EXPECTED_EDGE = 0.001;
const LOOP_DELAY = 6_000;

export async function main(ns: NS): Promise<void> 
{
    if (!hasRequiredAccess(ns)) {
        ns.tprint("[STOCK] Missing WSE/TIX/4S TIX access.");
        return;
    }

    while (true) {
        tradeStocks(ns);
        await ns.sleep(LOOP_DELAY);
    }
}

function hasRequiredAccess(ns: NS): boolean
{
    return ns.stock.hasWseAccount()
        && ns.stock.hasTixApiAccess()
        && ns.stock.has4SDataTixApi();
}

function tradeStocks(ns: NS): void
{
    sellWeakPositions(ns);

    for (const symbol of getBuyCandidates(ns)) {
        buyPosition(ns, symbol);
    }
}

function sellWeakPositions(ns: NS): void
{
    for (const symbol of ns.stock.getSymbols()) {
        const [shares, averagePrice] = ns.stock.getPosition(symbol);

        if (shares <= 0) {
            continue;
        }

        if (shouldSell(ns, symbol, averagePrice)) {
            ns.stock.sellStock(symbol, shares);
        }
    }
}

function shouldSell(ns: NS, symbol: string, averagePrice: number): boolean
{
    const forecast = ns.stock.getForecast(symbol);
    const bidPrice = ns.stock.getBidPrice(symbol);

    return forecast < SELL_FORECAST || bidPrice < averagePrice * 0.97;
}

function getBuyCandidates(ns: NS): string[]
{
    return ns.stock.getSymbols()
        .filter(symbol => shouldBuy(ns, symbol))
        .sort((a, b) => calculateExpectedEdge(ns, b) - calculateExpectedEdge(ns, a));
}

function shouldBuy(ns: NS, symbol: string): boolean
{
    const [shares] = ns.stock.getPosition(symbol);

    return shares <= 0
        && ns.stock.getForecast(symbol) >= BUY_FORECAST
        && calculateExpectedEdge(ns, symbol) >= MIN_EXPECTED_EDGE;
}

function calculateExpectedEdge(ns: NS, symbol: string): number
{
    const forecast = ns.stock.getForecast(symbol);
    const volatility = ns.stock.getVolatility(symbol);

    return Math.abs(forecast - 0.5) * volatility;
}

function buyPosition(ns: NS, symbol: string): void
{
    const budget = calculateBudget(ns);

    if (budget <= 0) {
        return;
    }

    const maxShares = ns.stock.getMaxShares(symbol);
    const [ownedShares] = ns.stock.getPosition(symbol);
    const sharesToBuy = calculateAffordableShares(ns, symbol, budget, maxShares - ownedShares);

    if (sharesToBuy <= 0) {
        return;
    }

    ns.stock.buyStock(symbol, sharesToBuy);
}

function calculateBudget(ns: NS): number
{
    const cash = ns.getServerMoneyAvailable("home");
    const usableCash = cash - MIN_CASH_RESERVE;

    return Math.max(0, usableCash * MAX_CASH_USAGE_RATIO);
}

function calculateAffordableShares(ns: NS, symbol: string, budget: number, maxShares: number): number
{
    let shares = Math.floor(budget / ns.stock.getAskPrice(symbol));

    shares = Math.min(shares, maxShares);

    while (shares > 0 && ns.stock.getPurchaseCost(symbol, shares, "L") > budget) {
        shares--;
    }

    return shares;
}