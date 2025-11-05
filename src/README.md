# Orca Scan

![Version](https://img.shields.io/badge/version-1.0.8-blue?style=flat-square)
![Grafana](https://img.shields.io/badge/Grafana-%3E%3D10.4.0-orange?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

Monitor your Orca Scan sheets directly from Grafana. Use your API key once, pick a sheet, and start visualising barcode activity alongside the rest of your dashboards.

<img src="/public/plugins/orcascan-orcascan-datasource/img/sheet-dashboard.png" alt="Inventory overview" width="100%" />

## What you get

- Sheet discovery with live field metadata
- Secure API key storage inside Grafana
- Time-series readiness for timestamped sheets
- Numeric and geo fields normalised for panels, alerts, and maps

## Getting started

1. Click **Add new data source** in Grafana and select the Orca Scan data source card.
2. On the Settings tab, paste your Orca API key into the API key field.
3. Click **Save & test**. You should see “Connection successful. Orca Scan data source is ready to use.”
4. Build a dashboard or open Explore to run queries. Pick your sheet, run the query, and start visualising your data.

## Current status

The plugin is in active development. Core scenarios such as sheet browsing, table views, and time-series dashboards are ready for everyday use. We iterate in public, so if something is missing, reach out via the support links below.

## Helpful links

- [Orca Scan API guide](https://orcascan.com/guides/rest-api-f09a21c3)
- [Support](https://orcascan.com/contact)
- [License](https://raw.githubusercontent.com/orca-scan/grafana-orca-datasource/main/LICENSE)
