import { Context } from "src/models/context";
import { DashboardSnapshot } from "src/models/dashboard-snapshot";
import { DASHBOARD_SNAPSHOT_FILE } from "src/utils/constants";

export class DashboardSnapshotWriter
{
    constructor(private readonly context: Context) { }

    public write(snapshot: DashboardSnapshot): void
    {
        this.context.ns.write(
            DASHBOARD_SNAPSHOT_FILE,
            JSON.stringify(snapshot),
            "w",
        );
    }
}