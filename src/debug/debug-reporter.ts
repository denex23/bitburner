import { Context } from "/src/models/context";
import { ServerInfo } from "/src/models/server-info";
import { TargetInfo } from "/src/models/target-info";
import { WorkerJob } from "/src/models/worker-job";

export class DebugReporter 
{
    constructor(private readonly context: Context) {}

    public report(servers: ServerInfo[], targets: TargetInfo[], jobs: WorkerJob[]): void
    {
        this.reportTargets(targets);
        this.reportJobs(jobs);
        this.reportRam(jobs);
        this.reportHack(jobs);
        this.reportActions(jobs);
        this.reportWorkers(servers);
        this.reportStaleWorkers(servers, jobs);
    }

    private reportTargets(targets: TargetInfo[]): void
    {
        
    }

    private reportJobs(jobs: WorkerJob[]): void
    {

    }

    private reportRam(jobs: WorkerJob[]): void
    {

    }

    private reportHack(jobs: WorkerJob[]): void
    {

    }

    private reportActions(jobs: WorkerJob[]): void
    {

    }

    private reportWorkers(servers: ServerInfo[]): void
    {

    }

    private reportStaleWorkers(servers: ServerInfo[], jobs: WorkerJob[]): void
    {

    }

    public oldStuf(servers: ServerInfo[], targets: TargetInfo[], jobs: WorkerJob[])
    {
        const ns = this.context.ns;
        for (const target of targets) {
            
      const moneyRatio = 0; //calculateMoneyRatio(target);
      const securityDelta = 0; //calculateSecurityDelta(target);

      ns.tprint(
        `[TARGET] ` +
        `${target.hostname} | ` +
        `state=${target.state} | ` +
        `score=${Math.round(target.score)} | ` +
        `prio=${Math.round(target.priority)} | ` +
        `money=${moneyRatio.toFixed(2)} | ` +
        `sec=${securityDelta.toFixed(2)}`
      );
    }

    
    ns.tprint("========== JOBS ==========");
    const workerDistribution = new Map<string, number>();
    for (const job of jobs) {
      workerDistribution.set(
        job.target,
        (workerDistribution.get(job.target) ?? 0) + 1
      );
    }
    for (const [target, count] of workerDistribution) {
      ns.tprint(`${target}: ${count}`);
    }

    ns.tprint("========== RAM ==========");
    const ramDistribution = new Map<string, number>();
    for (const job of jobs) {
      ramDistribution.set(
        job.target,
        (ramDistribution.get(job.target) ?? 0) + job.allocatedRam
      );
    }
    for (const [target, count] of ramDistribution) {
      ns.tprint(`${target}: ${count}`);
    }

    const hackRam = new Map<string, number>();
    const hackThreads = new Map<string, number>();

    for (const job of jobs) {
      if (job.action !== "hack") continue;

      hackRam.set(
        job.target,
        (hackRam.get(job.target) ?? 0) + job.allocatedRam
      );

      hackThreads.set(
        job.target,
        (hackThreads.get(job.target) ?? 0) + job.threads
      );
    }

    ns.tprint("======== HACK ========");

    for (const [target, ram] of hackRam) {
      const threads = hackThreads.get(target) ?? 0;

      ns.tprint(
        `${target}: ${threads} threads | ${ram} GB`
      );
    }

    const actions = new Map<string, number>();
    ns.tprint("======== ACTIONS ========");
    for (const job of jobs) {
      const key = `${job.target}:${job.action}`;
      actions.set(key, (actions.get(key) ?? 0) + 1);
    }

    for (const [key, count] of actions) {
      ns.tprint(`${key}: ${count}`);
    }

    ns.tprint("======== WORKERS ========");
    let runningProcesses = 0;
    for (const worker of servers) {
      if (worker.hostname === "home" || !worker.rooted) continue;
      const processes = ns.ps(worker.hostname);

      if (processes.length === 0) {
        ns.tprint(`${worker.hostname}: idle`);

        continue;
      }

      for (const process of processes) {
        ns.tprint(`${worker.hostname}: ` + `${process.filename} ` + `${process.args.join(",")}`);
      }
      runningProcesses += processes.length;
    }

    ns.tprint(`Running Processes: ${runningProcesses}`);

    ns.tprint(
      `Jobs=${jobs.length}`
    );

    const usedHosts = new Set(jobs.map(job => job.hostname));

    let staleWorkers = 0;

    for (const worker of servers) {
      if (worker.hostname === "home" || !worker.rooted) continue;

      if (!usedHosts.has(worker.hostname) && ns.ps(worker.hostname).length > 0) {
        ns.tprint(`[STALE] ${worker.hostname}`);
        staleWorkers++;
      }
    }

    ns.tprint(`Stale workers: ${staleWorkers}`);
    }
}