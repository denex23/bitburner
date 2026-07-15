# AGENTS.md

Kontext für Codex in diesem Bitburner-Projekt.

## Setup & Arbeitsumgebung

- **Steam-Version** von Bitburner (nicht die Browser-Version).
- Scripte werden automatisch über **BitburnerGoFilesync** ins Spiel synchronisiert.
- **Keine lokale TypeScript-Umgebung** — Code kann erst *im Spiel* ausgeführt und
  getestet werden. Nicht mit lokalem Build / Typecheck / Run rechnen.
- Worker-Scripte laufen im Spiel als `.js` (siehe `SCRIPT_MAP`), die restliche
  Codebasis ist `.ts`.
- **`../bitburner-src`** (parallel zu diesem Ordner, im Kontext geöffnet) enthält
  den geklonten **Spiel-Quellcode**. Maßgeblich für API-Verifikation, da kein
  lokaler Typecheck existiert:
  `../bitburner-src/src/ScriptEditor/NetscriptDefinitions.d.ts` = die `NS`-Typen.

## Sprache

- **Kommunikation, Notizen, README, dieses Dokument: Deutsch.**
- **Alles Code-Technische (Kommentare, Doku-Kommentare, Variablen-, Funktions-,
  Klassennamen) konsequent Englisch** und aussagekräftig — sprechender Code.

## Arbeitsweise (wichtig!)

- **Pair-Programming-Stil**: Codex macht Code-*Vorschläge*, wir besprechen
  Änderungen, *bevor* etwas umgesetzt wird.
- **Keine Dateien ungefragt umschreiben.** Der Nutzer kopiert Code lieber selbst
  ins Projekt, um ihn einmal „in der Hand gehabt" zu haben — sonst geht der Spaß
  am Spiel verloren. Also: Vorschläge präsentieren, nicht eigenmächtig editieren.
- Änderungen inkrementell halten, große Refactorings nur auf explizit dafür
  gedachten Feature-Branches.
- **Änderungen an bestehendem Code als ` ```diff `-Block darstellen** (GitHub-Stil,
  `+`/`-`, rot/grün). Kein `// changed` nötig.
- **Der Nutzer formatiert seine Prompts mit Markdown** (Code-Blöcke, Inline-Code für
  Variablen/Funktionen/Dateinamen, Diff-Blöcke, Tabellen). Entsprechend lesen und
  ernst nehmen — z.B. Code-Blöcke als exakten Code/Log inkl. Einrückung behandeln.
- Lesbares TypeScript mit expliziten Funktionsdeklarationen für echte Logik;
  Arrow-Functions für Callbacks und kleine Adapter.

## Architektur-Grenzen

- `Controller` orchestriert nur.
- `Scanner`, `Rooter`, `TargetSelector`, `Allocator`, `Deployer`,
  `DebugReporter`, `Table` und `Context` halten ihre Verantwortlichkeiten getrennt.
- Domänenlogik gehört in die Komponente, die sie besitzt.
- `DebugReporter` bereitet Reportdaten auf und formatiert Bitburner-spezifische Werte.
- `Table` macht nur ASCII-Tabellen-Layout und bleibt Bitburner-agnostisch.
- `Context` kapselt das `NS`-Interface.

Ordnerstruktur (`src/`): `core/`, `network/`, `targets/`, `deployment/`,
`models/`, `debug/`, `data/`, `utils/`, `workers/` (.js), `tests/`.

## Bitburner-API-Notizen

- Cloud-Server-APIs unter `ns.cloud`: `getServerCost`, `getServerUpgradeCost`,
  `purchaseServer`, `upgradeServer`.
- Singularity braucht Source-File 4 außerhalb von BitNode 4. Da
  `getOwnedSourceFiles()` selbst unter `ns.singularity` liegt: Singularity-Nutzung
  mit `try/catch` absichern.
- `ns.share()` boostet Faction-Rep-Gain während Faction-Work; verbraucht nicht
  automatisch das gesamte RAM (RAM = Script-RAM × Threads).

## Kern-Konventionen (aus constants.ts)

- Reservierter Home-RAM: `RESERVED_HOME_RAM = 128`.
- `allocatedRam` = `threads * SCRIPT_RAM[action]`, nicht volles Worker-RAM.
- Home darf Worker sein (mit reserviertem RAM), nicht per Hostname ausschließen.
- Deployer: nicht blind `killall()`; nur Scripte aus `SCRIPT_MAP` verwalten;
  Nicht-Worker-Scripte auf `home` (Controller, Startup, Stock-Trader, Log-Writer)
  nie killen. Job-Identität = Hostname + Script + Target + Thread-Count.

## Spielstrategie & Fortschritt

- **BN1 ist bereits zerstört.**
- **Aktueller Run: BitNode 5** — bewusst gewählt, um die persistente Eigenschaft
  **Intelligence** so früh wie möglich freizuschalten und früh zu steigern.
- **Nächstes Ziel nach diesem Run: BitNode 4** — für Zugang zur **Singularity API**,
  um die Workflows weiter zu automatisieren.
- Corp-Factions / Augmentation-Route: Details in `CODEX_NOTES.md`. Achtung: Teile
  der dortigen Strategie-Notizen sind veraltet (auf BN1/altes Ziel bezogen) —
  im Zweifel diese AGENTS.md priorisieren.

## DNet (experimentell)

- `src/core/dnet-crawler.ts` ist experimentell (unfertige Auth-Solver pro Modell).
- Bootstrap läuft auf `home`, kopiert/startet Crawler auf DNet-Entrypoint `darkweb`,
  Crawler verbreiten sich von dort.
- Passwort- und Log-Reports laufen über Ports an je einen zentralen Home-Writer
  (verhindert Schreib-Races). Passwörter: blockierende Port-Writes.

## Referenz

- `CODEX_NOTES.md` — historische Notizen (Architektur, Aug-Route, Backdoor-Namen,
  DNet-Solver). Strategie-Teile teils veraltet, siehe oben.
- `../bitburner-src` — echter Spiel-Quellcode & `NS`-Typdefinitionen.
