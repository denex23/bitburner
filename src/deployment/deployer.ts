import { Context } from 'src/models/context';
import { ServerInfo } from "src/models/server-info";
import { WorkerJob } from "src/models/worker-job";
import { SCRIPT_MAP, WorkerAction } from 'src/utils/constants';
import { isWorkerServer } from 'src/deployment/worker-helper';

type BatchWorkerJob = WorkerJob & {
    batchId: string;
};

export class Deployer
{
    private readonly workerScripts: Set<string>;

    constructor(private readonly context: Context)
    {
        this.workerScripts = new Set<string>(Object.values(SCRIPT_MAP));
    }

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
        const script = SCRIPT_MAP[job.action];

        if (false === this.isScriptAvailable(script)) {
            return;
        }

        if (WorkerAction.Share === job.action) {
            await this.deployShareJob(job, script);
            return;
        }

        if (false === this.hasBatchId(job)) {
            this.context.ns.tprint(
                `[INVALID JOB] Missing batchId: ${job.hostname} -> ${job.action} ${job.target}`
            );

            return;
        }

        if (this.isJobRunning(job, script)) {
            return;
        }

        await this.copyScript(script, job.hostname);
        this.freeRamForJob(job, script);
        this.executeJob(job, script);
    }

    private async deployShareJob(job: WorkerJob, script: string): Promise<void>
    {
        const currentThreads = this.context.ns.ps(job.hostname)
            .filter(process => this.isShareProcess(process.filename))
            .reduce((sum, process) => sum + process.threads, 0);

        if (currentThreads > 0) {
            const shareCapacityIsTooLow = currentThreads < job.threads * 0.9;
            if (false === shareCapacityIsTooLow) {
                return;
            }

            this.stopShareProcesses(job.hostname);
        }

        await this.copyScript(script, job.hostname);

        this.executeJob(job, script);
    }

    private isScriptAvailable(script: string): boolean
    {
        if (this.context.ns.fileExists(script, "home")) {
            return true;
        }

        this.context.ns.tprint(`[SCRIPT MISSING] ${script}`);

        return false;
    }

    private async copyScript(script: string, hostname: string): Promise<void>
    {
        await this.context.ns.scp(script, hostname);
    }

    private executeJob(job: WorkerJob, script: string): void
    {
        const ns = this.context.ns;
        const scriptArguments: (string | number)[] = [
            job.target,
            job.additionalMsec,
        ];

        if (WorkerAction.Share !== job.action) {
            if (this.hasBatchId(job)) {
                scriptArguments.push(job.batchId);
            } else {
                return;
            }
        }

        const processId = ns.exec(
            script,
            job.hostname,
            job.threads,
            ...scriptArguments,
        );

        if (processId !== 0) {
            return;
        }

        this.reportDeployFailure(job, script);
    }

    private getWorkers(servers: ServerInfo[]): ServerInfo[]
    {
        return servers.filter(server => isWorkerServer(server));
    }

    private createDesiredJobKeys(jobs: WorkerJob[]): Set<string>
    {
        const desiredJobKeys = new Set<string>();

        for (const job of jobs) {
            if (WorkerAction.Share === job.action || false === this.hasBatchId(job)) {
                continue;
            }

            desiredJobKeys.add(this.createJobKey(
                job.hostname,
                SCRIPT_MAP[job.action],
                job.target,
                job.threads,
                job.additionalMsec,
                job.batchId,
            ));
        }

        return desiredJobKeys;
    }

    private createJobKey(
        hostname: string,
        script: string,
        target: string,
        threads: number,
        additionalMsec: number,
        batchId: string,
    ): string
    {
        return `${hostname}|${script}|${target}|${threads}|${additionalMsec}|${batchId}`;
    }

    private isJobRunning(job: BatchWorkerJob, script: string): boolean
    {
        return this.context.ns.ps(job.hostname).some(process =>
            process.filename === script
            && process.threads === job.threads
            && String(process.args[0] ?? "") === job.target
            && Number(process.args[1] ?? 0) === job.additionalMsec
            && String(process.args[2] ?? "") === job.batchId
        );
    }

    private hasBatchId(job: WorkerJob): job is BatchWorkerJob
    {
        return undefined !== job.batchId && job.batchId.length > 0;
    }

    private stopObsoleteProcesses(worker: ServerInfo, desiredJobs: Set<string>): void
    {
        for (const process of this.context.ns.ps(worker.hostname)) {
            if (false === this.isWorkerScript(process.filename)) {
                continue;
            }

            if (this.isShareProcess(process.filename)) {
                continue;
            }

            const target = String(process.args[0]);
            const additionalMsec = Number(process.args[1]);
            const batchId = process.args[2];

            if ("string" !== typeof batchId || batchId.length <= 0) {
                this.context.ns.kill(process.pid);
                continue;
            }

            const jobKey = this.createJobKey(
                worker.hostname,
                process.filename,
                target,
                process.threads,
                additionalMsec,
                batchId,
            );

            if (false === desiredJobs.has(jobKey)) {
                this.context.ns.kill(process.pid);
            }
        }
    }

    private freeRamForJob(job: WorkerJob, script: string): void
    {
        const neededRam = job.threads * this.context.ns.getScriptRam(script);
        const freeRam = this.getFreeRam(job.hostname);

        if (freeRam >= neededRam) {
            return;
        }

        this.stopShareProcesses(job.hostname);
    }

    private stopShareProcesses(host: string): void
    {
        this.context.ns.scriptKill(SCRIPT_MAP[WorkerAction.Share], host);
    }

    private getFreeRam(hostname: string): number
    {
        return this.context.ns.getServerMaxRam(hostname)
            - this.context.ns.getServerUsedRam(hostname);
    }

    private isShareProcess(script: string): boolean
    {
        return SCRIPT_MAP[WorkerAction.Share] === script;
    }

    private isWorkerScript(script: string): boolean
    {
        return this.workerScripts.has(script);
    }

    private reportDeployFailure(job: WorkerJob, script: string): void
    {
        const ns = this.context.ns;

        ns.tprint(
            `[DEPLOY FAILED] ${job.hostname} -> ${script} ${job.target} ` +
            `threads=${job.threads} ` +
            `fileHome=${ns.fileExists(script, "home")} ` +
            `fileWorker=${ns.fileExists(script, job.hostname)} ` +
            `scriptRam=${ns.getScriptRam(script)} ` +
            `workerRam=${ns.getServerMaxRam(job.hostname)} ` +
            `needed=${job.threads * ns.getScriptRam(script)}` +
            `freeRam=${this.getFreeRam(job.hostname)} `
        );
    }
}
