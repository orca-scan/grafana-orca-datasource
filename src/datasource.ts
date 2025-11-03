import {
  DataFrame,
  DataSourceApi,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  Field,
  FieldType,
  FieldConfig,
  dateTime,
} from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import type { OrcaDataSourceOptions, OrcaFieldInfo, OrcaGrafanaType, OrcaQuery, OrcaQueryResponse } from './types';

export class DataSource extends DataSourceApi<OrcaQuery, OrcaDataSourceOptions> {
  uid: string;

  constructor(instanceSettings: DataSourceInstanceSettings<OrcaDataSourceOptions>) {
    super(instanceSettings);
    this.uid = instanceSettings.uid;
  }

  async testDatasource() {
    try {
      const res = await getBackendSrv().get(`/api/datasources/uid/${this.uid}/resources/ping`);
      if (res?.status !== 'ok') {
        const fallback = res?.message || res?.status || 'Connection test failed';
        return { status: 'error', message: fallback };
      }
      return {
        status: 'success',
        message: 'Connection successful. Orca Scan data source is ready to use.',
      };
    } catch (err: any) {
      const message = err?.data?.message || err?.statusText || err?.message || 'Error';
      return { status: 'error', message };
    }
  }

  async listSheets(): Promise<Array<{ _id: string; name: string }>> {
    const res = await getBackendSrv().get(`/api/datasources/uid/${this.uid}/resources/sheets`);
    return Array.isArray(res?.sheets) ? res.sheets : [];
  }

  async listFields(sheetId: string): Promise<OrcaFieldInfo[]> {
    if (!sheetId) {
      return [];
    }
    const res = await getBackendSrv().get(`/api/datasources/uid/${this.uid}/resources/fields`, { sheetId });
    return Array.isArray(res?.fields) ? res.fields : [];
  }

  async query(req: DataQueryRequest<OrcaQuery>): Promise<DataQueryResponse> {
    const active = req.targets.filter((t) => !t.hide);
    if (!active.length) {
      return { data: [] };
    }

    const range = req.range
      ? {
          from: req.range.from?.toISOString?.(),
          to: req.range.to?.toISOString?.(),
        }
      : undefined;

    const responses = await Promise.all(
      active.map((target) =>
        getBackendSrv().post(`/api/datasources/uid/${this.uid}/resources/query`, {
          query: {
            ...target,
            range,
          },
        }) as Promise<OrcaQueryResponse>
      )
    );

    const frames = responses.flatMap((res, idx) => this.toDataFrames(active[idx], res));
    return { data: frames };
  }

  async metricFindQuery(_query: string) {
    return [];
  }

  private toDataFrames(query: OrcaQuery, response: OrcaQueryResponse): DataFrame[] {
    const rows: Array<Record<string, any>> = Array.isArray(response?.rows) ? response.rows : [];
    const timeField = response?.timeField ?? query.timeField;
    const fieldInfos: OrcaFieldInfo[] =
      Array.isArray(response?.fields) && response.fields.length
        ? response.fields
        : this.buildFallbackFields(rows, timeField);

    const hasActiveTimeField = Boolean(timeField && fieldInfos.some((f) => f.key === timeField));
    const preferredVisualisation = hasActiveTimeField && rows.length ? 'graph' : 'table';

    const computedDecimals = this.computeDecimalMap(rows);

    const fieldPairs = fieldInfos.map((info) => {
        const config: FieldConfig = {};
        if (info.label && info.label !== info.key) {
          config.displayName = info.label;
        }
        const fieldType = this.mapGrafanaType(info.grafanaType);

        const decimals =
          typeof info.decimals === 'number'
            ? info.decimals
            : typeof computedDecimals[info.key] === 'number'
              ? computedDecimals[info.key]
              : undefined;
        if (fieldType === FieldType.number && typeof decimals === 'number' && decimals > 0) {
          config.decimals = decimals;
        }

        const field: Field = {
          name: info.key,
          type: fieldType,
          config,
          values: [] as any[],
        };

        return { info, fieldType, field };
      });

    rows.forEach((row) => {
      fieldPairs.forEach(({ info, fieldType, field }) => {
        let value = row[info.key];

        if (value === undefined && info.grafanaType === 'number') {
          if (info.key.toLowerCase().endsWith('_lat') || info.key.toLowerCase().endsWith('_lon')) {
            const baseKey = info.key.replace(/_(lat|lon)$/i, '');
            const parsed = this.parseGeo(row[baseKey]);
            if (parsed) {
              const decimals = info.key.toLowerCase().endsWith('_lat') ? parsed.latDecimals : parsed.lonDecimals;
              const numericValue = info.key.toLowerCase().endsWith('_lat') ? parsed.lat : parsed.lon;
              value = this.roundToDecimals(numericValue, decimals ?? 6);
            }
          }
        }

        (field.values as any[]).push(this.normalizeValue(value, fieldType));
      });
    });

    const frame: DataFrame = {
      refId: query.refId,
      name: query.sheetId ?? query.refId,
      meta: { preferredVisualisationType: preferredVisualisation },
      fields: fieldPairs.map(({ field }) => field),
      length: rows.length,
    };

    return [frame];
  }

