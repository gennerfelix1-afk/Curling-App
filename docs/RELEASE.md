# Veröffentlichung: Stand und Checkliste

Was im Code erledigt ist, und was nur du erledigen kannst (Konten, Geld, Rechtliches, Tests auf echten Geräten).

## Im Spiel erledigt

- Startbildschirm, Einstellungen (werden auf dem Gerät gespeichert), Anleitung, Tipps beim ersten Spielen,
  Pause (auch automatisch, wenn die App in den Hintergrund geht), Endbildschirm mit Ergebnis und Bestwerten
- Deutsch und Englisch (automatisch nach Gerätesprache, umschaltbar)
- Gegen die KI (4 Stufen), 2 Spieler, 3 Trainingsmodi, Replays
- 3D-Halle, Spielerfiguren, Ton, Vibration, Effekte – alles im Code erzeugt, keine fremden Assets → keine
  Lizenzfragen bei Grafik und Ton
- Installierbar als Web-App (PWA), läuft offline
- Keine Datenerhebung: Datenschutzerklärung als Vorlage unter `public/privacy.html`
  (veröffentlicht unter `…/Curling-App/privacy.html`)

## Was du entscheiden oder erledigen musst

### 1. Auf echten Geräten testen (wichtigster Punkt)
- [ ] Ein günstiges Android-Handy und ein iPhone: läuft die 3D-Ansicht flüssig? (Sonst senkt das Spiel automatisch die
      Qualität; mit `?quality=high` lässt sich volle Qualität erzwingen.)
- [ ] Gefühl der Abgabe (Tempo der Kraft-Skala: `EXECUTION.chargeTime` in `src/physics/config.ts`) und des Wischens
- [ ] Eine komplette Partie gegen die KI auf dem Handy durchspielen
- [ ] Ton und Sprachausgabe der Skip-Rufe anhören

### 2. Name und Marke
- [ ] Endgültiger Name (derzeit „Curling“ – als Store-Name zu allgemein und vermutlich vergeben).
      Vor der Wahl im App Store, im Play Store und beim Markenamt (DPMA/EUIPO) nach dem Namen suchen.
- [ ] Logo/Icon: derzeit ein einfaches House-Symbol (`public/icon.svg`, `icon-192.png`, `icon-512.png`).

### 3. Rechtliches
- [ ] Datenschutzerklärung `public/privacy.html` mit Name, Anschrift, E-Mail und Datum vervollständigen
- [ ] Impressum, falls du in Deutschland gewerblich verkaufst
- [ ] Bei Verkauf: Gewerbe/Steuer klären

### 4. Wie verkaufen? (Entscheidung)
| Weg | Aufwand | Kosten | Bemerkung |
|---|---|---|---|
| Web-App (wie jetzt) | erledigt | 0 € | Nicht im Store auffindbar, Bezahlung nur über eigene Lösung |
| Google Play | mittel | 25 $ einmalig | Verpacken mit Capacitor; Android-Studio-Build auf deinem Rechner |
| Apple App Store | hoch | 99 $ pro Jahr | Verpacken mit Capacitor; Build nur auf einem Mac mit Xcode möglich |

Preismodell: Einmalkauf (z. B. 2,99 €) ist am einfachsten. Kostenlos mit Werbung würde Tracking und eine andere
Datenschutzerklärung bedeuten.

### 5. Store-Eintrag
- [ ] Screenshots (Handy hochkant, mindestens 4): Startbildschirm, Abgabe, Wischen in der Halle, Wertung mit Messung
- [ ] Texte: Vorlage unten
- [ ] Altersfreigabe: Fragebogen im Store ausfüllen (keine Gewalt, keine Käufe, keine Daten → niedrigste Stufe)

## Store-Text (Vorlage)

**Kurzbeschreibung (80 Zeichen):**
Echtes Curling mit realistischer Stein-Physik, Wischen und Taktik gegen die KI.

**Beschreibung:**
Curling, wie es sich wirklich spielt. Jeder Stein folgt einer Physik, die an echten Messwerten kalibriert ist: Er
curlt spät, Takeouts laufen gerader, und Wischen trägt ihn weiter und hält ihn auf der Linie.

• Abgabe wie auf dem Eis: Kraft aufbauen, abstoßen, die Linie halten, loslassen
• Wischen mit dem Finger – je schneller du reibst, desto härter
• Der Skip ruft: „HARD!“, „Off!“, „Line!“
• Komplette Regeln: Free Guard Zone, No-Tick, Hammer, Last Stone Draw, Messung
• KI-Gegner in vier Stärken, die mit echter Physik plant
• 2 Spieler an einem Gerät
• Training: Draw-Challenge, Takeout-Challenge, Eis lesen
• Replays mit Zeitlupe
• Keine Werbung, keine Daten, läuft offline

**Keywords:** curling, winter, sport, eis, stein, olympia, taktik, physik, wischen

## Technisch für die Store-Versionen (wenn du dich dafür entscheidest)

Das Spiel wird mit [Capacitor](https://capacitorjs.com) als App verpackt. Das kann ich vorbereiten; die eigentlichen
Builds und das Signieren laufen auf deinem Rechner (Android Studio bzw. Xcode auf einem Mac), weil dafür deine
Entwickler-Konten und Signaturschlüssel nötig sind. In der App würde dann auch die Vibration auf dem iPhone
funktionieren.
