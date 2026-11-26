# opencode-neuron-model-variants

Eigenständiges Begleitplugin für **OpenCode V2** und
[`@noser-engineering/opencode-plugin-neuron`](https://www.npmjs.com/package/@noser-engineering/opencode-plugin-neuron).
Neuron registriert die Provider und entdeckt die Modelle. Dieses Plugin ersetzt bei ausgewählten Modellen den
Anzeigenamen und die Reasoning-Varianten. Authentifizierung, Provider-Einstellungen und Modellauswahl bleiben bei Neuron bzw. OpenCode.

## Einrichten

Getestet mit OpenCode **2.4.2** und Neuron **0.9.1**. Falls dein LiteLLM-Proxy einen API-Key verlangt, richte ihn wie
in der Neuron-Dokumentation beschrieben ein; der Key gehört nicht in die Optionen des Begleitplugins.
Beide Plugins in `opencode.json(c)` eintragen bzw. eine vorhandene Neuron-Konfiguration um den zweiten Eintrag ergänzen.
OpenCode installiert das Begleitplugin direkt aus dem GitHub-Repository; ein lokaler Checkout ist nicht nötig:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "@noser-engineering/opencode-plugin-neuron@0.9.1",
      "options": {
        "profiles": [
          { "id": "personal", "name": "Personal", "baseURL": "https://litellm.example.com/v1" }
        ]
      }
    },
    {
      "package": "github:tobias-at-noser/opencode-neuron-model-variants#main",
      "options": {
        "profiles": [{ "id": "personal", "name": "Personal" }],
        "models": {
          "mein-modell": { "name": "Mein Modell", "variants": ["low", "high"] }
        }
      }
    }
  ]
}
```

- **`profiles`**: Provider-ID und Anzeigename müssen exakt zum jeweiligen Neuron-Profil passen. Ohne die Option gilt
  `personal` / `Personal`. Bei anderen Profilen die Paare explizit angeben: Die V2-Plugin-API stellt die Optionen
  anderer Plugins nicht bereit.
- **`models`**: Schlüssel sind die exakten von Neuron entdeckten Modell-IDs, ohne Providerpräfix. Die Beispiel-ID und
  Effort-Werte oben durch die vom eigenen Proxy unterstützten Werte ersetzen. Der im ursprünglichen Plugin importierte
  Katalog war nicht Teil der Vorlage; daher wird kein Standardkatalog ausgeliefert. Ohne `models` ändert das Plugin nichts.
- Der Anzeigename wird zu `<Profilname> <Modellname>`. Vorhandene Varianten des Modells werden durch die konfigurierte
  Liste ersetzt. Jede Variante setzt `settings.reasoningEffort` auf ihren Namen, z. B. `personal/mein-modell#high`.

Das Plugin verwendet einen V2-Modelltransform. Er läuft nach der Provider-Discovery und wird bei einer Aktualisierung
der Modellliste erneut angewendet, unabhängig von der Ladereihenfolge der beiden Plugins.

## Entwickeln

```sh
npm ci
npm test
npm pack --dry-run
```

## Versionierung und Releases

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) steuern die Version:
`fix:` für Patch, `feat:` für Minor und `!` oder `BREAKING CHANGE:` für Major.
`0.1.0` ist die Ausgangsversion, kein bereits veröffentlichter Tag. Ein erster `feat:`-Commit
führt damit zu `v0.2.0`.

1. Nach einem Push mit release-relevanten Commits auf den Standardbranch erstellt oder aktualisiert Release Please den Release-PR mit
   `package.json`, `package-lock.json`, dem Release-Manifest und `CHANGELOG.md`.
2. Nach dem Merge des Release-PRs erstellt der Workflow den Git-Tag `v<version>` auf dem Merge-Commit
   und das GitHub Release mit den Notizen aus dem gemergten Changelog.

Voraussetzung: Unter **Settings → Actions → General → Workflow permissions** muss
**Allow GitHub Actions to create and approve pull requests** aktiviert sein. Der Workflow verwendet
das eingebaute `GITHUB_TOKEN` und veröffentlicht nicht auf npm.
