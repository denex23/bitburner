import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { WorkerJob } from "src/models/worker-job";
import { SCRIPT_MAP } from 'src/utils/constants';

export class Deployer 
{
    constructor(private readonly context: Context) {}

    public async deploy(servers: ServerInfo[], jobs: WorkerJob[]): Promise<void> 
    {
        const desiredJobs = this.createDesiredJobKeys(jobs);
        const workers = this.getWorker(servers);

        for (const worker of workers) {
            this.stopObsoleteProcesses(worker, desiredJobs);
        }

        for (const job of jobs) {
            await this.deployJob(job);
        }
    }

    private async deployJob(job: WorkerJob): Promise<void> 
    {
        const ns = this.context.ns;
        const script = SCRIPT_MAP[job.action];

        if (!ns.fileExists(script, "home")) {
            ns.tprint(`[SCRIPT MISSING] ${script}`);
            return;
        }

        if (this.isJobRunning(job, script)) {
            return;
        }

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
                `needed=${job.threads * ns.getScriptRam(script)}` +
                `freeRam=${ns.getServerMaxRam(job.hostname) - ns.getServerUsedRam(job.hostname)} `
            );
        }
    }

    private getWorker(servers: ServerInfo[]): ServerInfo[] {
        return servers.filter(server =>
            server.rooted &&
            server.maxRam > 0 &&
            server.hostname !== "home"
        );
    }

    private createDesiredJobKeys(jobs: WorkerJob[]): Set<string> 
    {
        return new Set(jobs.map(job => 
            this.createJobKey(job.hostname, SCRIPT_MAP[job.action], job.target, job.threads)
        ));
    }

    private createJobKey(hostname: string, script: string, target: string, threads: number): string 
    {
        return `${hostname}|${script}|${target}|${threads}`;
    }

    private isJobRunning(job: WorkerJob, script: string): boolean 
    {
        return this.context.ns.ps(job.hostname).some(process =>
            process.filename === script &&
            process.threads === job.threads &&
            String(process.args[0] ?? "") === job.target
        );
    }

    private stopObsoleteProcesses(worker: ServerInfo, desiredJobs: Set<string>): void 
    {
        for (const process of this.context.ns.ps(worker.hostname)) {
            const target = String(process.args[0] ?? "");
            const jobKey = this.createJobKey(worker.hostname, process.filename, target, process.threads);

            if (!desiredJobs.has(jobKey)) {
                this.context.ns.kill(process.pid);
            }
        }
    }
}