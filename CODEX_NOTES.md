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

## Augmentation Route For The Next Reset

Goal: minimize duplicate faction reputation work while acquiring hacking and reputation multipliers early.

Recommended city route: choose the eastern cities instead of Sector-12/Aevum.

1. `Tian Di Hui`
   - Get `Social Negotiation Assistant (S.N.A)` and `ADR-V1 Pheromone Gene` first.
   - These improve later faction/company reputation gains.
   - `Speech Processor Implant` and `Nuoptimal Nootropic Injector Implant` are useful when corporation work becomes relevant.
2. `CyberSec`, but only to about 2,000 reputation
   - Buy `Neurotrainer I` and `Synaptic Enhancement Implant`.
   - Stop there: NiteSec supplies the remaining useful CyberSec augmentations.
   - This cheaply replaces what would otherwise be taken from Aevum.
3. `NiteSec`
   - Main early hacking faction.
   - Covers `BitWire`, Cranial Signal Processors Gen I-III, `Neurotrainer II`, `Embedded Netburner Module`, `Neural-Retention Enhancement`, `CRTX42-AA`, and `Artificial Synaptic Potentiation`.
   - This makes additional early farming at CyberSec largely redundant.
4. `Chongqing`
   - Primary target: `Neuregen Gene Modification` at 37,500 reputation (`+40% Hacking Exp`).
   - This unique, strong bonus justifies the eastern city route by itself.
   - `DataJack` can be collected here later if it was not already bought from NiteSec.
5. `Four Sigma`
   - Prefer before NWO in a fresh reset when both still require company work.
   - Get `Neurotrainer III`, then `ADR-V2 Pheromone Gene`.
   - `ADR-V2` improves both faction and company reputation by 20%, accelerating NWO and later corporations.
   - `FocusWire` is secondary; postpone it if 75,000 reputation is expensive for only modest hacking experience/company benefits.
6. `NWO`
   - Get `Power Recirculation Core`; skip duplicate `Neurotrainer III` if already bought from Four Sigma.
   - Later, NWO is a strong single source for much of the Embedded Netburner Module upgrade chain.
7. `The Black Hand`
   - Most low-reputation hacking augmentations overlap with NiteSec.
   - Farm only when `The Black Hand`, `Enhanced Myelin Sheathing`, Cranial Signal Processors Gen IV, or another still-unowned higher tier augmentation justifies it.
8. `BitRunners`
   - Main late hacking faction and preferred source for the remaining Cranial Signal Processor chain and other high-tier hacking augmentations.
9. `ECorp`, then `Fulcrum Secret Technologies`
   - Use ECorp to obtain `PC Direct-Neural Interface`, which unlocks prerequisite-gated Fulcrum augmentations.
   - Do not grind Fulcrum early when its useful purchases are still blocked.

Usually skip or postpone:

- `Aevum`: its relevant early hacking augmentations are covered by CyberSec plus NiteSec; choosing Chongqing gives the much stronger `Neuregen`.
- `CyberSec` beyond 2,000 reputation: almost entirely duplicated by NiteSec.
- `The Syndicate` and `The Dark Army`: useful augmentations exist, but 200 combat stats make them inefficient for an early hacking-focused reset.
- `Bachman & Associates` and `Clarke Incorporated`: mostly overlap with Four Sigma for `ADR-V2` and `FocusWire`.
- `MegaCorp`, `ECorp`, `Fulcrum`, and `Blade Industries` at low reputation: `Embedded Netburner Module` is already available from NiteSec.
- Small 5% bonuses should wait until hacking level and reputation gain make them cheap.

Current-run exception: Chongqing, The Syndicate, and The Dark Army are unavailable or inefficient. Continue with `NWO -> Four Sigma`.

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
