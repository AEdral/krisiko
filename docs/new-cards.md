# Krisiko — Nuovo mazzo (bozza)

Design in corso. **Non** è ancora nel codice (`src/js/data/cards.js` resta il mazzo demo).  
Niente tris. Ogni carta è **uso singolo**, effetto immediato.

## Struttura

| Rarità | Tipi | Copie | Pezzi |
|--------|------|-------|-------|
| Comune | 8 | vedi sotto | **24** |
| Rara | 6 | 2 | 12 |
| Epica | 6 | 1 | 6 |
| Jolly (leggendaria) | 2 | 1 | 2 |
| **Totale** | | | **44** |

42 territori unici sulle carte non-jolly (stesso effetto, terra diversa). I 2 jolly non hanno territorio.

Pesca: dopo almeno 1 conquista nel turno → 1 carta. Mano max 5 (6 con reliquia Quartiermastro).

## Rider (tutte tranne i jolly)

Quando giochi una carta, se **in quel momento** possiedi il territorio stampato: **+2 armate dove vuoi**, poi risolvi l’effetto.  
Se non lo possiedi: solo l’effetto.  
Se l’effetto è nullo (es. Sabotaggio su mano vuota), il rider può scattare comunque.

## Tempi di gioco

Ogni carta ha uno di questi tre tempi (vale per tutte le rarità):

| Tempo | Quando si gioca |
|-------|-----------------|
| **Action** | Quando vuoi **nel tuo turno**. Non nel turno avversario, non in risposta. |
| **Combat** | Quando vuoi **nel tuo turno**, e anche **quando ti attaccano**. |
| **Instant** | **In qualsiasi momento** (tuo turno, turno avversario, in risposta). |

Se l’effetto parla di dadi / di *questo lancio*, serve un combattimento in corso: i tuoi attacchi, o la difesa quando ti attaccano. In ogni combattimento, ogni giocatore può giocare **1 carta combat**.

**Negare** è instant: si gioca in risposta a una comune o rara avversaria (anche a un altro Negare). Epiche e jolly non si negano.

## Comuni (24)

| Carta | Copie | Tempo | Effetto |
|--------|-------|-------|---------|
| **Vantaggio** | 4 | Combat | +1 a **un** tuo dado di questo lancio (max 6). |
| **Rilancio** | 4 | Combat | Rilancia il tuo dado **più basso**. |
| **Reclutamento** | 4 | Action | +2 armate su **un** tuo territorio. |
| **Marcia** | 2 | Action | Sposta fino a 3 armate tra due tuoi territori **adiacenti**. Non consuma lo spostamento di fase. |
| **Sabotaggio** | 2 | Action | L’avversario scarta **1 carta a caso**. Se la mano è vuota, l’effetto è nullo. |
| **Esploratore** | 3 | Action | Scarta questa carta, pesca 2 (limite mano). Il rider, se scatta, **prima** della pesca. |
| **Ponderare** | 2 | Action | Guarda le **prime 3** carte del mazzo. Aggiungine **1** alla mano; le altre in fondo **nell’ordine che vuoi**. Se nel mazzo ce ne sono meno di 3, guardi quelle che ci sono. Hai speso Ponderare: in mano resti pari (salvo limite). Rider, se scatta, prima. |
| **Negare** | 3 | Instant | In risposta a una **comune** o **rara** avversaria: quella carta non ha effetto e va scartata. **Epiche e jolly** non si negano. Negare si può negare. Rider, se scatta, sì. |

4+4+4+2+2+3+2+3 = **24**.

## Rare (12)

6 tipi × 2 copie. Si possono **negare**.

| Carta | Copie | Tempo | Effetto |
|--------|-------|-------|---------|
| **Teletrasporto** | 2 | Action | Sposta **quante armate vuoi** da un tuo territorio a un **altro tuo**, anche non adiacente. Sul territorio di partenza deve restare **almeno 1** armata. |
| **Isolamento** | 2 | Instant | Scegli un territorio: non può **attaccare** né **spostare** armate fino al tuo prossimo turno. (Può ancora ricevere rinforzi e essere attaccato.) |
| **Furto** | 2 | Action | Guarda la mano avversaria e **prendi** 1 carta. |
| **Approvvigionamenti** | 2 | Action | **+4** armate, dove vuoi (tuoi territori; anche tutte sullo stesso). |
| | 2 | | *slot vuoto* |
| | 2 | | *slot vuoto* |

2+2+2+2+2+2 = **12**.

## Epiche (6)

6 tipi × 1 copia. **Non** si negano. Tempo da assegnare a ogni carta.

| Carta | Copie | Tempo | Effetto |
|--------|-------|-------|---------|
| | 1 | | *slot vuoto* |
| | 1 | | *slot vuoto* |
| | 1 | | *slot vuoto* |
| | 1 | | *slot vuoto* |
| | 1 | | *slot vuoto* |
| | 1 | | *slot vuoto* |

Idee in sospeso (nessuna chiusa):

- **Chaos** — Cambi fino a **tre** eventi ambientali. Dettaglio da chiudere: sostituire l’evento attivo, pescarne di nuovi, scartare/rimescolare il mazzo eventi, ecc.
- **Assalto totale** (combat) — In un combattimento tiri **1 dado d’attacco in più** oltre il limite (4 vs 2). Ruling da fare con eventi tipo Nebbia (max dadi): l’epica dovrebbe bypassare, altrimenti non è epica.
- **Esecuzione** (combat) — Dopo i dadi, se il difensore ha una sola armata, puoi eliminarla e conquistare. Meglio se si **dichiara prima** del lancio (assicurazione), non dopo aver visto il risultato.
- **Gelo assoluto** (instant) — Upgrade di Isolamento: il territorio non attacca, non sposta, **non riceve rinforzi**, fino all’inizio del tuo prossimo turno. Isolamento resta la versione rara (niente lock ai rinforzi).
- **Grande furto** — Troppo vicino a **Furto** (rara già guarda e prende). Se resta, deve fare di più: es. prendi e **gioca subito**, o prendi 2, o prendi anche dallo scarto.
- **Instant kill** — −1 armata prima del combattimento. Era in quota rara, poi tolta. Può tornare qui se non è “Incursione epica” troppo piatta; non deve andare a 0 se Esecuzione già chiude l’ultima armata.

Non ripetere in epica lo stesso verbo della rara a volume minore, salvo Isolamento → Gelo assoluto (stesso verbo, **più** il lock rinforzi).

## Jolly (2)

Senza territorio (**niente rider**). **Non** si negano. L’effetto deve valere un’epica **più** il +2 che non hanno. Non sono wild da tris (i tris non ci sono).

| Carta | Copie | Tempo | Effetto |
|--------|-------|-------|---------|
| | 1 | | *slot vuoto* |
| | 1 | | *slot vuoto* |

Idee in sospeso:

- Effetto che **non sta su un territorio** (altrimenti è un’epica senza rider): pesca 3 e giocane 1; sostituisci l’evento globale; una conquista senza battaglia; il +2 del rider **sempre**, come se ogni terra fosse tua.
- In 1v1, 2/44 si possono non vedere: se il jolly è identità del prodotto, almeno uno nel terzo inferiore del mazzo, o entra dopo il primo rimescolio.
- Non cumulabili col ruolo “wild da set”: o bomba da partita, o niente.
