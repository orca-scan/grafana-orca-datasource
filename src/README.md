# Orca Scan

![Version](https://img.shields.io/badge/version-1.0.7-blue?style=flat-square)
![Grafana](https://img.shields.io/badge/Grafana-%3E%3D10.4.0-orange?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

Monitor your Orca Scan sheets directly from Grafana. Use your API key once, pick a sheet, and start visualising barcode activity alongside the rest of your dashboards.

<img src="/public/plugins/orcascan-orcascan-datasource/img/sheet-dashboard.png" alt="Inventory overview" width="100%" />

## What you get

- Sheet discovery with live field metadata
- Secure API key storage inside Grafana
- Time-series readiness for timestamped sheets
- Numeric and geo fields normalised for panels, alerts, and maps

## Try it

- Import `provisioning/dashboards/orca-scan-sample.json` into Grafana after configuring the data source. Replace the placeholder sheet ID and time field with values from your own workspace.
- Prefer an automatic setup? Map `./provisioning` to `/etc/grafana/provisioning` in your Grafana instance so the sample ships pre-loaded.

## Current status

The plugin is in active development. Core scenarios—sheet browsing, table views, and time-series dashboards—are ready for everyday use. We iterate in public, so if something is missing, reach out via the support links below.

## Helpful links

- [Orca Scan API guide](https://orcascan.com/guides/rest-api-f09a21c3)
- [Support](https://orcascan.com/contact)
- [License](https://raw.githubusercontent.com/orca-scan/grafana-orca-datasource/main/LICENSE)
