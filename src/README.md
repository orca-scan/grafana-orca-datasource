# Orca Scan Grafana Data Source

Connect Orca Scan sheets to Grafana. Paste an Orca REST API key, choose a sheet, and display the rows inside Grafana panels.

<img src="/public/plugins/orcascan-orcascan-datasource/img/sheet-dashboard.png" alt="Inventory overview" width="100%" />

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

1. Download the latest release from https://github.com/orca-scan/grafana-orca-datasource/releases.
2. Extract `orcascan-orcascan-datasource-<version>.zip` into the Grafana plugins directory.  
   - Linux package: `/var/lib/grafana/plugins`  
   - Docker: mount the extracted directory to `/var/lib/grafana/plugins`
3. Set `GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=orcascan-orcascan-datasource` (or add the same setting to `grafana.ini`).
4. Restart Grafana.

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
│   │   ├── ConfigEditor.tsx       # API key entry
│   │   └── QueryEditor.tsx        # sheet selector and time field input
│   ├── datasource.ts              # frontend datasource logic
│   ├── module.ts                  # Grafana registration
│   └── plugin.json                # plugin metadata copied to dist
├── pkg
│   ├── main.go                    # backend entry point and resource handlers
│   └── models                     # shared structures
├── dist                           # built frontend bundle + backend binary
└── docker-compose.yaml            # local Grafana container
```

## Development

```bash
git clone https://github.com/orca-scan/grafana-orca-datasource
cd grafana-orca-datasource
npm ci
npm run dev            # frontend hot reload
GOOS=linux GOARCH=amd64 go build -o dist/gpx_orca_scan ./pkg
docker compose up -d   # run Grafana locally with the plugin mounted
```

- `npm run build` compiles the production frontend bundle into `dist/`.
- `npm run lint`, `npm run typecheck`, `npm run test:ci` cover checks.
- `go test ./pkg/...` executes backend tests.

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
