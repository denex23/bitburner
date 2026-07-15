# AGENTS.md

Aktueller Arbeitskontext für Codex in diesem privaten Bitburner-Projekt.

## Setup und Arbeitsumgebung

- Gespielt wird die **Steam-Version** von Bitburner.
- Dateien werden über **BitburnerGoFilesync** automatisch ins Spiel synchronisiert.
- Es gibt **keine lokale TypeScript-Laufzeit und keinen lokalen Typecheck**. Code wird
  erst im Spiel kompiliert und getestet.
- Worker-Quellcode liegt im Projekt als `.js` vor; die übrige Codebasis verwendet
  überwiegend `.ts` beziehungsweise `.tsx`.
- `../bitburner-src` enthält den geklonten Spiel-Quellcode. Für API-Verifikation
  ist insbesondere diese Datei maßgeblich:
  `../bitburner-src/src/ScriptEditor/NetscriptDefinitions.d.ts`.
- Vor einem Commit zumindest `git diff --check` ausführen. Die VS-Code-Option
  `files.trimTrailingWhitespace` ist aktiviert beziehungsweise erwünscht.

## Sprache und Codestil

- Kommunikation, Notizen und Projektdokumentation sind auf Deutsch.
- Code-Technisches bleibt konsequent Englisch: Namen, Kommentare und
  Dokumentationskommentare.
- Aussagekräftige Namen verwenden; keine ungebräuchlichen Abkürzungen oder
  Ein-Buchstaben-Namen außerhalb üblicher Zähler wie `i` und `j`.
- Klare Kontrollflüsse sind wichtiger als kompakte JavaScript-Schreibweisen.
- Echte Logik bevorzugt als explizite Methoden/Funktionen schreiben;
  Arrow-Functions nur für Callbacks und kleine Adapter.
- Geschweifte Klammern und Semikolons konsequent verwenden.
- Einfache Bedingungen bleiben einzeilig. Mehrzeilige boolesche Ausdrücke setzen
  `&&` beziehungsweise `||` an den Anfang der Folgezeilen.
- Zeilen nach semantischen Grenzen umbrechen, nicht starr nach kurzer Länge.
  Etwa 120 Zeichen sind in Ordnung, sofern die Zeile gut lesbar bleibt.
- Kommentare nur ergänzen, wenn sie echten Mehrwert liefern.

## Arbeitsweise

- Wir arbeiten im **Pair-Programming-Stil**.
- Wenn der Nutzer nichts anderes sagt, schreibt er den Code selbst. Codex liest,
  analysiert und liefert konkrete Vorschläge.
- **Keine Dateien ungefragt verändern.** Änderungen nur vornehmen, wenn der Nutzer
  sie ausdrücklich erlaubt. `AGENTS.md` darf auf ausdrücklichen Wunsch gepflegt
  werden.
- Änderungen inkrementell halten. Bestehenden Code erweitern statt ersetzen;
  keine unnötigen Refactorings und keine Enterprise-Architektur.
- Änderungen an bestehenden Dateien als GitHub-artige `diff`-Blöcke darstellen.
- Wenn eine ganze Methode gezeigt wird, obwohl nur wenige Zeilen geändert wurden,
  die tatsächlichen Änderungen klar kennzeichnen oder zusätzlich erklären.
- Der Nutzer verwendet Markdown bewusst. Code- und Textblöcke als exakten Inhalt
  inklusive Einrückung behandeln.
- Bei fehlendem lokalen Typecheck die echte API im Spiel-Quellcode prüfen und die
  verbleibende Verifikation im Spiel klar benennen.

## Architekturgrenzen

- `Controller` orchestriert ausschließlich den Ablauf.
- `Scanner` findet Server; `Rooter` beschafft Root-Zugriff.
- `TargetSelector` bewertet und klassifiziert Targets.
- `Allocator` plant vollständige Jobs und verteilt sie auf Worker-RAM.
- `BatchScheduler` besitzt Lebenszyklus, Schutz und Identität aktiver Batches.
- `Deployer` gleicht geplante und laufende Worker-Prozesse ab.
- `DebugReporter` bereitet Reportdaten auf und formatiert Bitburner-Werte.
- `Table` ist ausschließlich für ASCII-Tabellenlayout verantwortlich und kennt
  keine Bitburner-Logik.
- `Context` kapselt das `NS`-Interface und den Tick-bezogenen Cache.
- Das Dashboard berichtet und überwacht. Es enthält keine Batch- oder
  Allokationslogik. Spätere interaktive Konfiguration soll über eine eigene
  Konfigurationsgrenze laufen, nicht direkt in der View.
