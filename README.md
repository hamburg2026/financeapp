# ⚽ DFB-Pokal Würfelspiel

Ein interaktives Würfelspiel für den DFB-Pokal mit 64 Teams und realistischen Paarungen.

## Regeln

### Teams (64 insgesamt)
- **Profi-Topf (32 Teams)**
  - 18 Bundesliga Teams + 14 beste Teams der 2. Bundesliga
  
- **Amateur-Topf (32 Teams)**
  - 4 letzte Teams der 2. Bundesliga
  - 5 beste Teams der 3. Bundesliga
  - 23 Teams aus regionalen Ligen

### Spielmodus

**Runde 1:**
- Amateur vs Profi Paarungen
- Amateure haben Heimrecht

**Ab Runde 2:**
- Nur noch 3. Liga oder tiefer im Amateur-Topf
- Fortgeschrittene Profis
- Zufällige Heimrechtverteilung

### Würfelmechanik

Jedes Team erhält eine maximale Würfelzahl basierend auf seiner Liga:

- **Top 6 Bundesliga**: 0-6
- **Rest Bundesliga**: 0-5
- **2. Bundesliga**: 0-4
- **3. Bundesliga**: 0-3
- **Darunter**: 0-2

**Spielablauf:**
1. Beide Teams würfeln
2. Höchste Zahl gewinnt
3. Bei Gleichstand → Verlängerung (3 Bonuspunkte möglich)
4. Immer noch Gleichstand → Elfmeterschießen (3 Elfmeter pro Team)

## Features

- 📊 **Setup**: Vollständige Team-Übersicht
- 🎲 **Würfeln**: Interaktive Match-Spiele
- 📈 **Ergebnisse**: Detaillierte Match-Historie
- 📋 **Statistiken**: Turnierverlauf und Analysen

## Verwendung

```bash
# In einem Verzeichnis öffnen
open index.html
# oder
python -m http.server 8000
# dann http://localhost:8000 aufrufen
```

## Struktur

```
DFBPokal/
├── index.html          # Hauptseite
├── styles.css          # Styling
├── app.js              # Hauptlogik & UI
├── teams.js            # Team-Definitionen
├── tournament.js       # Turnier-Logik
├── dice.js            # Würfel-Mechanik
└── README.md          # Diese Datei
```

## Spieleigenschaften

✨ **Realistische Matchups:** Amateur vs Profi in Runde 1  
✨ **Faire Chancen:** Würfelsystem bevorzugt bessere Teams  
✨ **Drama:** Überraschende Elfmeter & Verlängerungen möglich  
✨ **Dynamisch:** Jedes Turnier ist anders