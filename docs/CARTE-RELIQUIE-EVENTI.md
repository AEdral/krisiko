# Krisiko — Carte, Reliquie, Eventi globali

Liste complete come implementate in `src/js/data/`.  
Nomi e regole in italiano; `id` = chiave interna nel codice.

---

## Carte

Mazzo misto: **combat** (durante una battaglia) e **azione** (fuori combattimento).  
Dopo almeno 1 conquista nel turno → pesca 1 carta. Mano max **5** (6 con reliquia Quartiermastro). Niente tris.

Copie nel mazzo di partita: Affilatura ×4, Rilancio ×3, Sabotaggio ×3, Muro Improviso ×3, Reclutamento ×4, Marcia Forzata ×3, Esploratore ×2, Incursione ×3 (**25** carte totali).

### Combat

| Nome | Id | Effetto |
|------|-----|---------|
| **Affilatura** | `sharpen` | +1 al tuo dado d’attacco più alto (max 6). |
| **Rilancio** | `reroll_attack` | Rilancia il tuo dado d’attacco più basso. |
| **Sabotaggio** | `sabotage` | −1 al dado di difesa più alto del nemico (min 1). |
| **Muro Improviso** | `fortify_die` | +1 al tuo dado di difesa più alto (max 6). Solo se stai difendendo. |

### Azione

Usabili nelle fasi indicate (non in combattimento).

| Nome | Id | Fasi | Effetto |
|------|-----|------|---------|
| **Reclutamento** | `recruit` | Rinforzi, Attacco, Spostamento | +2 armate su un tuo territorio. |
| **Marcia Forzata** | `forced_march` | Rinforzi, Attacco, Spostamento | Sposta fino a 3 armate tra due tuoi territori adiacenti (non conta come spostamento di fase). |
| **Esploratore** | `scout` | Rinforzi, Attacco, Spostamento | Scarta questa carta e pesca 2 carte (rispettando il limite mano). |
| **Incursione** | `raid` | Rinforzi, Attacco | Rimuovi 1 armata da un territorio nemico adiacente a uno tuo (non può scendere sotto 1). |

---

## Reliquie

Passive: **1** assegnata a caso a setup. Nessuna acquisizione extra in demo.

| Nome | Id | Effetto |
|------|-----|---------|
| **Dado Fortunato** | `lucky_die` | Nei tuoi attacchi, il dado più basso riceve +1 (max 6). |
| **Scudo di Ferro** | `iron_shield` | In difesa, il tuo dado più alto riceve +1 (max 6). |
| **Cassa di Guerra** | `war_chest` | +1 rinforzo all’inizio di ogni tuo turno. |
| **Primo Colpo** | `first_strike` | Nel primo attacco del turno: +1 confrontato in battaglia (max 3 dadi fisici). |
| **Pattuglia di Confine** | `border_patrol` | Dopo lo spostamento, puoi spostare 1 armata extra tra due territori adiacenti tuoi. |
| **Raccoglitore** | `scavenger` | Quando conquisti un territorio, +1 armata sul territorio conquistato. |
| **Invocatore di Tempeste** | `storm_caller` | Gli eventi globali con tag **harm** non ti colpiscono. |
| **Quartiermastro** | `quartermaster` | Mano massima carte +1 (6 invece di 5). |

---

## Eventi globali

Dal **fine del round 2**: ogni round viene rivelato **1** evento (mazzo mescolato degli id sotto). Vale per entrambi i giocatori, salvo immunità (es. Invocatore di Tempeste sugli eventi `harm`).

| Nome | Id | Tag | Effetto |
|------|-----|-----|---------|
| **Tempesta** | `storm` | harm | Tutti gli attacchi: −1 al dado più alto (min 1). |
| **Raccolto** | `harvest` | buff | Tutti: +1 rinforzo all’inizio turno. |
| **Caos** | `chaos` | harm | Se puoi attaccare, devi dichiarare almeno un attacco nel turno. |
| **Nebbia di Guerra** | `fog` | harm | Max 2 dadi in attacco / 1 in difesa. |
| **Boom Demografico** | `boom` | buff | Rinforzi da territori: `floor(territori/2)` invece di `/3` (il minimo 3 resta). |
| **Peste** | `plague` | harm | All’inizio del turno, −1 armata su un territorio casuale tuo con >1 armata (se esiste). |
| **Linee di Rifornimento** | `supply_lines` | buff | Lo spostamento può attraversare una catena di tuoi territori (distanza illimitata lungo i tuoi). |

---

Fonte codice: `src/js/data/cards.js`, `relics.js`, `events.js`.
