# Krisiko — Game Design Document (Demo)

## Panoramica
Krisiko è un **Risiko** con elementi roguelike. Demo: **1 umano vs 1 IA**.

Regolamento di riferimento: **Risiko classico** (mappa 42 territori, bonus continente, missioni, schieramento a turni), più i delta Krisiko (reliquie, carte nuove, eventi).

## Regole base (Risiko)

### Mappa
- 42 territori, 6 continenti con bonus rinforzi se controllati interamente:
  - Nord America: **+5**
  - Sud America: **+2**
  - Europa: **+5**
  - Africa: **+3**
  - Asia: **+7**
  - Oceania: **+2**
- Collegamenti via mare (Alaska–Kamchatka, Brasile–Nord Africa, ecc.) valgono come adiacenze normali e sono mostrati come tratteggi sulla mappa.

### Setup (2 giocatori)
1. Territori assegnati a caso in modo equo (21 ciascuno), **1 armata** su ciascuno.
2. Pool iniziale: **40** armate a testa → restano **19** da piazzare.
3. I giocatori **si alternano** piazzando **1 armata** alla volta su un proprio territorio.
4. Ogni giocatore riceve **1 reliquia** e **1 obiettivo segreto**.

### Turno
1. **Rinforzi** — `max(3, floor(territori/3))` + bonus continenti (+ eventuali bonus reliquia/evento).
2. **Attacco** — dadi classici (att max 3, dif max 2).
3. **Spostamento** — un movimento tra territori propri adiacenti (anche via mare).

### Vittoria
Si vince completando il **proprio obiettivo** (missione). Resta anche la vittoria per eliminazione totale dell’avversario.

---

## Delta Krisiko

### Reliquie (passive)
1 reliquia a setup. Niente acquisizione extra in demo.

### Carte (niente tris)
Dopo almeno 1 conquista nel turno → pesca 1 carta (combat o azione). Mano max 5; se piena, scarta 1 poi pesca.

### Eventi globali
Dalla fine del round 2: 1 evento globale per round (buff/debuff a tutti).

## Architettura tecnica
Motore puro (`GameState` + azioni) separato da UI e IA, serializzabile per futuro online.
