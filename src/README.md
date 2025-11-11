# Orca Scan Grafana Data Source

Connect Orca Scan sheets to Grafana. Paste your Orca Scan REST API key, choose a sheet, and display the rows inside Grafana panels.

## Table of contents

- [Installation](#installation)
- [Configuration](#configuration)
- [Query](#query)
- [Features](#features)
- [Directory structure](#directory-structure)
- [Development](#development)
- [Packaging](#packaging)
- [Support](#support)
- [Licence](#licence)

## Installation (macOS, Docker)

Follow these steps once on a Mac to run Grafana and the Orca Scan plugin via Docker.

1. **Install prerequisites.**
   - Install Homebrew if you do not already have it:
     ```bash
     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
     ```
   - Install Docker Desktop via Homebrew and start it:
     ```bash
     brew install --cask docker
     open -a Docker
     ```
   - Install Node.js and Go via Homebrew (needed for local builds):
     ```bash
     brew install node
     brew install go
     ```

2. **Clone the repo and install dependencies.**
   ```bash
   git clone https://github.com/orca-scan/grafana-orca-datasource
   cd grafana-orca-datasource
   npm ci
   ```

3. **Build the plugin bundle (frontend + backend).**
   ```bash
   npm run build
   GOOS=linux GOARCH=amd64 go build -o dist/gpx_orca_scan ./pkg
   ```

4. **Run Grafana using Docker Compose.**
   ```bash
   docker compose up -d
   ```
   This starts Grafana on http://localhost:3000 with the Orca Scan plugin mounted from `./dist` and `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS` already set inside the container.


## Configuration

1. Open http://localhost:3000 (default user `admin`, password `admin`).
2. Go to Connections → Data sources → Add new data source and select Orca Scan.
3. Paste your Orca Scan API key (Orca Scan → Account Settings → API Key → Copy).
4. Click Save and test. The datasource is ready when Grafana reports success.

## Query

1. Open any panel or Explore view and pick Orca Scan as the data source.
2. Choose a sheet from the dropdown. The plugin fetches sheet fields automatically.
3. Optional: enter the time field Grafana should treat as the timestamp. Leave blank to fetch tables.
4. Run the query. Each Orca row becomes a Grafana row. Invalid values resolve to null so charts remain stable.
5. Apply Grafana transformations if you need joins, calculated fields or sorting.

## Features

- Grafana stores the Orca API key in its encrypted settings.
- The Query Editor lists Orca sheets and their fields.
- Pick a time field when a panel needs a time axis.
- Numeric, boolean, time and latitude or longitude values are detected automatically.
- Add more data sources if you need to connect extra Orca accounts.

## Directory structure

```
.
├── src
│   ├── components
│   │   ├── ConfigEditor.tsx       # UI where the Orca Scan API key is stored
│   │   └── QueryEditor.tsx        # UI where the sheet and time field are selected
│   ├── datasource.ts              # calls backend resources, maps rows to Grafana data frames
│   ├── module.ts                  # registers the datasource so Grafana can load it
│   └── plugin.json                # plugin metadata bundled into dist
├── pkg
│   ├── main.go                    # Go backend that calls the Orca Scan REST API and serves /resources/*
│   └── models                     # shared Go structures for settings and query payloads
├── dist                           # built frontend bundle + backend binary that Grafana executes
└── docker-compose.yaml            # local Grafana container mounting ./dist
```

## Development

```bash
npm run dev
npm run lint
npm run typecheck
npm run test:ci
GOOS=linux GOARCH=amd64 go test ./pkg/...
```

- `npm run build` creates the production bundle in `dist/`.

## Packaging

1. Run `npm run build`.
2. Build the backend binary: `GOOS=linux GOARCH=amd64 go build -o dist/gpx_orca_scan ./pkg`.
3. Create a directory named `orcascan-orcascan-datasource/` and copy the contents of `dist/` into it.
4. Zip the folder:  
   `cd package && zip -r ../orcascan-orcascan-datasource-<version>.zip orcascan-orcascan-datasource`
5. Upload the zip to the matching GitHub release.

## Support

- Guides: https://orcascan.com/guides/rest-api-f09a21c3
- Contact: https://orcascan.com/contact
- Issues: https://github.com/orca-scan/grafana-orca-datasource/issues

## Licence

[MIT License](LICENSE) © Orca Scan – a [barcode app](https://orcascan.com) with [barcode tracking APIs](https://orcascan.com/guides?tag=for-developers).
