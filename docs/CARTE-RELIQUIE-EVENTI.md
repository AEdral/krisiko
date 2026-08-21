# Krisiko — Carte, Reliquie, Eventi globali

Liste complete come implementate in `src/js/data/`.  
Nomi e regole in italiano; `id` = chiave interna nel codice.

---

## Carte

Mazzo Krisiko: **44** carte (`docs/new-cards.md`, `src/js/data/cards.js`).  
Action / Combat / Instant, rider territorio, rarità comune → jolly.

Dopo almeno 1 conquista nel turno → pesca 1 carta. Mano max **5** (7 con reliquia Quartiermastro). Niente tris.

### Riferimento rapido

| Rarità | Pezzi |
|--------|-------|
| Comune | 24 (Vantaggio, Rilancio, Reclutamento, Marcia, Sabotaggio, Esploratore, Ponderare, Negare) |
| Rara | 12 (Teletrasporto, Isolamento, Furto, Approvvigionamenti, Sciacallo, Preveggenza) |
| Epica | 6 (Riesumazione, Chaos, Arcana, Pestilenza, Onniscienza, Tradimento) |
| Jolly | 2 (Voltagabbana, Doppio mandato) |

Dettaglio effetti, tempi e rider: **`docs/new-cards.md`**.

**Nota:** Negare, Sciacallo e parte delle Instant richiedono lo **stack** (`docs/stack-system.md`); le Action/Combat principali sono giocabili in partita.

---

## Reliquie

Passive: **1** assegnata a caso a setup (modalità Krisiko). Con **Arcana** (epica) se ne possono aggiungere altre in partita.  
Lista completa in `src/js/data/relics.js`. Effetti **Dominio**, **Veggente**, **Riciclaggio** e **Allerta** richiedono il mazzo/stack nuovo (`docs/new-cards.md`, `docs/stack-system.md`).

| Nome | Id | Effetto |
|------|-----|---------|
| **Cassa di Guerra** | `war_chest` | +1 rinforzo all’inizio di ogni tuo turno. |
| **Identità Continentale** | `continental_identity` | Bonus continente +50% per continente (arrotondato per difetto). |
| **Rete di mobilità** | `mobility_net` | Fino a 2 spostamenti extra da 1 armata in fase Spostamento (dopo quello di fase). |
| **Aggressore** | `aggressor` | Conquista in combattimento: +1 armata sul territorio. Max 3 volte per turno. |
| **Sete di conquista** | `conquest_thirst` | ≥2 conquiste in combattimento nel turno → +1 carta a fine fase Attacco. |
| **Guerriglia** | `guerrilla` | Attacco da territorio con esattamente 2 armate: +1 al dado d’attacco più alto (max 6). |
| **Bastione** | `bastion` | 1× per giro (opt-in): se ti attaccano nel turno avversario, +1 al dado di difesa più alto (max 6). |
| **Ridotta** | `redoubt` | 1× per turno: se resisti a un attacco, +1 armata su quel territorio. |
| **Dominio** | `dominion` | Rider: +3 armate invece di +2 (mazzo nuovo). |
| **Quartiermastro** | `quartermaster` | Mano massima +2 (7 invece di 5). |
| **Veggente** | `seer` | Ogni pesca: guarda cima mazzo, puoi bottomare (mazzo nuovo). |
| **Riciclaggio** | `recycling` | Inizio turno: opz. scarta 1 → pesca 1. |
| **Allerta** | `alert` | Negare / Sciacallo avversari non colpiscono le tue carte (stack). |

---

## Eventi globali

Dal **fine del round 2**: ogni round viene rivelato **1** evento (mazzo mescolato degli id sotto). Vale per tutti i giocatori.

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