- Fachlogik gehört in die Komponente, die sie besitzt.

Wichtige Ordner unter `src/`: `core/`, `network/`, `targets/`, `deployment/`,
`models/`, `debug/`, `dashboard/`, `data/`, `utils/`, `workers/`, `singularity/`
und `tests/`.

## Aktueller Batch-Stand

- Das produktive System folgt weiterhin der bestehenden Architektur
  `Controller -> TargetSelector -> Allocator -> BatchScheduler -> Deployer`.
- Farm-Pläne sind atomare **HWGW-Batches**:
  `Hack -> Weaken 1 -> Grow -> Weaken 2`.
- W1 kompensiert bestehende Security-Abweichung plus Hack-Security. W2 kompensiert
  die Grow-Security.
- Farm- und Grow/Weaken-Pläne werden zunächst gegen geklonte Worker-Allokationen
  geplant. Nur vollständig platzierbare Pläne werden gemeinsam committed.
  Teil-Batches dürfen den Scheduler nicht erreichen.
- RAM wird in Prioritätsreihenfolge als Restbudget vergeben. Bei wenig RAM laufen
  wenige vollständige Batches statt vieler unvollständiger Target-Anteile.
- Jeder geschützte Nicht-Share-Plan erhält eine eindeutige `batchId` im Format
  `target:registeredAt:sequence`.
- `WorkerJob.batchId` ist optional, weil Share keinem Batch angehört. Für alle
  anderen Worker-Jobs ist sie vor dem Deploy verpflichtend.
- Prozessidentität im Deployer:
  Hostname + Script + Target + Threads + Delay + Batch-ID.
- Share verwendet übriges RAM und bleibt vom Batch-ID-System ausgenommen.
- Aktuelle Tuning-Werte:
  - `TARGET_HACK_RATIO = 0.25`
  - `MAX_HACK_THREADS_PER_TARGET = 48`
  - `MAX_ACTIVE_BATCHES_PER_TARGET = 4`
  - `BATCH_SPACING_MS = 300`
  - `FARM_RAM_RATIO = 0.7`
  - `PREP_RAM_RATIO = 0.3`
  - `SHARE_RAM_BUFFER = 32`
- Der Reporter unterscheidet:
  - `Batches`: eindeutige Batch-IDs,
  - `Operations`: eindeutige Kombinationen aus Batch-ID, Aktion und Delay,
  - `Processes`: physisch verteilte `WorkerJob`-Prozesse.
- Für einen vollständigen Farm-Bestand gilt die wichtige Invariante:
  `Operations = Batches * 4`.
- Der letzte BN4-Test lief etwa 20 bis 25 Minuten ohne Deploy-Fehler oder
  Farm-zu-Prep-Absturz. Beobachtet wurden ungefähr 96,5 % Money-Minimum
  (einmalig 93 %) und maximal +0,12 Security.
- Das Dashboard-Label `Attention` ist kein `TargetState`: Farm beginnt ab 90 %
  Money, Attention meldet Farm-Targets unter 95 % Money oder über +0,5 Security.
- **Nächster Entwicklungsschritt:** Pending Effects pro Target modellieren. Neue
  Pläne sollen noch nicht gelandete Hack/Grow/Weaken-Effekte berücksichtigen.
  Danach folgen genauere Landing-Timelines und schrittweise engeres JIT-Timing.
- Ziel bleibt ein stabiler **Multi-Target-JIT-Batcher**.

## Dashboard

- Das moderne Dashboard liegt in `src/dashboard/`:
  - `dashboard-store.ts` hält Snapshot-Historie und abgeleitete Metriken.
  - `dashboard.tsx` rendert Karten, Income-Chart und Target-Tabelle.
- React ist in Bitburner global verfügbar. Kein Import aus `@react` verwenden.
- `@ns` ist der spezielle Typ-Modulpfad des offiziellen Templates.
- Snapshots enthalten unter anderem Hacking-Einnahmen, geplantes RAM, laufendes
  Share-RAM und Jobs. Die Income-Historie umfasst derzeit 60 Sekunden.
- `src/utils/dashboard.ts` bleibt als altes ASCII-Dashboard erhalten.

## Deployer- und Worker-Konventionen

- Niemals blind `killall()` verwenden.
- Nur Scripts aus `SCRIPT_MAP` verwalten. Controller, Startup, Dashboard,
  Stock-Trader und Writer auf `home` dürfen nicht beendet werden.
