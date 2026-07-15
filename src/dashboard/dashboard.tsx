import { NS } from "@ns";
import { DashboardState, DashboardStore, IncomePoint } from "src/dashboard/dashboard-store";
import { DashboardSnapshot } from "src/models/dashboard-snapshot";
import { TargetInfo } from "src/models/target-info";
import { DASHBOARD_SNAPSHOT_FILE, STATE_WEIGHT } from "src/utils/constants";

export async function main(ns: NS): Promise<void> 
{
    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.setTailTitle("Operations Dashboard");
    ns.ui.resizeTail(1100, 850);

    const store = new DashboardStore();

    ns.printRaw(<Dashboard store={store} />);

    while (true) {
        const content = ns.read(DASHBOARD_SNAPSHOT_FILE);

        if (content) {
            store.update(JSON.parse(content) as DashboardSnapshot);
        }

        await ns.sleep(1000);
    }
}

interface DashboardProps {
    store: DashboardStore;
}

function Dashboard({ store }: DashboardProps): React.ReactElement 
{
    const [state, setState] = React.useState<DashboardState | undefined>(
        store.getState(),
    );

    React.useEffect(() => {
        return store.subscribe(setState);
    }, [store]);

    return (
        <>
            <DashboardStyles />

            <main className="operations-dashboard">
                {undefined === state
                    ? <WaitingForSnapshot />
                    : <DashboardContent state={state} />}
            </main>
        </>
    );
}

function WaitingForSnapshot(): React.ReactElement {
    return (
        <section className="dashboard-empty">
            <span className="dashboard-status-dot" />
            Waiting for dashboard snapshot...
        </section>
    );
}

interface DashboardContentProps {
    state: DashboardState;
}

function DashboardContent({ state }: DashboardContentProps): React.ReactElement {
    return (
        <>
            <DashboardHeader state={state} />
            <DashboardSummary state={state} />
            <IncomeChart points={state.incomeHistory} />
            <TargetOverview targets={state.snapshot.targets} />
        </>
    );
}

function DashboardHeader({ state }: DashboardContentProps): React.ReactElement {
    return (
        <header className="dashboard-header">
            <div>
                <h1>Operations</h1>
                <p>Network automation and batch performance</p>
            </div>

            <time dateTime={new Date(state.snapshot.createdAt).toISOString()}>
                Updated {new Date(state.snapshot.createdAt).toLocaleTimeString("de-DE")}
            </time>
        </header>
    );
}

function DashboardSummary({ state }: DashboardContentProps): React.ReactElement {
    const { snapshot, metrics } = state;

    return (
        <section className="dashboard-summary" aria-label="System summary">
            <MetricCard
                label="Hacking income"
                value={`${formatNumber(metrics.currentIncomePerSecond)}/s`}
                detail={`${formatNumber(metrics.averageIncomePerSecond)}/s average`}
            />

            <MetricCard
                label="Worker RAM"
                value={`${formatRam(snapshot.plannedRam)} planned`}
                detail={`${formatRam(snapshot.availableWorkerRam)} currently free`}
            />

            <MetricCard
                label="Share"
                value={`${formatNumber(snapshot.runningShareThreads)} threads`}
                detail={`${formatRam(snapshot.runningShareRam)} running`}
            />

            <MetricCard
                label="Targets"
                value={`${metrics.farmTargetCount} farm`}
                detail={`${metrics.prepTargetCount} prep | ${metrics.attentionTargetCount} attention`}
                attention={metrics.attentionTargetCount > 0}
            />
        </section>
    );
}

interface MetricCardProps {
    label: string;
    value: string;
    detail: string;
    attention?: boolean;
}

function MetricCard({ label, value, detail, attention = false }: MetricCardProps): React.ReactElement {
    const className = attention
        ? "dashboard-card dashboard-card-attention"
        : "dashboard-card";

    return (
        <article className={className}>
            <span className="dashboard-card-label">{label}</span>
            <strong>{value}</strong>
            <span className="dashboard-card-detail">{detail}</span>
        </article>
    );
}

interface IncomeChartProps {
    points: IncomePoint[];
}

