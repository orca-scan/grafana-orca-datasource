# Orca Scan Grafana Data Source

Connect Orca Scan sheets to Grafana. Paste an Orca REST API key, choose a sheet, and display the rows inside Grafana panels.


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

## Installation

1. Install Grafana on macOS: `brew install grafana` then `brew services start grafana`.
2. Download the latest release from https://github.com/orca-scan/grafana-orca-datasource/releases.
3. Extract `orcascan-orcascan-datasource-<version>.zip` into `/usr/local/var/lib/grafana/plugins` (create this directory if needed).
4. Allow the plugin by running `export GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=orcascan-orcascan-datasource` before restarting Grafana, or add `allow_loading_unsigned_plugins = orcascan-orcascan-datasource` under `[plugins]` in `/usr/local/etc/grafana/grafana.ini`.
5. Restart Grafana: `brew services restart grafana`.
6. Optional (build from source): clone this repo, run `npm ci && npm run build`, run `GOOS=linux GOARCH=amd64 go build -o dist/gpx_orca_scan ./pkg`, and copy `dist/` into `/usr/local/var/lib/grafana/plugins/orcascan-orcascan-datasource`.
7. Optional (Docker, alternative to steps 1–5): run `docker compose up -d` from this repo. This starts Grafana in a container with `./dist` mounted into `/var/lib/grafana/plugins/orcascan-orcascan-datasource` and exposes Grafana on http://localhost:3000.

## Configuration

1. In Grafana open Connections → Data sources → Add new data source.
2. Select Orca Scan.
3. Paste an Orca API key (create one in Orca Scan under Account → REST API).
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
│   │   ├── ConfigEditor.tsx       # UI where the Orca API key is stored
│   │   └── QueryEditor.tsx        # UI where the sheet and time field are selected
│   ├── datasource.ts              # calls backend resources, maps rows to Grafana data frames
│   ├── module.ts                  # registers the datasource so Grafana can load it
│   └── plugin.json                # plugin metadata bundled into dist
├── pkg
│   ├── main.go                    # Go backend that calls the Orca API and serves /resources/*
│   └── models                     # shared Go structures for settings and query payloads
├── dist                           # built frontend bundle + backend binary that Grafana executes
└── docker-compose.yaml            # local Grafana container mounting ./dist
```

## Development

```bash
git clone https://github.com/orca-scan/grafana-orca-datasource
cd grafana-orca-datasource
npm ci
npm run dev
GOOS=linux GOARCH=amd64 go build -o dist/gpx_orca_scan ./pkg
docker compose up -d
```

- `npm run build` creates the production bundle in `dist/`.
- `npm run lint`, `npm run typecheck`, `npm run test:ci` run frontend checks.
- `go test ./pkg/...` runs backend tests.

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

[MIT Licence](LICENSE) © Orca Scan, the barcode scanner app for iOS, Android and the web.
