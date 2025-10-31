# Orca Scan Grafana Data Source

Grafana datasource plugin that connects directly to the Orca Scan REST API. Add your Orca API key, pick a sheet, choose an optional time column, and build panels as time series or tables without writing Glue code.

Plugin ID: `orcascan-orcascan-datasource`

---

## Highlights
- Securely calls Orca Scan REST endpoints with your API key.
- Lists sheets and fields so dashboards can be configured entirely inside Grafana.
- Converts Orca time strings into Grafana timestamps for range filtering.
- Normalises numeric fields even if the Orca column is stored as text.
- Splits GPS location columns into latitude/longitude with full decimal precision so Geomap visualisations work out of the box.

---

## Requirements
- Orca Scan account with access to the target sheets.
- Orca API key with permission to list sheets, read fields, and read rows.
- Grafana 10.4 or newer (tested against 10.4.6).

---

## Quick Start (development)

```bash
nvm use 22              # or your preferred Node 22 runtime
npm ci                  # install frontend deps
npm run build           # produce dist/module.js + plugin.json etc.

GOOS=linux GOARCH=amd64 go build -o dist/gpx_orca_scan ./pkg
chmod +x dist/gpx_orca_scan

docker compose up -d    # starts grafana/grafana:10.4.6 with ./dist mounted
```

Visit http://localhost:3000 (admin / admin), add “Orca Scan” as a data source, and paste your API key.

Restart Grafana after rebuilding either frontend or backend:

```bash
docker compose restart grafana
```

To verify the mounted plugin inside the container:

```bash
docker exec -it orcascan-orcascan-datasource-grafana-1 sh -lc '
  ls -l /var/lib/grafana/plugins/orcascan-orcascan-datasource
  file /var/lib/grafana/plugins/orcascan-orcascan-datasource/gpx_orca_scan
  sed -n "1,80p" /var/lib/grafana/plugins/orcascan-orcascan-datasource/plugin.json
'
```

---

## Project Layout
- `pkg/` — Go backend that handles `/resources/*` requests and talks to Orca Scan.
- `src/` — React/TypeScript frontend (config + query editors).
- `dist/` — Grafana-ready bundle after running the build commands above.
- `docker-compose.yaml` — Dev Grafana instance mounting `dist/`.

---

## Testing & QA
Automated coverage is still being built out. Until unit tests land:
- Exercise Save & Test (ping), sheet dropdown, and query workflow inside Grafana.
- Check time series panels respect Grafana’s time range by selecting a time column.
- Confirm numeric totals in table footer for fields that look numeric in Orca.
- Validate Geomap lat/lon outputs show precise coordinates without manual overrides.

Future tests to consider (tracked internally):
- Go unit tests for decimal detection and GPS parsing helpers.
- Jest tests for datasource frame-building logic to lock expected field configs.

---

## Publishing Checklist
1. Create production builds (`npm run build`, go build for linux/amd64) and sign the plugin using Grafana’s signer (`@grafana/sign-plugin`). Grafana Marketplace only accepts signed archives.
2. Tag a release (e.g. `npm version` + `git push --follow-tags`).
3. Generate the plugin zip (dist contents + signed manifest) and submit to Grafana, or distribute privately.
4. Optional: produce additional architecture binaries (`GOOS=linux GOARCH=arm64`) if you need to support non-amd64 deployments.

Refer to Grafana’s [plugin publishing guide](https://grafana.com/developers/plugin-tools/publish-a-plugin/) for the latest steps.

---

## Support
- Orca Scan REST API docs: https://orcascan.com/guides/rest-api-f09a21c3
- Contact Orca Scan: https://orcascan.com/contact
- Report issues: open a ticket via your usual Orca support channel.
