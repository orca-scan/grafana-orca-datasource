/**
 * @jest-environment node
 */

jest.mock('@grafana/data', () => {
  class MutableDataFrame {
    fields: Array<{ name: string; values: any[]; type: string; config?: Record<string, any> }>;
    meta: Record<string, any>;
    refId?: string;
    name?: string;

    constructor(opts: any) {
      this.refId = opts.refId;
      this.name = opts.name;
      this.meta = opts.meta ?? {};
      this.fields = (opts.fields ?? []).map((field: any) => ({
        ...field,
        values: [],
      }));
    }

    add(record: Record<string, any>) {
      for (const field of this.fields) {
        field.values.push(record[field.name]);
      }
    }
  }

  const FieldType = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    time: 'time',
  };

  return {
    MutableDataFrame,
    FieldType,
    DataSourceApi: class {},
    dateTime: (value: any) => ({
      isValid: () => !Number.isNaN(Date.parse(value)),
      toDate: () => new Date(value),
    }),
  };
});

jest.mock('@grafana/runtime', () => ({
  getBackendSrv: () => ({
    get: jest.fn(),
    post: jest.fn(),
  }),
}));

import type { DataSourceInstanceSettings } from '@grafana/data';
import { DataSource } from '../datasource';

const instanceSettings = {
  uid: 'test-uid',
  jsonData: {},
  meta: {} as any,
  access: 'proxy',
} as DataSourceInstanceSettings;

describe('DataSource.toDataFrames', () => {
  it('preserves numeric precision and parses geo coordinates', () => {
    const ds = new DataSource(instanceSettings);
    const query = {
      refId: 'A',
      sheetId: 'sheet-1',
      timeField: 'Date',
    };

    const response = {
      rows: [
        {
          Date: '2025-03-17 14:02:14',
          Count: '5',
          Price: '12.34',
          Location: '51.5072, -0.1275',
          Location_lat: 51.5072,
          Location_lon: -0.1275,
        },
      ],
      fields: [
        { key: 'Date', grafanaType: 'time', isTime: true },
        { key: 'Count', grafanaType: 'number' },
        { key: 'Price', grafanaType: 'number', decimals: 2 },
        { key: 'Location', grafanaType: 'string' },
        { key: 'Location_lat', grafanaType: 'number', decimals: 4 },
        { key: 'Location_lon', grafanaType: 'number', decimals: 4 },
      ],
      sheetId: 'sheet-1',
      refId: 'A',
      timeField: 'Date',
    };

    const frames = (ds as any).toDataFrames(query, response);
    expect(frames).toHaveLength(1);

    const frame = frames[0];
    const countField = frame.fields.find((f: any) => f.name === 'Count');
    const priceField = frame.fields.find((f: any) => f.name === 'Price');
    const latField = frame.fields.find((f: any) => f.name === 'Location_lat');
    const lonField = frame.fields.find((f: any) => f.name === 'Location_lon');

    expect(countField?.config?.decimals).toBeUndefined();
    expect(priceField?.config?.decimals).toBe(2);
    expect(latField?.config?.decimals).toBe(4);
    expect(lonField?.config?.decimals).toBe(4);

    expect((countField?.values as any[])[0]).toBe(5);
    expect((priceField?.values as any[])[0]).toBeCloseTo(12.34);
    expect((latField?.values as any[])[0]).toBeCloseTo(51.5072);
    expect((lonField?.values as any[])[0]).toBeCloseTo(-0.1275);
  });
});
