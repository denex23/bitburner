import { Context } from '/src/models/context';

import { ServerInfo } from "/src/models/server-info";
import { WorkerJob } from "/src/models/worker-job";

import { SCRIPT_MAP } from '/src/utils/constants';

export class Deployer {
    constructor(private readonly context: Context) {}

    public async deploy(servers: ServerInfo[], jobs: WorkerJob[]): Promise<void> {
        const {ns} = this.context;
        const usedHosts = new Set(jobs.map(job => job.hostname));
        const workers = servers.filter(server =>
            server.rooted &&
            server.maxRam > 0 &&
            server.hostname !== "home"
        );

        for (const worker of workers) {
            if (!usedHosts.has(worker.hostname)) {
                ns.killall(worker.hostname);
            }
        }

        for (const job of jobs) {
            this.deployJob(job);
        }
    }

    private deployJob(job: WorkerJob): void {
        const {ns} = this.context;
        const processes = ns.ps(job.hostname);
        const script = SCRIPT_MAP[job.action];
        const desiredArgs = [job.target];
        const existing = processes.find(process =>
            process.filename === script &&
            JSON.stringify(process.args) === JSON.stringify(desiredArgs)
        );

        if (existing) {
            return;
        }

        ns.killall(job.hostname);
        ns.scp(script, job.hostname);

        const pid = ns.exec(
            script,
            job.hostname,
            job.threads,
            job.target
        );
    }
}