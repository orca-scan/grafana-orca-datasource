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

| Step | Command | Purpose |
| --- | --- | --- |
| Build frontend | `npm run build` | Produces the bundled React assets in `dist/`. |
| Build backend | `go run github.com/magefile/mage@v1.15.0 build:linux` | Compiles the Linux/amd64 backend executable. |
| Rename binary | `mv dist/gpx_orca_scan_linux_amd64 dist/gpx_orca_scan` | Matches the executable name expected by Grafana. |
| Stage artefacts | `mkdir -p package/orcascan-orcascan-datasource`<br>`cp -R dist/. package/orcascan-orcascan-datasource/` | Copies everything Grafana needs into a single folder named after the plugin ID. |
| Zip | `(cd package && zip -r ../orcascan-orcascan-datasource-<version>.zip orcascan-orcascan-datasource)` | Creates the distributable archive (replace `<version>` with `src/plugin.json`'s version). |
| Generate checksum | `shasum -a 1 orcascan-orcascan-datasource-<version>.zip` | Produces the SHA1 hash required by Grafana’s submission form. |
| Validate | `npx @grafana/plugin-validator@latest orcascan-orcascan-datasource-<version>.zip` | Runs Grafana’s validator to catch blocking issues before submission. |

Upload the ZIP to GitHub Releases and paste both the download URL and SHA1 into the Grafana submission form.

## How it works (end-to-end)

1. **Plugin load** – Grafana reads `dist/plugin.json` and spins up the React bundle plus the `dist/gpx_orca_scan` Go backend.
2. **Frontend requests** – `src/datasource.ts` calls Grafana’s proxy endpoints (e.g. `/api/datasources/uid/<uid>/resources/ping`, `/resources/sheets`, `/resources/fields`, `/resources/query`). Grafana forwards those calls to the backend binary.
3. **Backend routing** – `pkg/main.go` handles the `/ping`, `/sheets`, `/fields`, and `/query` routes. It pulls the decrypted API key from Grafana, then talks to the Orca Scan REST API (`GET /v1/sheets`, `/v1/sheets/{id}/fields`, `/v1/sheets/{id}/rows`).
4. **Data shaping** – Orca's field metadata is respected: numeric/date/boolean/gps types stay as declared. Only string fields are re-checked against row samples; if every value parses cleanly as number/boolean/time/GPS we promote that type so Grafana can chart it. GPS values keep their original string and gain `<field>_lat`/`<field>_lon` helper columns, and we record decimal precision for sensible formatting.
5. **Frames to UI** – The backend returns rows plus descriptors; the frontend converts them into Grafana data frames, applies client-side equality filters from `QueryEditor`, and honours the chosen time field.
6. **Dashboard render** – Grafana caches sheet/field metadata and renders panels. Re-queries reuse cache until TTL expiry or manual refresh.

Conceptual flow (files noted at each step):

```
Grafana connector catalog (Grafana UI)
        │
        ▼
User clicks “Orca Scan” datasource card
        │  (React bundle in dist/module.js registered from src/module.ts)
        ▼
Config screen (src/components/ConfigEditor.tsx)
  → calls src/datasource.ts.saveJsonData & saveSecureJsonData
  → Grafana persists jsonData / secureJsonData in its database
        │
        ▼
Frontend datasource (src/datasource.ts)
  → testDatasource() → GET /api/datasources/uid/<uid>/resources/ping
  → listSheets()      → GET /resources/sheets
  → listFields()      → GET /resources/fields
  → query()           → POST /resources/query
        │  (Grafana proxy forwards /resources/* to the backend executable)
        ▼
Go backend (pkg/main.go)
  → handlePing / handleSheets / handleFields / handleQuery
  → uses decrypt secure JSON data from backend.PluginContext
  → calls Orca REST API:
        • GET https://api.orcascan.com/v1/sheets
        • GET https://api.orcascan.com/v1/sheets/{id}/fields
        • GET https://api.orcascan.com/v1/sheets/{id}/rows
  → classify fields (classifyField + detectKindFromRows)
  → expandGeoColumns / normalizeRows / applyClientFilters
        │
        ▼
Response to frontend (src/datasource.ts)
  → toDataFrames() builds Grafana data frames (tables/time series)
        │
        ▼
Grafana panels display results; metadata (sheet list, fields) cached until refresh
```

## Repository layout

| Path | Purpose |
| --- | --- |
| `src/datasource.ts` | Entry point for the frontend datasource. Defines how Grafana calls the backend (`getBackendSrv().get/post`). |
| `src/components/ConfigEditor.tsx` | UI for API key entry, sheet picker, and time-field selection. |
| `src/components/QueryEditor.tsx` | Query builder that captures filters, limit/skip, and kicks off previews. |
| `src/types.ts` | Shared TypeScript models that mirror the Go structs. |
| `pkg/main.go` | Backend service registered with the Grafana Plugin SDK (resource handlers, query handler, health check). |
| `pkg/models/` | Go structs for datasource settings and resource payloads. |
| `provisioning/dashboards/orca-scan-sample.json` | Importable dashboard demonstrating table usage. |
| `dist/` | Output directory served by Grafana (frontend bundle, backend binary, manifest). |
| `docker-compose.yaml` | Local Grafana 10.4.6 instance mounting `dist/`. |
| `Magefile.go` | Thin wrapper that exposes Grafana’s mage targets (build, test, manifest). |

## Understanding the code

### Backend (`pkg/`)

- **Plugin bootstrap** (`pkg/main.go`) – starts the datasource service, sets up resource routes, and provides `QueryData`/`CheckHealth` handlers via the Grafana Plugin SDK.
- **Resource handlers** – `/ping`, `/sheets`, `/fields`, `/query` live in `pkg/main.go`. Each pulls the secure API key from `backend.PluginContext`, calls Orca, and marshals the response back to Grafana.
- **Field typing & caching** – `fetchFields` caches Orca field definitions per sheet. Initial types come from Orca metadata; `detectKindFromRows` only promotes plain text fields when sample rows consistently parse as number/boolean/time/GPS.
- **Row pipeline** – `handleQuery` uses `expandGeoColumns`, `normalizeRows`, and `applyClientFilters` to add helper columns, coerce values, and apply equality filters before returning rows + descriptors to the frontend.
- **Tests** – execute with `go test ./pkg/...` or `go run github.com/magefile/mage@v1.15.0 coverage`.

### Frontend (`src/`)

- **Datasource class** (`src/datasource.ts`) – implements Grafana’s `DataSourceApi`; all resource calls flow through `getBackendSrv()` to `/resources/*` endpoints exposed by the backend.
- **Frame construction** – `toDataFrames` consumes the backend payload, respects provided metadata, keeps detected decimals, and expands GPS helper fields alongside the original values.
- **UI** – `components/ConfigEditor.tsx` handles API key/time-field selection; `components/QueryEditor.tsx` manages filters and pagination and triggers `query()`; both consume the datasource class.
- **Shared contracts** – `src/types.ts` mirrors Go structs so both sides agree on payload shapes.

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
