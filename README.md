# Orca Scan Grafana Data Source

![Version](https://img.shields.io/badge/version-1.0.7-blue?style=flat-square)
![Grafana](https://img.shields.io/badge/Grafana-%3E%3D10.4.0-orange?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

Plugin ID: `orcascan-orcascan-datasource`

The Orca Scan data source lets Grafana users visualise live barcode capture data without leaving the Orca ecosystem. Authenticate with your Orca API key, pick a sheet, select the time field you care about, and you are ready to build dashboards.

---

## Features
- **Sheet discovery** – list available sheets and fields directly from the Orca API.
- **Secure API key auth** – Grafana stores the key in its encrypted secrets store.
- **Time-series ready** – timestamps are normalised so Grafana’s time range picker works out of the box.
- **Smart numbers** – text fields that contain numbers are coerced to numeric types so you can calculate totals and averages.
- **Geo support** – GPS columns are expanded into latitude and longitude fields for Geomap visualisations.

---

## Try it

- Import `provisioning/dashboards/orca-scan-sample.json` into Grafana once your Orca Scan data source is configured. Replace the placeholder sheet ID and time field in the sample query with values from your workspace.
- Want it to appear automatically? Map `./provisioning` to `/etc/grafana/provisioning` in your Grafana container so the sample dashboard ships pre-loaded.

---

## Getting Started

1. **Prepare your API key**
   - Log in to Orca Scan and create an API key with access to the sheets you want to expose.

2. **Install the plugin**
   - Clone this repository and build locally (see the Development section), or install the signed release in Grafana.

3. **Add the data source in Grafana**
   - Navigate to *Connections → Data sources → Add data source → Orca Scan*.
   - Paste your API key and click **Save & test** – you should see “Connection successful. Orca Scan data source is ready to use.”

4. **Build dashboards**
   - Select the sheet you want to query, choose an optional time field, and apply any transformations you need inside Grafana.
   - Optional: import the sample dashboard from `provisioning/dashboards/orca-scan-sample.json` (or mount `./provisioning` for auto-provisioning) to get a ready-made table panel you can tweak.

---

## Overview

The Orca Scan data source plugin connects your Orca Scan sheets to Grafana so you can visualise barcode activity, inventory levels, and field updates alongside the rest of your monitoring stack. Authenticate with an API key, pick a sheet, and start exploring your data within minutes.

## Project status

This plugin is under active development. We are prioritising the most common Orca Scan workflows first (sheet browsing, time-series dashboards, inventory tables). If you encounter issues or have feature requests, please reach out through the support channels listed below. Feedback helps us plan the next iteration.

## See also

- [Technical documentation](https://orcascan.com/guides/rest-api-f09a21c3)
- [License](./LICENSE)

---

## Development Workflow

```bash
nvm use 22
npm ci
npm run build              # frontend bundle

GOOS=linux GOARCH=amd64 go build -o dist/gpx_orca_scan ./pkg

docker compose up -d       # spins up Grafana with the plugin mounted
```

- Grafana UI: http://localhost:3000 (admin/admin)
- Rebuild backend or frontend and restart Grafana when changes are made:

  ```bash
  docker compose restart grafana
  ```

- To auto-provision the sample dashboard during local development, add this volume to `docker-compose.yaml`:

  ```yaml
  volumes:
    - ./provisioning:/etc/grafana/provisioning
  ```

- Quick sanity check inside the container:

  ```bash
  docker exec orcascan-orcascan-datasource-grafana-1 \
    ls -l /var/lib/grafana/plugins/orcascan-orcascan-datasource
  ```

---

## Repository Layout

| Path | Description |
| --- | --- |
| `pkg/` | Go backend handlers for `/resources/*` requests. |
| `src/` | React/TypeScript frontend (config editor, query editor, datasource logic). |
| `dist/` | Bundled plugin that Grafana loads. |
| `docker-compose.yaml` | Local Grafana instance mounting `dist/`. |

---

## Helpful Links

- Documentation: https://orcascan.com/guides/rest-api-f09a21c3
- Support & contact: https://orcascan.com/contact
- GitHub repository: https://github.com/orca-scan/grafana-orca-datasource
- Raise an issue: https://github.com/orca-scan/grafana-orca-datasource/issues
- Orca Scan homepage: https://orcascan.com

---

## Publishing Checklist

1. `npm run build`
2. `GOOS=linux GOARCH=amd64 go build -o dist/gpx_orca_scan ./pkg`
3. `npm run sign` with your Grafana access policy token
4. `npm version <major|minor|patch>` and `git push --follow-tags`
5. Upload the signed zip to Grafana for review or distribute privately.

Refer to Grafana’s [publishing guide](https://grafana.com/developers/plugin-tools/publish-a-plugin/) for detailed steps.

---

## Need Help?

If you run into issues configuring the plugin, drop us a line at [Orca Scan Support](https://orcascan.com/contact) or open a GitHub issue. We are happy to help you get from barcode scans to Grafana dashboards.
