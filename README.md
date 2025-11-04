# Orca Scan Grafana Data Source

![Version](https://img.shields.io/badge/version-1.0.7-blue?style=flat-square)
![Grafana](https://img.shields.io/badge/Grafana-%3E%3D10.4.0-orange?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

## What this project is

`orcascan-orcascan-datasource` is the officially supported, open-source Grafana data source for [Orca Scan](https://orcascan.com). It lets any Grafana instance query Orca Scan sheets over secure API calls so barcode activity, inventory, and field updates can be analysed alongside the rest of your observability stack.

## Local setup

### 1. Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 22.x | Compile the React frontend (`npm ci`, `npm run build`). |
| npm | 10.x | Ships with Node 22; used for scripts and validator. |
| Go | 1.24.6 | Required by Grafana Plugin SDK `v0.281.0`. |
| Docker & Docker Compose | Latest | Runs Grafana locally identical to production. |
| Orca Scan API key | Business plan or higher | Grants access to real sheets during testing. |

Suggested install commands (macOS example using Homebrew and nvm):

```bash
# Node & npm
brew install nvm
nvm install 22
nvm use 22

# Go
brew install go@1.24
echo 'export PATH="/opt/homebrew/opt/go@1.24/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# Docker Desktop
brew install --cask docker
open -a Docker
```

Verify tool versions before continuing:

```bash
node -v      # v22.x
npm -v       # 10.x
go version   # go1.24.6
```

### 2. Clone the repository

```bash
git clone https://github.com/orca-scan/grafana-orca-datasource.git
cd grafana-orca-datasource/orcascan-orcascan-datasource
# optional: add the private remote if you push internally
# git remote add orca git@github.com:orca-scan/grafana-orca-datasource.git
```

### 3. Install dependencies and build once

```bash
nvm use 22
npm ci
npm run build

go run github.com/magefile/mage@v1.15.0 build:linux
mv dist/gpx_orca_scan_linux_amd64 dist/gpx_orca_scan
```

Those commands populate `node_modules/`, emit the frontend bundle, and build a Linux/amd64 backend binary (Grafana runs on Linux). The rename to `gpx_orca_scan` is required—Grafana executes that filename.

### 4. Launch Grafana with the plugin mounted

```bash
open -a Docker   # ensure Docker Desktop is running
docker compose up -d
```

Grafana starts on [http://localhost:3000](http://localhost:3000) (credentials `admin/admin`) and loads the plugin straight from `dist/`.

### 5. Configure the Orca Scan data source

1. In Grafana go to **Connections → Data sources → Add data source → Orca Scan**.
2. Paste an Orca API key under **Secure JSON Data → API key**.
3. Click **Save & test** and expect the “pong” message.
4. Optional: import `provisioning/dashboards/orca-scan-sample.json` (or mount `./provisioning:/etc/grafana/provisioning`) to load the sample dashboard.
5. Edit the sample panel to swap in your sheet ID and time field, then run the query.

Restart Grafana after every backend rebuild:

```bash
docker compose restart grafana
```

### 6. Day-to-day development

| Action | Command |
| --- | --- |
| Frontend hot reload | `npm run dev` |
| Frontend tests | `npm run test:ci` |
| Frontend lint & types | `npm run lint` · `npm run typecheck` |
| Backend rebuild (Linux target) | `go run github.com/magefile/mage@v1.15.0 build:linux` |
| Backend tests | `go test ./pkg/...` or `go run github.com/magefile/mage@v1.15.0 coverage` |

### 7. Package for review or release

```bash
npm run build
go run github.com/magefile/mage@v1.15.0 build:linux
mv dist/gpx_orca_scan_linux_amd64 dist/gpx_orca_scan
mkdir -p package/orcascan-orcascan-datasource
cp -R dist/. package/orcascan-orcascan-datasource/
(cd package && zip -r ../orcascan-orcascan-datasource-<version>.zip orcascan-orcascan-datasource)
shasum -a 1 orcascan-orcascan-datasource-<version>.zip
npx @grafana/plugin-validator@latest orcascan-orcascan-datasource-<version>.zip
```

Replace `<version>` with the value in `src/plugin.json`. Upload the ZIP to GitHub Releases and submit the SHA1 when handing the build to Grafana for review.

## How it works (end-to-end)

1. Grafana loads the plugin bundle from `dist/`.
2. The React frontend (`src/`) uses `getBackendSrv()` to call `/api/datasources/uid/<uid>/resources/*`.
3. The Go backend (`pkg/`) serves those resource routes, validates the API key, and calls the Orca Scan REST API (`https://api.orcascan.com/v1`).
4. Responses are reshaped into Grafana data frames (tables or time series). Numeric detection, time parsing, and GPS splitting happen here.
5. Grafana renders the result; cached metadata keeps follow-up queries fast.

Conceptual diagram:

```
Grafana UI (React) ─┬─┬─> /resources/ping  → Go backend → Orca Scan API
                    │ │
                    │ └─> /resources/sheets → list sheets & fields
                    └───> /resources/query  → rows → Grafana data frames
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/` | TypeScript/React UI (datasource class, config editor, query editor, shared types, static assets). |
| `pkg/` | Go backend implementing Grafana Plugin SDK handlers and Orca REST integration. |
| `pkg/models/` | Settings and query structs shared across the boundary. |
| `provisioning/` | Sample dashboard that demonstrates the plugin. |
| `dist/` | Build output consumed by Grafana. |
| `docker-compose.yaml` | Local Grafana instance wired to load the plugin from `dist/`. |
| `Magefile.go` | Delegates to Grafana SDK mage targets (build, test, manifest). |

## Understanding the code

### Backend (`pkg/`)

- `main.go` registers the datasource service, query handler, health check, and resource endpoints (`/ping`, `/sheets`, `/fields`, `/query`).
- `handleSheets`, `handleFields`, `handleQuery` forward authenticated requests to Orca Scan and normalise the responses.
- Helpers detect numeric strings, parse timestamps, and expand GPS fields into `<field>_lat`/`<field>_lon` columns.
- Tests: `go test ./pkg/...` or `go run github.com/magefile/mage@v1.15.0 coverage`.

### Frontend (`src/`)

- `datasource.ts` extends Grafana’s `DataSourceApi` and bridges to the backend resource endpoints.
- `components/ConfigEditor.tsx` captures API key, sheet selection, and time field.
- `components/QueryEditor.tsx` models filters, pagination, and preview data.
- `types.ts` defines the shared shapes (`OrcaQuery`, `OrcaFieldInfo`, etc.) to keep TS and Go aligned.
- `img/sheet-dashboard.png` plus `src/README.md` supply Grafana catalog assets.

### Why open source?

- **Transparency:** reviewers can audit how credentials are handled and how data is transformed.
- **Maintainability:** CI/CD and release steps are reproducible; community patches can be merged confidently.
- **Extensibility:** the Orca API evolves quickly, and this plugin provides a template for new endpoints or custom transformations without distributing opaque binaries.

## Common tasks

| Task | Command |
| --- | --- |
| Type check frontend | `npm run typecheck` |
| Lint | `npm run lint` |
| Run frontend tests | `npm run test:ci` |
| Run backend tests | `go test ./pkg/...` or `go run github.com/magefile/mage@v1.15.0 coverage` |
| Rebuild backend for macOS (debugging) | `go run github.com/magefile/mage@v1.15.0 build:darwinARM64` |
| Clean build artefacts | `go run github.com/magefile/mage@v1.15.0 clean` |

## Troubleshooting checklist

- **404 on Save & Test**: Ensure `dist/gpx_orca_scan` is Linux/amd64—Grafana inside Docker cannot execute macOS binaries.
- **“Unexpected token 'o'” in Grafana UI**: The backend returned plain text. Confirm `GOOS=linux GOARCH=amd64` builds and that `plugin.json` points to `gpx_orca_scan`.
- **Go manifest mismatch during submission**: Rebuild the backend with `mage build:linux` after editing Go code so `go_plugin_build_manifest` hashes align.
- **Screenshot missing warning**: Keep `src/img/sheet-dashboard.png` committed; it is copied into `dist/img/` during `npm run build`.
- **API key rejected**: Orca REST keys are available on Business plans or higher. Validate with `curl -H "Authorization: Bearer <KEY>" https://api.orcascan.com/v1/sheets`.

## Support and feedback

- Documentation: <https://orcascan.com/guides/rest-api-f09a21c3>
- Support: <https://orcascan.com/contact>
- Issues & feature requests: <https://github.com/orca-scan/grafana-orca-datasource/issues>
- License: [MIT](./LICENSE)

If you extend the plugin (new filters, alerting support, sheet caching strategies, etc.), open a pull request so the wider Orca community benefits.
