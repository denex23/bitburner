import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { WorkerJob } from "src/models/worker-job";
import { SCRIPT_MAP } from 'src/utils/constants';

export class Deployer 
{
    constructor(private readonly context: Context) {}

    public async deploy(servers: ServerInfo[], jobs: WorkerJob[]): Promise<void> 
    {
        const usedHosts = new Set(jobs.map(job => job.hostname));
        const workers = servers.filter(server =>
            server.rooted &&
            server.maxRam > 0 &&
            server.hostname !== "home"
        );

        for (const worker of workers) {
            if (!usedHosts.has(worker.hostname)) {
                this.context.ns.killall(worker.hostname);
            }
        }

        for (const job of jobs) {
            await this.deployJob(job);
        }
    }

    private async deployJob(job: WorkerJob): Promise<void> 
    {
        const ns = this.context.ns;

        const processes = ns.ps(job.hostname);
        const script = SCRIPT_MAP[job.action];
        const desiredArgs = [job.target];

        if (!ns.fileExists(script, "home")) {
            ns.tprint(`[SCRIPT MISSING] ${script}`);
            
            return;
        }

        const existing = processes.find(process =>
            process.filename === script &&
            JSON.stringify(process.args) === JSON.stringify(desiredArgs)
        );

        if (existing) {
            return;
        }

        ns.killall(job.hostname);
        await ns.scp(script, job.hostname);

        const pid = ns.exec(
            script,
            job.hostname,
            job.threads,
            job.target
        );

        if (pid === 0) {
            ns.tprint(
                `[DEPLOY FAILED] ${job.hostname} -> ${script} ${job.target} ` +
                `threads=${job.threads} ` +
                `fileHome=${ns.fileExists(script, "home")} ` +
                `fileWorker=${ns.fileExists(script, job.hostname)} ` +
                `scriptRam=${ns.getScriptRam(script)} ` +
                `workerRam=${ns.getServerMaxRam(job.hostname)} ` +
                `needed=${job.threads * ns.getScriptRam(script)}`
            );
        }
    }
}