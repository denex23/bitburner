# Bitburner

Vor ein paar Tagen habe ich mit Bitburner auf Steam angefangen. Eigentlich wollte ich nur ein paar kleine Skripte schreiben, um das Spiel etwas zu automatisieren.

Tja... das ist dann ein kleines bisschen eskaliert. 😄

Mittlerweile ist daraus ein größeres TypeScript-Projekt geworden, das deutlich mehr Zeit mit Architektur, Refactoring und Optimierung verbringt als ursprünglich geplant. Eigentlich spiele ich inzwischen "Softwareentwicklung mit Bitburner".

## Was ist Bitburner?

Bitburner ist ein Programmier- und Automatisierungsspiel, bei dem man durch selbst geschriebene Skripte Server hackt, Geld verdient und seine Infrastruktur immer weiter ausbaut.

- 🌐 Offizielle Webseite: https://bitburner-official.github.io/
- 🎮 Steam: https://store.steampowered.com/app/1812820/Bitburner/

Falls man Programmieren und Optimieren mag, macht das überraschend viel Spaß.

## Das Projekt

Der Code entwickelt sich parallel zu meinem Spielfortschritt ständig weiter. Aktuell gibt es unter anderem:

- Netzwerkscanner
- automatisches Rooten neuer Server
- Bewertung und Auswahl von Targets
- Worker- und RAM-Verteilung
- Deployment-System
- Debug- und Reporting-Tools (aktuell im Feature Branch in Arbeit - da wird auch der Controller aufgeräumt 😅)

Vermutlich wird sich die Architektur noch einige Male ändern, je weiter das Spiel fortschreitet.

## TypeScript

Beruflich komme ich hauptsächlich aus der PHP- und Java-Ecke. Das Projekt nutze ich deshalb gleichzeitig, um mich etwas intensiver mit TypeScript auseinanderzusetzen.

Wer sich den Code anschaut, wird das vermutlich auch an der einen oder anderen Stelle erkennen. 😅

## ChatGPT

Nein, nicht Claude 🤯 Eigentlich hatte ich intial nur eine Frage hinsichtlich der Idle Time um Reputation bei Fraktionen zu farmen (erklärt sich während des Spiels) aber mittlerweile hat sich das zu einem regen Austausch entwickelt.

Vor allem hinsichtlich Themen wie:

- TypeScript-Sprachfeatures
- Aufräumen/Refactoring
- Code Reviews
- Diskussionen über verschiedene Lösungsansätze

---

Falls jemand über das Repository stolpert: Viel Spaß beim Stöbern. Verbesserungsvorschläge oder interessante Ideen sind natürlich jederzeit willkommen.
Das Repository ist kein fertiges Framework, sondern WIP und dokumentiert meinen Entwicklungsprozess während des Spiels.
