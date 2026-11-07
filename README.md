# WizX Client – Minecraft Launcher

Desktop-Launcher für Windows 10/11 (Electron + TypeScript).

## Funktionen
- Microsoft-Login (OAuth 2.0 mit PKCE, Anmeldung im Browser, Tokens per Windows-Verschlüsselung gespeichert)
- Minecraft-Versionen (Release und Snapshots) aus den offiziellen Mojang-Metadaten
- Fabric, Forge, NeoForge, Quilt und Vanilla
- Mehrere Instanzen mit eigenem Spielordner
- Mods, Resource Packs und Shader über Modrinth suchen, installieren (inkl. benötigter Abhängigkeiten), aktivieren/deaktivieren, löschen
- RAM-, Java- und JVM-Einstellungen; passende Java-Version wird automatisch geladen (Adoptium)
- Spielername und Skin im Profil
- Launcher-Updates über GitHub Releases (`electron-updater`)
- Keine Offline- oder Cracked-Accounts: Gestartet wird nur mit einem Konto, das Minecraft Java besitzt

## 1. Microsoft-Client-ID einrichten (einmalig, Pflicht für den Login)
Eigene Launcher brauchen eine eigene Azure-App, die Mojang freigeben muss.

1. Auf [portal.azure.com](https://portal.azure.com) unter *App-Registrierungen* eine neue App anlegen.
   Der Name darf nicht Mojang, Minecraft, Microsoft, Live, Xbox, Discord oder Hypixel enthalten.
   Kontotyp: *Nur persönliche Microsoft-Konten*.
2. Unter *Authentifizierung* eine Plattform *Mobil- und Desktopanwendungen* mit der Redirect-URI `http://localhost` hinzufügen.
3. Unter *Authentifizierung > Erweiterte Einstellungen* **Öffentliche Clientflows zulassen = Ja** setzen.
4. Application-(Client)-ID und Directory-(Tenant)-ID kopieren und das Freigabeformular von Mojang einreichen: <https://aka.ms/mce-reviewappid>.
   Die Prüfung dauert laut Anleitung etwa eine Woche. Bis zur Freigabe lehnt Minecraft den Login ab.
5. Client-ID im Launcher unter *Einstellungen > Microsoft* eintragen oder die Umgebungsvariable `WIZX_MS_CLIENT_ID` setzen.

## 2. Bauen und starten
Voraussetzungen: Node.js 20 oder neuer.

```
npm install
npm start          # baut und startet den Launcher
npm run typecheck  # nur Typen prüfen
npm run dist       # Windows-Installer in release/
```

## 3. Launcher-Updates
In `package.json` unter `build.publish` den GitHub-Namen (`owner`) eintragen.
`npm run dist` erzeugt den Installer samt `latest.yml`; beides als GitHub-Release hochladen.
Ab dann prüft der installierte Launcher beim Start selbst auf Updates (nur im installierten Zustand, nicht mit `npm start`).

## Dateien und Daten
Alle Daten liegen unter `%APPDATA%\wizx-launcher`: gemeinsame Minecraft-Dateien, Instanzen, Java-Laufzeiten, Einstellungen.

## Stand
Die Oberfläche wurde in Chromium mit Testdaten geprüft, der Code typgeprüft. Das Zusammenspiel mit echten Servern
(Microsoft-Login, Minecraft-Start, Forge/NeoForge-Installer, Modrinth-Downloads) konnte ohne Netzwerkzugriff nicht getestet werden.
Rechne bei den ersten Starts mit kleineren Fehlern, besonders bei Forge und NeoForge.