- `allocatedRam` bedeutet `threads * SCRIPT_RAM[action]`, nicht gesamtes Host-RAM.
- Home darf Worker sein, aber nur oberhalb von `RESERVED_HOME_RAM`.
- `RESERVED_HOME_RAM = 128`; bei aktuell 128 GB Home-RAM stellt Home daher kein
  Worker-RAM bereit.
- Worker erhalten Target und Delay als Argumente; Nicht-Share-Worker zusätzlich
  die Batch-ID. Die Worker ignorieren die Batch-ID fachlich, sie macht die
  Prozessargumente eindeutig.
- Die Worker verwenden derzeit wieder den bewährten Sleep-vor-HGW-Ablauf.
  `additionalMsec` nicht ohne erneute gemeinsame Entscheidung einführen.

## Aktueller Spielstand

- BN1 und BN5 sind zerstört; Intelligence ist durch BN5 dauerhaft freigeschaltet.
- Aktueller Run: **BN4.1**. Ziel ist Source-File 4 und damit dauerhafter Zugriff
  auf die Singularity API.
- BN4.1 belastet Singularity-Aufrufe mit 16-fachen RAM-Kosten.
- Relevante BN4-Multiplikatoren im aktuellen Run:
  - Hacking-EXP: 40 %
  - Server-Max-Money: 11,25 %
  - Server-Startgeld: 75 %
  - gestohlener Hack-Anteil: 20 %
- TOR und alle darüber kaufbaren Programme wurden bereits gekauft; die dadurch
  erreichbaren NPC-Server werden vom Rooter erschlossen.
- Vorerst keine Cloud-Server: Das heterogene NPC-Netz dient bewusst als Test für
  Fragmentierung und atomare Allokation. Cloud-Kapazität später schrittweise
  ergänzen.

## Singularity-Prototyp

- `src/singularity/singularity.ts` ist eine kleine Fassade, die teure
  Singularity-Aufrufe in kurzlebige Worker auslagert.
- Die Script-Map ist ein Laufzeitwert mit `as const`; erlaubte Namen werden über
  `keyof typeof SINGULARITY_SCRIPT_MAP` abgeleitet.
- Der erste Worker ist `src/singularity/workers/installBackdoor.ts`.
- Der Prototyp bestätigt momentan nur, ob `ns.exec()` den Worker starten konnte.
  Eine Request-ID und echte Ergebnisrückgabe über Port oder Datei fehlen noch.
- Die Fassade darf `ns.singularity` nicht direkt referenzieren und die teuren
  Worker nicht importieren, sonst landen deren RAM-Kosten wieder im Aufrufer.

## Bitburner-API-Notizen

- Cloud-Server-APIs liegen in dieser Spielversion unter `ns.cloud`, insbesondere
  `getServerCost`, `getServerUpgradeCost`, `purchaseServer` und `upgradeServer`.
- Singularity braucht außerhalb von BN4 Source-File 4. Da selbst
  `getOwnedSourceFiles()` unter `ns.singularity` liegt, Verfügbarkeitsprüfungen
  gegebenenfalls mit `try/catch` absichern.
- `ns.share()` erhöht während Faction-Work den Reputation-Gewinn. RAM-Verbrauch ist
  Script-RAM mal Threadzahl; Share belegt nicht automatisch sämtliches RAM.

## DNet und Claude-Prototypen

- `src/core/dnet-crawler.ts` ist experimentell; mehrere modellbezogene
  Authentifizierungs-Solver sind noch unvollständig.
- Der Bootstrap läuft auf `home`, kopiert den Crawler zum statischen DNet-Einstieg
  `darkweb` und startet ihn dort.
- Passwort- und Log-Reports laufen über Ports zu zentralen Home-Writern, um
  Schreib-Races zu vermeiden. Passwortmeldungen verwenden zuverlässige,
  blockierende Port-Writes.
- Dateien mit `claude_`-Prefix bewahren den verworfenen alternativen
  Arbiter/Manager-Batcher nur als Referenz. Sie gehören nicht zur produktiven
  Architektur und dürfen nicht versehentlich integriert werden.

## Referenzen

- `CODEX_NOTES.md` enthält historische Architektur-, Augmentations-, Backdoor- und
  DNet-Notizen. Die ausführliche alte Augmentationsroute kann dort nachgeschlagen
  werden, ist aber nicht der aktuelle Run-Plan.
- `CLAUDE.md` ist ein älterer, weitgehend duplizierter Kontextstand und bei
  Widersprüchen gegenüber dieser Datei nachrangig.
- `../bitburner-src` ist die maßgebliche Quelle für die tatsächlich vorhandene
  Spiel-API und deren Typen.
