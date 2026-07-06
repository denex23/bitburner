# Codex Notes

This file captures project context that should survive across Codex chats.

## Collaboration Style

- The user prefers pair programming and usually wants to write the code themselves unless they explicitly ask for implementation.
- Keep changes incremental and avoid large refactors unless a feature branch is explicitly intended for that work.
- When posting complete methods or classes with only small changes, mark changed lines with `// changed` or explain the changed lines separately.
- Prefer readable TypeScript with explicit function declarations for real logic. Arrow functions are fine for callbacks and small adapters.

## Architecture Boundaries

- `Controller` orchestrates only.
- `Scanner`, `Rooter`, `TargetSelector`, `Allocator`, `Deployer`, `DebugReporter`, `Table`, and `Context` should keep their responsibilities separate.
- Domain logic belongs in the component that owns it.
- `DebugReporter` prepares report data and formats Bitburner-specific values.
- `Table` only handles ASCII table layout and must stay Bitburner-agnostic.
- `Context` wraps the `NS` interface.

## Bitburner API Notes

- Cloud server APIs are under `ns.cloud`, for example:
  - `ns.cloud.getServerCost(ram)`
  - `ns.cloud.getServerUpgradeCost(host, ram)`
  - `ns.cloud.purchaseServer(hostname, ram)`
  - `ns.cloud.upgradeServer(host, ram)`
- Singularity requires Source-File 4 outside BitNode 4. Since `getOwnedSourceFiles()` is itself under `ns.singularity`, guard Singularity use with `try/catch`.
- `ns.share()` boosts faction rep gain while faction work is active. It does not consume all remaining RAM by itself; RAM usage is script RAM times thread count.
- Worker scripts are currently intended to run as `.js` files in Bitburner.

## Current Game Strategy

- Main strategic goal: reach hacking level 2500 and progress toward Daedalus / Red Pill / endgame.
- Share overflow RAM is useful while farming faction reputation.
- Corporation factions are important current targets. Useful order discussed:
  1. Fulcrum Secret Technologies
  2. ECorp
  3. MegaCorp
  4. Four Sigma
  5. KuaiGong International
  6. NWO
  7. OmniTek Incorporated
  8. Blade Industries
  9. Bachman & Associates
  10. Clarke Incorporated
- Fulcrum Secret Technologies is partly blocked by prerequisite augmentations. ECorp provides `PC Direct-Neural Interface`, which unlocks Fulcrum augmentations.

## Corp Server Backdoors

- ECorp: `ecorp`
- MegaCorp: `megacorp`
- Four Sigma: `4sigma`
- KuaiGong International: `kuai-gong`
- NWO: `nwo`
- OmniTek Incorporated: `omnitek`
- Blade Industries: `blade`
- Bachman & Associates: `b-and-a`
- Clarke Incorporated: `clarkinc`
- Fulcrum Technologies: `fulcrumtech`
- Fulcrum Secret Technologies: `fulcrumassets`

## Allocator V5

- Allocator distributes work by available RAM, not by a simple worker index.
- Multiple jobs per worker are allowed.
- Hack/Grow/Weaken thread counts are capped by estimated need.
- `allocatedRam` should be `threads * SCRIPT_RAM[action]`, not full worker RAM.
- Share jobs use remaining overflow RAM after normal work/farm allocation.
- Home should be allowed as a worker with reserved RAM, not excluded by hostname.
- Worker eligibility and available worker RAM should be shared between `Allocator` and `Deployer`, preferably via a deployment helper.

## Deployer Rules

- Deployer should not blindly `killall()` on each deploy.
- Deployer should only manage scripts listed in `SCRIPT_MAP`.
- Job identity should include hostname, script, target, and thread count.
- Non-worker scripts on `home`, such as controller, startup, stock trader, and log writers, must not be killed by deployer cleanup.

## Startup Script Ideas

- Startup should reserve about 16GB RAM on `home` for controller and utility scripts.
- It should start the controller and supporting scripts.
- It should buy TOR and programs only if missing and Singularity is available.
- It should buy or upgrade cloud servers via `ns.cloud`.
- It should backdoor useful faction/corporation servers when Singularity is available.

## DNet Crawler

- `src/core/dnet-crawler.ts` is experimental and intentionally still has unfinished per-model authentication solvers.
- A separate bootstrap script should run on `home`, then copy/start the crawler on the static DNet entrypoint `darkweb`.
- Crawler instances should run on DNet nodes and spread from there.
- Password reports should go through a port to one central home writer to avoid file write races.
- Log reports should also go through a port to one central home log writer.
- Password storage can be `Record<string, string>` serialized as JSON.
- Use blocking/reliable port writes for passwords. Debug logs may use lossy `tryWritePort()` once stable.

## DNet Solver Notes

- DeepGreen is a numeric Mastermind-style authentication model. Authentication attempts provide feedback.
- Factori-Os appears to use divisibility feedback.
- Some server models require clues from `heartbleed()` logs.
- Keep each `authenticate<ServerModel>Server()` solver small and model-specific.
