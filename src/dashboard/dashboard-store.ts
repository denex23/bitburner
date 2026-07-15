import { DashboardSnapshot } from "src/models/dashboard-snapshot";
import { TargetState, WorkerAction } from "src/utils/constants";
import { TargetInfo } from "src/models/target-info";

const HISTORY_DURATION_MS = 60_000;
const MONEY_ATTENTION_THRESHOLD = 0.95;
const SECURITY_ATTENTION_OFFSET = 0.5;

export interface IncomePoint {
    timestamp: number;
    incomePerSecond: number;
}

export interface DashboardMetrics {
    currentIncomePerSecond: number;
    averageIncomePerSecond: number;
    plannedShareThreads: number;
    plannedShareRam: number;
    farmTargetCount: number;
    prepTargetCount: number;
    attentionTargetCount: number;
}

export interface DashboardState {
    snapshot: DashboardSnapshot;
    metrics: DashboardMetrics;
    incomeHistory: IncomePoint[];
}

type DashboardListener = (state: DashboardState) => void;

export class DashboardStore 
{
    private readonly listeners = new Set<DashboardListener>();
    private readonly snapshotHistory: DashboardSnapshot[] = [];
    private state?: DashboardState;

    public getState(): DashboardState | undefined 
    {
        return this.state;
    }

    public subscribe(listener: DashboardListener): () => void 
    {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    public update(snapshot: DashboardSnapshot): void 
    {
        const latestSnapshot = this.snapshotHistory.at(-1);

        if (latestSnapshot?.createdAt === snapshot.createdAt) {
            return;
        }

        this.snapshotHistory.push(snapshot);
        this.removeExpiredSnapshots(snapshot.createdAt);

        this.state = {
            snapshot,
            metrics: this.buildMetrics(snapshot),
            incomeHistory: this.buildIncomeHistory(),
        };

        this.notifyListeners();
    }

    private removeExpiredSnapshots(latestTimestamp: number): void 
    {
        const oldestAllowedTimestamp = latestTimestamp - HISTORY_DURATION_MS;

        while (this.snapshotHistory.length > 1 && this.snapshotHistory[0].createdAt < oldestAllowedTimestamp) {
            this.snapshotHistory.shift();
        }
    }

    private buildMetrics(snapshot: DashboardSnapshot): DashboardMetrics 
    {
        const shareJobs = snapshot.jobs.filter(job => WorkerAction.Share === job.action);

        return {
            currentIncomePerSecond: this.calculateCurrentIncomePerSecond(),
            averageIncomePerSecond: this.calculateAverageIncomePerSecond(),
            plannedShareThreads: shareJobs.reduce((sum, job) => sum + job.threads, 0),
            plannedShareRam: shareJobs.reduce((sum, job) => sum + job.allocatedRam, 0),
            farmTargetCount: snapshot.targets.filter(target => TargetState.Farm === target.state).length,
            prepTargetCount: snapshot.targets.filter(target => TargetState.Farm !== target.state).length,
            attentionTargetCount: snapshot.targets.filter(target => this.targetNeedsAttention(target)).length,
        };
    }

    private targetNeedsAttention(target: TargetInfo): boolean {
        const moneyNeedsAttention = target.currentMoney < target.maxMoney * MONEY_ATTENTION_THRESHOLD;
        const securityNeedsAttention = target.currentSecurity > target.minSecurity + SECURITY_ATTENTION_OFFSET;

        return TargetState.Farm === target.state && (moneyNeedsAttention || securityNeedsAttention);
    }

    private calculateCurrentIncomePerSecond(): number 
    {
        return this.calculateIncomePerSecond(
            this.snapshotHistory.at(-2),
            this.snapshotHistory.at(-1),
        );
    }

    private calculateAverageIncomePerSecond(): number 
    {
        return this.calculateIncomePerSecond(
            this.snapshotHistory.at(0),
            this.snapshotHistory.at(-1),
        );
    }

    private buildIncomeHistory(): IncomePoint[] 
    {
        const points: IncomePoint[] = [];

        for (let index = 1; index < this.snapshotHistory.length; index++) {
            const previousSnapshot = this.snapshotHistory[index - 1];
            const snapshot = this.snapshotHistory[index];

            points.push({
                timestamp: snapshot.createdAt,
                incomePerSecond: this.calculateIncomePerSecond(
                    previousSnapshot,
                    snapshot,
                ),
            });
        }

        return points;
    }

    private calculateIncomePerSecond(startSnapshot?: DashboardSnapshot, endSnapshot?: DashboardSnapshot): number 
    {
        if (undefined === startSnapshot || undefined === endSnapshot) {
            return 0;
        }

        const elapsedMs = endSnapshot.createdAt - startSnapshot.createdAt;

        if (elapsedMs <= 0) {
            return 0;
        }

        const income = endSnapshot.hackingIncome - startSnapshot.hackingIncome;

        return income / elapsedMs * 1000;
    }

    private notifyListeners(): void 
    {
        if (undefined === this.state) {
            return;
        }

        for (const listener of this.listeners) {
            listener(this.state);
        }
    }
}