  private buildFallbackFields(rows: Array<Record<string, any>>, timeField?: string): OrcaFieldInfo[] {
    const seen = new Set<string>();
    const order: OrcaFieldInfo[] = [];
    const decimalsMap = this.computeDecimalMap(rows);
    const geoInfoMap = this.detectGeoInfo(rows);

    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);

        const grafanaType = this.detectFallbackType(rows, key);
        const geoInfo = geoInfoMap[key];
        const isGeo = Boolean(geoInfo);

        const baseDecimals =
          grafanaType === 'number' && typeof decimalsMap[key] === 'number' && decimalsMap[key] > 0
            ? decimalsMap[key]
            : undefined;

        order.push({
          key,
          label: key,
          grafanaType,
          isTime: key === timeField || grafanaType === 'time',
          decimals: baseDecimals,
        });

        if (isGeo) {
          const latDecimals =
            geoInfo && typeof geoInfo.latDecimals === 'number' && geoInfo.latDecimals > 0
              ? geoInfo.latDecimals
              : undefined;
          const lonDecimals =
            geoInfo && typeof geoInfo.lonDecimals === 'number' && geoInfo.lonDecimals > 0
              ? geoInfo.lonDecimals
              : undefined;
          order.push({
            key: `${key}_lat`,
            label: `${key} Latitude`,
            grafanaType: 'number',
            decimals: latDecimals,
          });
          order.push({
            key: `${key}_lon`,
            label: `${key} Longitude`,
            grafanaType: 'number',
            decimals: lonDecimals,
          });
        }
      }
    }

    if (timeField) {
      const idx = order.findIndex((f) => f.key === timeField);
      if (idx > 0) {
        const [selected] = order.splice(idx, 1);
        order.unshift(selected);
      }
    }

    return order;
  }

  private computeDecimalMap(rows: Array<Record<string, any>>): Record<string, number> {
    const result: Record<string, number> = {};
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        const decimals = this.countDecimalsFromValue(value);
        if (decimals === undefined) {
          continue;
        }
        if (result[key] === undefined || decimals > result[key]) {
          result[key] = decimals;
        }
      }
    }
    return result;
  }

  private detectGeoInfo(rows: Array<Record<string, any>>): Record<string, { latDecimals: number; lonDecimals: number }> {
    const info: Record<string, { latDecimals: number; lonDecimals: number }> = {};
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        const parsed = this.parseGeo(value);
        if (!parsed) {
          continue;
        }
        const entry = info[key] ?? { latDecimals: 0, lonDecimals: 0 };
        if (parsed.latDecimals > entry.latDecimals) {
          entry.latDecimals = parsed.latDecimals;
        }
        if (parsed.lonDecimals > entry.lonDecimals) {
          entry.lonDecimals = parsed.lonDecimals;
        }
        info[key] = entry;
      }
    }
    return info;
  }

  private countDecimalsFromValue(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return undefined;
      }
      const asString = value.toString();
      return this.countDecimals(asString);
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return undefined;
      }
      const numeric = Number(trimmed);
      if (!Number.isFinite(numeric)) {
        return undefined;
      }
      return this.countDecimals(trimmed);
    }
    if (typeof value === 'object' && 'toString' in value) {
      return this.countDecimalsFromValue(value.toString());
    }
    return undefined;
  }

  private detectFallbackType(rows: Array<Record<string, any>>, key: string): OrcaGrafanaType {
    const maxSamples = 200;
    let evaluated = 0;
    let numeric = true;
    let boolean = true;
    let timeLike = true;
    let geoLike = true;

    for (const row of rows) {
      if (evaluated >= maxSamples) {
        break;
      }
      if (!(key in row)) {
        continue;
      }
      const value = row[key];
      if (value === null || value === undefined || value === '') {
        continue;
      }
      evaluated++;

      if (numeric && !this.valueLooksNumeric(value)) {
        numeric = false;
      }
      if (boolean && !this.valueLooksBoolean(value)) {
        boolean = false;
      }
      if (timeLike && !this.valueLooksTime(value)) {
        timeLike = false;
      }
      if (geoLike && !this.valueLooksGeo(value)) {
        geoLike = false;
      }

      if (!numeric && !boolean && !timeLike && !geoLike) {
        break;
      }
    }

    if (!evaluated) {
      return 'string';
    }
    if (numeric) {
      return 'number';
    }
    if (boolean) {
      return 'boolean';
    }
    if (timeLike) {
      return 'time';
    }
    return 'string';
  }

  private valueLooksNumeric(value: any): boolean {
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    if (typeof value === 'string') {
      const normalized = value.replace(/,/g, '').trim();
      if (!normalized) {
        return false;
      }
      const parsed = Number(normalized);
      return Number.isFinite(parsed);
    }
    return false;
  }

  private valueLooksBoolean(value: any): boolean {
    if (typeof value === 'boolean') {
      return true;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return ['true', 'false', 'yes', 'no', '1', '0'].includes(normalized);
    }
    if (typeof value === 'number') {
      return value === 0 || value === 1;
    }
    return false;
  }

  private valueLooksTime(value: any): boolean {
    if (value instanceof Date) {
      return true;
    }
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (!normalized) {
        return false;
      }
      if (!/[-/:\sT]/.test(normalized)) {
        return false;
      }
      const dt = dateTime(normalized);
      return dt.isValid();
    }
    return false;
  }

  private valueLooksGeo(value: any): boolean {
    return Boolean(this.parseGeo(value));
  }

  private parseGeo(value: any): { lat: number; lon: number; latDecimals: number; lonDecimals: number } | null {
    if (value === null || value === undefined) {
      return null;
    }

    let raw = '';
    if (typeof value === 'string') {
      raw = value;
    } else if (value.toString) {
      raw = value.toString();
    }

    raw = raw.trim();
    if (!raw) {
      return null;
    }

    raw = raw.replace(/;/g, ',').replace(/,\s+/g, ',');
    const parts = raw.split(',');
    if (parts.length !== 2) {
      return null;
    }

    const latToken = parts[0].trim();
    const lonToken = parts[1].trim();

    const lat = Number(latToken);
    const lon = Number(lonToken);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return null;
    }

    const latDecimals = this.countDecimals(latToken);
    const lonDecimals = this.countDecimals(lonToken);

    return { lat, lon, latDecimals, lonDecimals };
  }

  private countDecimals(token: string): number {
    const normalized = token.trim().replace(/^[+-]/, '');
    const dotIndex = normalized.indexOf('.');
    if (dotIndex === -1) {
      return 0;
    }
    return normalized.length - dotIndex - 1;
  }

  private roundToDecimals(value: number, decimals: number): number {
    if (!Number.isFinite(value) || typeof decimals !== 'number' || decimals < 0) {
      return value;
    }
    const capped = Math.min(decimals, 9);
    const factor = Math.pow(10, capped);
    return Math.round(value * factor) / factor;
  }

  private mapGrafanaType(type: OrcaGrafanaType | undefined): FieldType {
    switch (type) {
      case 'number':
        return FieldType.number;
      case 'boolean':
        return FieldType.boolean;
      case 'time':
        return FieldType.time;
      default:
        return FieldType.string;
    }
  }

  private normalizeValue(value: any, type: FieldType) {
    if (value === null || value === undefined) {
      return null;
    }

    switch (type) {
      case FieldType.number:
        if (typeof value === 'number') {
          return value;
        }
        if (typeof value === 'string') {
          const numeric = Number(value);
          return Number.isNaN(numeric) ? null : numeric;
        }
        return null;
      case FieldType.boolean:
        if (typeof value === 'boolean') {
          return value;
        }
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === '1' || lower === 'yes') {
            return true;
          }
          if (lower === 'false' || lower === '0' || lower === 'no') {
            return false;
          }
          return null;
        }
        return Boolean(value);
      case FieldType.time:
        return this.toValidDate(value);
      default:
        return value;
    }
  }

  private toValidDate(value: any) {
    if (value instanceof Date) {
      return value;
    }
    const dt = dateTime(value);
    return dt.isValid() ? dt.toDate() : null;
  }
}
