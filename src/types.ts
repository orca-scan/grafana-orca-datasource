import type { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface OrcaDataSourceOptions extends DataSourceJsonData {
  // We won't show this in the UI; backend will default if empty.
  baseUrl?: string;
}

export interface OrcaSecureJsonData {
  apiKey?: string;
}

/** Must extend DataQuery so Grafana supplies refId/hide/etc. */
export interface OrcaQuery extends DataQuery {
  sheetId?: string;
  limit?: number;
  skip?: number;
  timeField?: string;
  filters?: Array<{ key: string; value: string }>;
  range?: { from?: string; to?: string };
}

export type OrcaGrafanaType = 'string' | 'number' | 'boolean' | 'time';

export interface OrcaFieldInfo {
  key: string;
  label?: string;
  type?: string;
  format?: string;
  grafanaType: OrcaGrafanaType;
  isTime?: boolean;
  decimals?: number;
}

export interface OrcaQueryResponse {
  rows: Array<Record<string, any>>;
  fields: OrcaFieldInfo[];
  refId: string;
  sheetId: string;
  timeField?: string;
  message?: string;
}