function IncomeChart({ points }: IncomeChartProps): React.ReactElement {
    const chartPoints = buildChartPoints(points);

    return (
        <section className="dashboard-section">
            <div className="dashboard-section-header">
                <div>
                    <h2>Hacking income</h2>
                    <p>Last 60 seconds</p>
                </div>

                <span>{formatNumber(getMaximumIncome(points))}/s peak</span>
            </div>

            {points.length < 2
                ? (
                    <div className="dashboard-chart-empty">
                        Waiting for income history...
                    </div>
                )
                : (
                    <svg
                        className="dashboard-chart"
                        viewBox="0 0 1000 180"
                        role="img"
                        aria-label="Hacking income during the last 60 seconds"
                        preserveAspectRatio="none"
                    >
                        <line className="dashboard-chart-grid" x1="0" y1="179" x2="1000" y2="179" />
                        <polyline className="dashboard-chart-line" points={chartPoints} />
                    </svg>
                )}
        </section>
    );
}

function buildChartPoints(points: IncomePoint[]): string {
    if (points.length <= 0) {
        return "";
    }

    const minimumTimestamp = points[0].timestamp;
    const maximumTimestamp = points.at(-1)?.timestamp ?? minimumTimestamp;
    const timestampRange = Math.max(1, maximumTimestamp - minimumTimestamp);
    const maximumIncome = Math.max(1, getMaximumIncome(points));

    return points
        .map(point => {
            const x = ((point.timestamp - minimumTimestamp) / timestampRange) * 1000;
            const y = 175 - (point.incomePerSecond / maximumIncome) * 165;

            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
}

function getMaximumIncome(points: IncomePoint[]): number {
    return points.reduce(
        (maximum, point) => Math.max(maximum, point.incomePerSecond),
        0,
    );
}

interface TargetOverviewProps {
    targets: TargetInfo[];
}

function TargetOverview({ targets }: TargetOverviewProps): React.ReactElement {
    const sortedTargets = [...targets].sort((left, right) => {
        const stateDifference = STATE_WEIGHT[right.state] - STATE_WEIGHT[left.state];

        if (stateDifference !== 0) {
            return stateDifference;
        }

        return right.priority - left.priority;
    });

    return (
        <section className="dashboard-section">
            <div className="dashboard-section-header">
                <div>
                    <h2>Targets</h2>
                    <p>Current money and security state</p>
                </div>

                <span>{sortedTargets.length} selected</span>
            </div>

            <div className="dashboard-table-container">
                <table className="dashboard-table">
                    <thead>
                        <tr>
                            <th>Target</th>
                            <th>State</th>
                            <th>Money</th>
                            <th>Security</th>
                            <th className="dashboard-number">Score</th>
                        </tr>
                    </thead>

                    <tbody>
                        {sortedTargets.map(target => (
                            <TargetRow key={target.hostname} target={target} />
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

interface TargetRowProps {
    target: TargetInfo;
}

function TargetRow({ target }: TargetRowProps): React.ReactElement {
    const moneyRatio = target.maxMoney <= 0 ? 0 : target.currentMoney / target.maxMoney;
    const securityDelta = Math.max(0, target.currentSecurity - target.minSecurity);

    return (
        <tr>
            <td className="dashboard-target-name">{target.hostname}</td>

            <td>
                <span className={`dashboard-state dashboard-state-${target.state}`}>
                    {target.state}
                </span>
            </td>

            <td>
                <div className="dashboard-progress-value">
                    <span>{formatPercent(moneyRatio)}</span>
                    <span>{formatNumber(target.currentMoney)}</span>
                </div>

                <div className="dashboard-progress">
                    <span style={{ width: `${Math.min(100, moneyRatio * 100)}%` }} />
                </div>
            </td>

            <td>
                <span className={securityDelta > 0.5 ? "dashboard-warning" : ""}>
                    +{securityDelta.toFixed(2)}
                </span>
            </td>

            <td className="dashboard-number">
                {formatNumber(target.score)}
            </td>
        </tr>
    );
}

function formatNumber(value: number): string {
    return new Intl.NumberFormat("de-DE", {
        notation: "compact",
        maximumFractionDigits: 2,
    }).format(value);
}

function formatPercent(value: number): string {
    return new Intl.NumberFormat("de-DE", {
        style: "percent",
        maximumFractionDigits: 1,
    }).format(value);
}

function formatRam(ramInGigabytes: number): string {
    const units = ["GB", "TB", "PB", "EB"];
    const unitBase = 1000;
    let value = ramInGigabytes;
    let unitIndex = 0;

    while (value >= unitBase && unitIndex < units.length - 1) {
        value /= unitBase;
        unitIndex++;
    }

    return `${value.toLocaleString("de-DE", {
        maximumFractionDigits: 2,
    })} ${units[unitIndex]}`;
}

function DashboardStyles(): React.ReactElement {
    return (
        <style>{`
            .operations-dashboard {
                --dashboard-surface: color-mix(in srgb, currentColor 5%, transparent);
                --dashboard-surface-strong: color-mix(in srgb, currentColor 9%, transparent);
                --dashboard-border: color-mix(in srgb, currentColor 18%, transparent);
                --dashboard-muted: color-mix(in srgb, currentColor 62%, transparent);
                --dashboard-primary: #45d483;
                --dashboard-warning: #f0b45a;

                display: grid;
                gap: 16px;
                min-width: 0;
                padding: 18px;
                color: inherit;
                font-family: system-ui, sans-serif;
            }

            .dashboard-header {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 16px;
            }

            .dashboard-header h1,
            .dashboard-section h2 {
                margin: 0;
                font-weight: 500;
            }

            .dashboard-header p,
            .dashboard-section-header p {
                margin: 4px 0 0;
                color: var(--dashboard-muted);
            }

            .dashboard-header time,
            .dashboard-section-header > span {
                color: var(--dashboard-muted);
                white-space: nowrap;
            }

            .dashboard-summary {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 12px;
            }

            .dashboard-card {
                display: grid;
                gap: 6px;
                min-width: 0;
                padding: 14px;
                border: 1px solid var(--dashboard-border);
                border-radius: 8px;
                background: var(--dashboard-surface);
            }

            .dashboard-card-attention {
                border-color: var(--dashboard-warning);
            }

            .dashboard-card-label,
            .dashboard-card-detail {
                color: var(--dashboard-muted);
            }

            .dashboard-card strong {
                overflow: hidden;
                font-weight: 500;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .dashboard-section {
                min-width: 0;
                padding: 16px;
                border: 1px solid var(--dashboard-border);
                border-radius: 8px;
                background: var(--dashboard-surface);
            }

            .dashboard-section-header {
                display: flex;
                align-items: flex-end;
                justify-content: space-between;
                gap: 16px;
                margin-bottom: 16px;
            }

            .dashboard-chart {
                display: block;
                width: 100%;
                height: 180px;
                overflow: visible;
            }

            .dashboard-chart-grid {
                stroke: var(--dashboard-border);
                stroke-width: 1;
                vector-effect: non-scaling-stroke;
            }

            .dashboard-chart-line {
                fill: none;
                stroke: var(--dashboard-primary);
                stroke-linecap: round;
                stroke-linejoin: round;
                stroke-width: 2;
                vector-effect: non-scaling-stroke;
            }

            .dashboard-chart-empty,
            .dashboard-empty {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 180px;
                color: var(--dashboard-muted);
            }

            .dashboard-status-dot {
                width: 8px;
                height: 8px;
                margin-right: 8px;
                border-radius: 50%;
                background: var(--dashboard-primary);
            }

            .dashboard-table-container {
                min-width: 0;
                overflow-x: auto;
            }

            .dashboard-table {
                width: 100%;
                border-collapse: collapse;
            }

            .dashboard-table th,
            .dashboard-table td {
                padding: 10px 12px;
                border-bottom: 1px solid var(--dashboard-border);
                text-align: left;
                white-space: nowrap;
            }

            .dashboard-table th {
                color: var(--dashboard-muted);
                font-weight: 400;
            }

            .dashboard-table tbody tr:hover {
                background: var(--dashboard-surface-strong);
            }

            .dashboard-target-name {
                font-weight: 500;
            }

            .dashboard-number {
                text-align: right !important;
            }

            .dashboard-state {
                display: inline-block;
                min-width: 58px;
                padding: 3px 7px;
                border: 1px solid var(--dashboard-border);
                border-radius: 999px;
                text-align: center;
                text-transform: uppercase;
            }

            .dashboard-state-farm {
                border-color: var(--dashboard-primary);
            }

            .dashboard-state-grow,
            .dashboard-state-weaken,
            .dashboard-warning {
                color: var(--dashboard-warning);
            }

            .dashboard-progress-value {
                display: flex;
                justify-content: space-between;
                gap: 12px;
            }

            .dashboard-progress {
                width: 180px;
                height: 4px;
                margin-top: 5px;
                overflow: hidden;
                border-radius: 2px;
                background: var(--dashboard-border);
            }

            .dashboard-progress span {
                display: block;
                height: 100%;
                background: var(--dashboard-primary);
            }

            @media (max-width: 800px) {
                .dashboard-summary {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }

                .dashboard-header,
                .dashboard-section-header {
                    align-items: flex-start;
                    flex-direction: column;
                    gap: 6px;
                }
            }
        `}</style>
    );
}