# Organizzazione del repository

Playbook per un’**app web statica** (HTML/CSS/JS in `src/`) con tre canali di distribuzione. È il **metodo di lavoro**: un agente o una persona che avvia un progetto analogo deve seguirlo, non reinventarlo.

**Come si usano i due file**

| File | Ruolo |
|------|--------|
| `docs/repo-org.md` (questo) | Metodo generico. Placeholder `<app>`, `<owner>`, `<repo>`. Nessun nome di prodotto. |
| `README.md` in radice | Istanza. Nomi veri, URL, comandi copiabili, una riga sul prodotto. |

Un chatbot che deve **imparare o replicare il metodo** legge questo file. Un chatbot che deve **lavorare su un repo già creato** legge il README (valori concreti) e torna qui solo per layout, CI, Docker, Helm, ignore, Pages.

**Contratto per agenti**

1. Leggi questo playbook per intero prima di creare o cambiare albero, Docker, Compose, Helm, workflow, `.gitignore`, `.dockerignore`, Pages.
2. Non introdurre bundler, backend, env var o publish su push a `main`, salvo richiesta esplicita.
3. `src/` è l’artefatto frontend. Path degli asset **relativi**. Test di smoke esclusi dall’immagine. Un backend (`server/`) solo se previsto in [3bis](#3bis-server-opzionale-stanze--realtime).
4. Release = tag Git SemVer `vMAJOR.MINOR.PATCH`. I commit non pubblicano.
5. Il README di ogni nuovo repo segue la sezione [README di istanza](#11-readme-di-istanza). Il prodotto (regole di gioco, API, ecc.) sta in `docs/`, non nel playbook.
6. Se cambi il metodo, aggiorna **questo file**. Se cambi nomi/URL di un progetto, aggiorna il **README**.

---

Playbook — tre canali di distribuzione:

| Canale | Quando | Cosa pubblica |
|--------|--------|----------------|
| Locale / Compose | sviluppo | nginx (o `npx serve`) su `src/` |
| GitHub Pages | ogni tag di release | contenuto di `src/` |
| GHCR + Helm | ogni tag di release | immagine Docker e chart OCI |

Sostituisci ovunque:

| Placeholder | Significato | Esempio |
|-------------|-------------|---------|
| `<app>` | nome del progetto e del chart Helm | `myapp` |
| `<owner>` | utente o organizzazione GitHub | `alice` |
| `<repo>` | nome del repository | `myapp` |

Convenzione consigliata: `<app>` = `<repo>` (minuscolo). GHCR richiede nomi **lowercase**.

---

## 1. Albero

```
.
├── src/                          # unico artefatto runtime (la web app)
├── docs/                         # design, playbook, asset (non va nell’immagine)
├── helm/<app>/                   # chart Kubernetes
│   ├── Chart.yaml
│   ├── values.yaml
│   └── templates/
│       ├── _helpers.tpl
│       ├── deployment.yaml
│       ├── service.yaml
│       ├── ingress.yaml
│       └── NOTES.txt
├── .github/workflows/
│   └── release.yml               # tag v* → immagine + chart + Pages
├── Dockerfile                    # nginx: copia src/ in /usr/share/nginx/html
├── docker-compose.yml            # build locale, porta host 3080 → 80
├── .dockerignore
├── .gitignore
├── package.json                  # script locali (serve, test), nessuna dipendenza obbligatoria
└── README.md                     # istanza: valori, comandi, link al playbook
```

Principi:

1. **`src/` è la verità runtime.** Docker, Pages e Compose servono la stessa cartella. Nessun passo di build frontend.
2. **Il motore/regole resta separato dalla UI** se l’app ha logica (cartelle tipo `src/js/engine`, `src/js/ui`). Non è obbligatorio, è una convenzione utile.
3. **La release è un tag Git** `vMAJOR.MINOR.PATCH`. Push del tag = pubblicazione. I commit su `main` non pubblicano nulla.
4. **I placeholder nel repo (chart version, image repository) sono dummy.** CI li riscrive al momento del tag. Non serve tenere allineati a mano `Chart.yaml` / `values.yaml` con GHCR.

---

## 2. `src/` — l’applicazione

Contenuto tipico:

```
src/
├── index.html
├── css/
└── js/
```

Regole:

- **Path relativi** negli asset (`href="css/style.css"`, `src="js/main.js"`). Su GitHub Pages il sito vive in `https://<owner>.github.io/<repo>/`: un path assoluto tipo `/css/style.css` rompe il deploy.
- Un solo `index.html` in radice di `src/`. nginx e Pages servono quella cartella come document root.
- Niente bundler obbligatorio. ES modules (`<script type="module">`) vanno bene se i browser target li supportano.
- I test headless possono stare in `src/` (es. `src/js/smoke-test.js`) ma **non** devono finire nell’immagine: escludili in `.dockerignore`.

Sviluppo senza Docker:

```bash
npm start
# → npx serve src  →  http://localhost:3000
```

`package.json` minimo (app solo statica):

```json
{
  "name": "<app>",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "npx --yes serve src",
    "smoke": "node src/js/smoke-test.js"
  }
}
```

Nessuna dipendenza in `dependencies`: `serve` arriva via `npx` al momento.

Se il prodotto ha **stanze realtime** (multiplayer), vedi [3bis](#3bis-server-opzionale-stanze--realtime): `npm start` diventa `node server/index.js` e compare `ws` in `dependencies`.

---

## 3. Docker

### Dockerfile

Immagine da runtime statico, niente build stage:

```dockerfile
FROM nginx:1.27-alpine

COPY src/ /usr/share/nginx/html/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

- Context di build = radice del repo.
- nginx ascolta su **80**.
- Probe Helm e Compose puntano a `/`.

### `docker-compose.yml`

Per girare in locale come in cluster, senza Kubernetes:

```yaml
services:
  <app>:
    build: .
    container_name: <app>
    ports:
      - "3080:80"
    restart: unless-stopped
```

```bash
docker compose up --build
# → http://localhost:3080
```

Porta host **3080** (non 80) per non scontrarsi con altri servizi. Il container resta su 80.

### `.dockerignore`

Obiettivo: contesto piccolo e immagine senza file di sviluppo.

```
.git
.gitignore
node_modules
*.md
!README.md
docs
src/js/smoke-test.js
```

| Voce | Perché |
|------|--------|
| `.git` | non serve a nginx, ingombra il context |
| `node_modules` | l’app non li usa a runtime |
| `*.md` / `docs` | documentazione, non runtime |
| `!README.md` | eccezione se vuoi tenerlo nell’immagine (opzionale) |
| file di test sotto `src/` | non devono essere scaricabili dal browser in produzione |

Aggiungi qui tutto ciò che sta in `src/` ma non è parte del prodotto (fixture, script di smoke, ecc.).

---

## 3bis. Server opzionale (stanze / realtime)

Solo se il prodotto richiede partite online. Altrimenti resta nginx + `src/` come sopra.

- `server/` è un processo Node che **serve `src/`** come statico, espone `GET /health` e WebSocket `/ws`.
- Stanze **in memoria**, accessibili solo via link. Niente account, classifiche o database.
- Helm: `replicaCount: 1` (altrimenti le stanze non si vedono tra pod). Probe su `/health`. Timeout ingress lunghi per il WS.
- GitHub Pages continua a pubblicare **solo** `src/` (senza online).
- `npm start` → `node server/index.js`. Dipendenza: `ws`.
- Dockerfile: `node:*-alpine`, `npm ci --omit=dev`, `CMD ["node", "server/index.js"]`, `PORT=80`.

Contratto: non aggiungere un backend “perché magari servirà”. Solo su richiesta esplicita di multiplayer/stanze.

---

## 4. Helm

Chart in `helm/<app>/` (il nome cartella = `name` in `Chart.yaml` = `<app>`).

### `Chart.yaml`

```yaml
apiVersion: v2
name: <app>
description: <una riga>
type: application
version: 0.1.0          # versione del chart (SemVer, senza v). CI la sovrascrive.
appVersion: "1.0.0"     # versione dell’app. CI la mette al tag Git (con v).
```

### `values.yaml` (contratto)

Valori dummy nel git; la pipeline di release li patcha.

```yaml
replicaCount: 1

image:
  repository: <app>       # CI → ghcr.io/<owner>/<repo>
  tag: latest             # CI → v1.2.3
  pullPolicy: IfNotPresent  # CI → Always (sulla release)

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: false
  className: ""
  annotations: {}
  hosts:
    - host: <app>.local
      paths:
        - path: /
          pathType: Prefix
  tls: []

resources:
  limits:
    cpu: 100m
    memory: 64Mi
  requests:
    cpu: 50m
    memory: 32Mi

livenessProbe:
  httpGet:
    path: /
    port: http
  initialDelaySeconds: 5
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /
    port: http
  initialDelaySeconds: 3
  periodSeconds: 10

nodeSelector: {}
tolerations: []
affinity: {}
nameOverride: ""
fullnameOverride: ""
```

Per un’app statica i limiti piccoli bastano.

### Templates

Set minimo:

| File | Ruolo |
|------|--------|
| `_helpers.tpl` | `name`, `fullname`, `labels`, `selectorLabels` |
| `deployment.yaml` | 1 container, porta `http`/80, probe e resources da values |
| `service.yaml` | ClusterIP, `targetPort: http` |
| `ingress.yaml` | opzionale, gated da `ingress.enabled` |
| `NOTES.txt` | URL post-install (ingress / NodePort / LB / port-forward 3080) |

Deployment: immagine `{{ .Values.image.repository }}:{{ .Values.image.tag }}`. Niente `imagePullSecrets` nel template base: va aggiunto se il package GHCR resta privato.

Helpers: definisci `<app>.name`, `<app>.fullname`, `<app>.labels`, `<app>.selectorLabels` (stesso schema dei chart `helm create`).

### Convenzione versioni (Git ↔ Helm ↔ immagine)

| Oggetto | Formato | Esempio su tag `v1.2.3` |
|---------|---------|-------------------------|
| Tag Git | `v` + SemVer | `v1.2.3` |
| Chart `version` | SemVer senza `v` | `1.2.3` |
| Chart `appVersion` | tag Git | `"v1.2.3"` |
| Immagine | tre tag | `:v1.2.3`, `:1.2.3`, `:latest` |

Helm accetta solo SemVer su `version`. Non taggare `vfoo`.

### Dove finisce il chart su GHCR

```
helm push <app>-<version>.tgz oci://ghcr.io/<owner>/<repo>
```

Helm aggiunge il **nome del chart** al path. Install:

```bash
helm install <app> oci://ghcr.io/<owner>/<repo>/<app> --version <version>
```

Se `<repo>` e `<app>` coincidono il path ha il nome ripetuto (`…/myapp/myapp`): è normale, non un errore.

---

## 5. Pipeline GitHub Actions (`release.yml`)

Un solo workflow, due job in serie.

**Trigger:** push di un tag `v*`.

```yaml
on:
  push:
    tags:
      - 'v*'
```

Release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

### Permessi del workflow

```yaml
permissions:
  contents: read      # checkout
  packages: write     # push su GHCR (immagine + chart OCI)
  pages: write        # deploy Pages
  id-token: write     # OIDC richiesto da actions/deploy-pages
```

Niente secret extra: si usa `GITHUB_TOKEN` (login Docker verso `ghcr.io`).

### Concurrency

```yaml
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

Non cancellare una release a metà: immagine e chart resterebbero disallineati.

### Job `release`

1. Checkout del tag.
2. Calcolo metadati:
   - `TAG` = `GITHUB_REF_NAME` (`v1.2.3`)
   - `VERSION` = tag senza `v` (`1.2.3`)
   - `IMAGE` = `ghcr.io/<owner>/<repo>` in **lowercase**
3. Login GHCR + Buildx.
4. Build/push immagine con i tre tag (`:v…`, `:versione`, `:latest`).
5. Patch in-place (solo nel runner, non committata):
   - `Chart.yaml` → `version`, `appVersion`
   - `values.yaml` → `image.repository`, `image.tag`, `pullPolicy: Always`
6. `helm lint`
7. `helm package` + `helm push` verso `oci://${IMAGE}`
8. Riepilogo in `$GITHUB_STEP_SUMMARY` (pull e `helm install` pronti da copiare)

Il login Docker è sufficiente anche per `helm push` OCI sullo stesso registry.

### Job `pages`

`needs: release`: se immagine/chart falliscono, Pages non si aggiorna.

- Environment GitHub: `github-pages` (lo crea `deploy-pages`).
- Artifact = cartella `src` (non l’immagine Docker: stesso sorgente, canale diverso).
- Action: `configure-pages` (con `enablement: true`) → `upload-pages-artifact` → `deploy-pages`.

Risultato: `https://<owner>.github.io/<repo>/` allineato **all’ultimo tag**, non a `main`.

### Variabili da adattare nel YAML

```yaml
env:
  REGISTRY: ghcr.io
  CHART_DIR: helm/<app>
  CHART_NAME: <app>
```

Il resto (`github.repository`, tag) è derivato dal contesto Actions.

### Cosa questa pipeline non fa (e va bene così)

- Nessun test automatico prima del push (aggiungi uno step `npm run smoke` prima di `docker push` se ti serve il gate).
- Nessuna GitHub Release (note/changelog): solo packages + Pages.
- Nessun multi-arch (`linux/amd64` di default).
- I commit su branch non pubblicano: solo i tag.

---

## 6. `.gitignore`

```
node_modules/
.DS_Store
*.log
.idea/
.vscode/
*.tgz
```

| Voce | Perché |
|------|--------|
| `node_modules/` | anche se oggi non ci sono deps, `npx` può lasciarle |
| `*.tgz` | output di `helm package` in locale |
| IDE / OS / log | rumore |

Non ignorare `src/`, `helm/`, `Dockerfile`, i workflow.

---

## 7. `docs/`

Documentazione **di prodotto e di metodo**, non runtime.

```
docs/
├── repo-org.md      # questo playbook
├── assets/          # screenshot, diagrammi (linkati dal README)
└── …                # GDD, cataloghi, ADR, ecc.
```

- Esclusa dall’immagine (`.dockerignore`) e da Pages (Pages pubblica solo `src/`).
- Il README in radice resta il “come si lancia”; `docs/` è il “perché / come è fatto”.
- Screenshot nel README: path `docs/assets/…` (GitHub li serve dal repo, non da Pages).

---

## 8. GitHub Pages — setup una tantum

Il workflow può **provare** ad abilitare Pages (`enablement: true`). Spesso il primo run fallisce con *Get Pages site failed* finché il sito non esiste. Va fatto **una volta** a mano (UI o `gh`), poi si rilancia il workflow / si ripush del tag.

### Da interfaccia

1. Repo → **Settings → Pages**.
2. **Source**: *GitHub Actions* (non “Deploy from a branch”).
3. Salva.
4. (Opzionale) Settings → **Environments**: comparirà `github-pages` dopo il primo deploy. Lascia i reviewer vuoti se non vuoi approvazioni.
5. Se il repo è privato: Pages sui piani che lo consentono; su repo pubblico non serve altro.

Poi: **Actions → workflow fallito → Re-run**, oppure nuovo tag `v*`.

URL atteso (project site):

```
https://<owner>.github.io/<repo>/
```

### Con GitHub CLI

Autenticazione: `gh auth login` con scope `repo` (e `workflow` se chiedesse di aggiornare i workflow).

Crea il sito Pages con backend Actions:

```bash
gh api repos/<owner>/<repo>/pages \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -f build_type=workflow
```

Se esiste già:

```bash
gh api repos/<owner>/<repo>/pages \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  -f build_type=workflow
```

Verifica:

```bash
gh api repos/<owner>/<repo>/pages --jq '{url:.html_url, status:.status, build:.build_type}'
```

Stato dei deploy:

```bash
gh api repos/<owner>/<repo>/pages/deployments --jq '.[0] | {env:.environment, sha:.sha, created:.created_at}'
```

Rilancia l’ultimo workflow di release:

```bash
gh run list --workflow=release.yml --limit 5
gh run rerun <run-id> --failed
```

### Package GHCR visibili

Di default i package su GHCR sono **privati**. Per `docker pull` / `helm install` da fuori (o da un cluster senza pull secret):

1. GitHub → profilo o org → **Packages** → pacchetto immagine ` <repo> `.
2. Package settings → **Change visibility** → Public.
3. Ripeti per il pacchetto del chart (`<repo>/<app>`).

Da CLI (utente):

```bash
gh api -X POST /user/packages/container/<repo>/visibility \
  -f visibility=public
```

Per un’org: ` /orgs/<org>/packages/container/<repo>/visibility `.

Senza questo, Helm in cluster fallisce il pull a meno di `imagePullSecrets` verso GHCR.

### Checklist repo nuovo

- [ ] Settings → Actions → General → **Workflow permissions**: Read and write (o almeno il `GITHUB_TOKEN` può scrivere packages; i permessi nel YAML `packages: write` / `pages: write` restano necessari).
- [ ] Settings → Pages → Source **GitHub Actions**.
- [ ] (Org) permesso a GitHub Actions di pubblicare package: Settings org → Packages / Actions, se l’org lo restringe.
- [ ] Primo tag `v0.1.0` dopo che Pages è abilitato.
- [ ] Package GHCR resi public se la demo/cluster deve tirarli senza auth.

---

## 9. Flusso di lavoro quotidiano

```
sviluppo in src/          npm start  /  docker compose up --build
         │
         ▼
   commit su main         nessun deploy
         │
         ▼
   git tag vX.Y.Z
   git push origin vX.Y.Z
         │
         ├─► ghcr.io/<owner>/<repo>:{vX.Y.Z, X.Y.Z, latest}
         ├─► oci://ghcr.io/<owner>/<repo>/<app> --version X.Y.Z
         └─► https://<owner>.github.io/<repo>/
```

Install in cluster dopo la release:

```bash
helm install <app> oci://ghcr.io/<owner>/<repo>/<app> --version <version>
kubectl -n default port-forward svc/<app> 3080:80
```

---

## 10. Copiare questa impostazione su un progetto nuovo

1. Crea il repo GitHub (`<owner>/<repo>`).
2. Copia l’albero sopra (`src`, `helm/<app>`, Dockerfile, compose, ignore, `release.yml`, `docs`).
3. Rinomina `<app>` in: cartella Helm, `Chart.yaml` `name`, definizioni in `_helpers.tpl`, `CHART_DIR` / `CHART_NAME` nel workflow, service Compose, `package.json` `name`.
4. Asset in `src/` con path **relativi**.
5. Abilita Pages (sezione 8).
6. Primo tag SemVer `v0.1.0` e verifica: immagine, `helm install`, URL Pages.

Fine. Da lì in poi il metodo è: **cambi `src/`, tagghi, esce ovunque uguale**.

---

## 11. README di istanza

Il README in radice **non** ripete questo playbook. È la scheda del repo: prodotto + valori + comandi. Stessa sequenza di sezioni in ogni progetto, così un agente la riconosce.

```markdown
# <app>

<una riga: che cos’è>

> Metodo di lavoro: [docs/repo-org.md](docs/repo-org.md).
> Questo README è l’istanza (`<owner>/<repo>`, chart `<app>`).

## Valori

| Chiave | Valore |
|--------|--------|
| owner / repo / app | … |
| Immagine | `ghcr.io/<owner>/<repo>` |
| Chart | `oci://ghcr.io/<owner>/<repo>/<app>` |
| Pages | `https://<owner>.github.io/<repo>/` |
| Compose | `http://localhost:3080` |
| Serve | `http://localhost:3000` |

## Avvio
## Test
## Release
## Pages
## Albero
## Prodotto          ← solo qui contenuti di dominio (gioco, API, …)
## Documenti
```

Regole:

- Comandi veri, già sostituiti (niente `<app>` nel README di un repo vero).
- Screenshot in `docs/assets/`, linkati dal README.
- Setup Pages una tantum: una riga + puntatore alla sezione 8 di questo file, non copiare tutti i `gh api`.
- Dettaglio di prodotto (regolamento, cataloghi, ADR) in `docs/`, con link dal README. Il README non diventa il GDD.
