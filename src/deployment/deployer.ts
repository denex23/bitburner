import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { WorkerJob } from "src/models/worker-job";
import { SCRIPT_MAP, WorkerAction } from 'src/utils/constants';
import { isWorkerServer } from 'src/deployment/worker-helper';

export class Deployer 
{
    constructor(private readonly context: Context) {}

    public async deploy(servers: ServerInfo[], jobs: WorkerJob[], protectedJobs: WorkerJob[] = jobs): Promise<void>
    {
        const desiredJobs = this.createDesiredJobKeys(protectedJobs);
        const workers = this.getWorkers(servers);

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

        if (WorkerAction.Share === job.action) {
            await this.deployShareJob(job, script);
            return;
        }

        if (this.isJobRunning(job, script)) {
            return;
        }

        await ns.scp(script, job.hostname);
        this.freeRamForJob(job, script);
        this.execJob(job, script);
    }

    private execJob(job: WorkerJob, script: string): void
    {
        const ns = this.context.ns;

        const pid = ns.exec(
            script,
            job.hostname,
            job.threads,
            job.target,
            job.delayMs ?? 0,
        );

        if (pid !== 0) {
            return;
        }

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

    private async deployShareJob(job: WorkerJob, script: string): Promise<void>
    {
        if (this.hasShareProcess(job.hostname)) {
            return;
        }

        await this.context.ns.scp(script, job.hostname);

        this.execJob(job, script);
    }

    private getWorkers(servers: ServerInfo[]): ServerInfo[] 
    {
        return servers.filter(server => isWorkerServer(server));
    }

    private createDesiredJobKeys(jobs: WorkerJob[]): Set<string> 
    {
        return new Set(jobs.map(job =>
            this.createJobKey(job.hostname, SCRIPT_MAP[job.action], job.target, job.threads, job.delayMs ?? 0)
        ));
    }

    private createJobKey(hostname: string, script: string, target: string, threads: number, delayMs: number = 0): string 
    {
        return `${hostname}|${script}|${target}|${threads}|${delayMs}`;
    }

    private isJobRunning(job: WorkerJob, script: string): boolean 
    {
        return this.context.ns.ps(job.hostname).some(process =>
            process.filename === script &&
            process.threads === job.threads &&
            String(process.args[0] ?? "") === job.target &&
            Number(process.args[1] ?? 0) === (job.delayMs ?? 0)
        );
    }

    private stopObsoleteProcesses(worker: ServerInfo, desiredJobs: Set<string>): void 
    {
        for (const process of this.context.ns.ps(worker.hostname)) {
            if (!this.isWorkerScript(process.filename)) {
                continue;
            }

            if (this.isShareProcess(process.filename)) {
                continue;
            }
            
            const target = String(process.args[0] ?? "");
            const delayMs = Number(process.args[1] ?? 0);
            const jobKey = this.createJobKey(worker.hostname, process.filename, target, process.threads, delayMs);

            if (!desiredJobs.has(jobKey)) {
                this.context.ns.kill(process.pid);
            }
        }
    }

    private hasShareProcess(hostname: string): boolean
    {
        return this.context.ns.ps(hostname).some(process =>
            this.isShareProcess(process.filename)
        );
    }

    private freeRamForJob(job: WorkerJob, script: string): void
    {
        const neededRam = job.threads * this.context.ns.getScriptRam(script);
        const freeRam = this.context.ns.getServerMaxRam(job.hostname)
            - this.context.ns.getServerUsedRam(job.hostname);

        if (freeRam >= neededRam) {
            return;
        }

        this.stopShareProcesses(job.hostname);
    }

    private stopShareProcesses(host: string): void 
    {
        this.context.ns.scriptKill(SCRIPT_MAP[WorkerAction.Share], host);
    }

    private isShareProcess(script: string): boolean
    {
        return SCRIPT_MAP.share === script;
    }

    private isWorkerScript(script: string): boolean
    {
        return Object.values(SCRIPT_MAP).includes(script);
    }
}
