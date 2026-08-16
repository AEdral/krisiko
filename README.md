# Krisiko

Browser prototype: **Risk/Risiko + relics + cards + global events**, 1 player vs AI.

![Krisiko gameplay screenshot](docs/assets/screen.jpeg)

## Run

### Docker Compose

```bash
docker compose up --build
```

Open **http://localhost:3080**.

### Local (no Docker)

```bash
npm start
```

Open the URL shown (e.g. `http://localhost:3000`).

### Release (tag `v*`)

Pushing a `v*` tag runs the `Release` workflow, which:
1. publishes a Docker image to GHCR (`:tag`, `:version`, `:latest`)
2. publishes the Helm chart as OCI to GHCR
3. deploys `src/` to **GitHub Pages** (always the latest release)

```bash
helm install krisiko oci://ghcr.io/aedral/krisiko/krisiko --version <VERSION>
```

Pages demo: `https://aedral.github.io/krisiko/`

If the Pages job fails with “Get Pages site failed”, enable it once under
**Settings → Pages → Source: GitHub Actions**, then re-run the workflow
(or push another `v*` tag).

## Controls

1. **Reinforce** — click your territories, then “End reinforce”
2. **Attack** — select attacker (≥2 armies), then an adjacent enemy; optional combat card from the hand tray
3. **Fortify** — from → to (one move)
4. **Action** cards — click a card in the tray, then the required target

Layout: Risk region map in the center, **opponent panel** on the right, **relic + hand + stats** along the bottom.

## Structure

- `src/js/engine/` — pure rules / serializable state
- `src/js/ai/` — heuristic AI
- `src/js/ui/` — map and HUD
- `src/js/data/` — Risk map, relics, cards, events
- `helm/krisiko/` — Helm chart
- `docs/GDD.md` — design / rules doc

## Goal

Conquer all 42 territories. Global events start from the end of round 2.

Map based on the Risk board (Wikimedia / CC BY-SA).
