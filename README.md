# Krisiko

Demo prototipo browser: **Risiko + reliquie + carte + eventi globali**, 1 giocatore vs IA.

## Avvio

### Docker Compose

```bash
docker compose up --build
```

Apri **http://localhost:3080**.

### Locale (senza Docker)

```bash
npm start
```

Apri l’URL mostrato (es. `http://localhost:3000`).

### Helm

```bash
helm install krisiko oci://ghcr.io/aedral/krisiko/krisiko --version <VERSION>
```

La release GitHub Actions parte su push di un tag `v*` (immagine + chart su GHCR).

## Controlli

1. **Rinforzi** — clic sui tuoi territori, poi «Fine rinforzi»
2. **Attacco** — seleziona attaccante (≥2), poi bersaglio nemico adiacente; carta combat opzionale dalla mano in basso
3. **Spostamento** — da → a (un movimento)
4. Carte **azione** — clic sulla carta in basso, poi target richiesto

Layout: mappa Risk a regioni al centro, **pannello avversario** a destra, **reliquia + mano + stats** in basso.

## Struttura

- `src/js/engine/` — regole pure / stato serializzabile
- `src/js/ai/` — IA euristica
- `src/js/ui/` — mappa e HUD
- `src/js/data/` — mappa Risk, reliquie, carte, eventi
- `helm/krisiko/` — Helm chart
- `docs/GDD.md` — regolamento

## Obiettivo

Conquista tutti i 42 territori. Eventi globali dalla fine del round 2.

Mappa basata sul tavoliere Risk (Wikimedia / CC BY-SA).
