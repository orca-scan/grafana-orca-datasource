import React, { useEffect, useMemo, useState } from 'react';
import type { QueryEditorProps } from '@grafana/data';
import { InlineField, Input, Select, Stack } from '@grafana/ui';
import { DataSource } from '../datasource';
import type { OrcaDataSourceOptions, OrcaQuery } from '../types';

type Props = QueryEditorProps<DataSource, OrcaQuery, OrcaDataSourceOptions>;

const serializeFilters = (filters?: Array<{ key: string; value: string }>) =>
  (filters ?? []).map((f) => `${f.key}=${f.value}`).join(', ');

export const QueryEditor: React.FC<Props> = ({ datasource, query, onChange, onRunQuery }) => {
  const [sheets, setSheets] = useState<Array<{ _id: string; name: string }>>([]);
  const [timeField, setTimeField] = useState<string | undefined>(query.timeField);
  const [filterText, setFilterText] = useState(() => serializeFilters(query.filters));

  useEffect(() => {
    datasource
      .listSheets()
      .then(setSheets)
      .catch(() => setSheets([]));
  }, [datasource]);

  useEffect(() => {
    setFilterText(serializeFilters(query.filters));
  }, [query.filters]);

  useEffect(() => {
    setTimeField(query.timeField);
  }, [query.timeField]);

  const sheetOptions = useMemo(() => sheets.map((s) => ({ label: s.name, value: s._id })), [sheets]);

  const applyPatch = (patch: Partial<OrcaQuery>) => {
    onChange({ ...query, ...patch });
  };

  const applyPatchAndRun = (patch: Partial<OrcaQuery>) => {
    onChange({ ...query, ...patch });
    onRunQuery();
  };

  const parseFilters = (s: string): Array<{ key: string; value: string }> => {
    const arr = s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return arr
      .map((kv) => {
        const [k, ...rest] = kv.split('=');
        return { key: (k || '').trim(), value: rest.join('=').trim() };
      })
      .filter((p) => p.key && p.value);
  };

  return (
    <Stack direction="column" gap={2}>
      <InlineField label="Sheet" labelWidth={16}>
        <Select
          options={sheetOptions}
          value={sheetOptions.find((o) => o.value === query.sheetId)}
          onChange={(v) => {
            if (v?.value) {
              applyPatchAndRun({ sheetId: v.value as string });
            } else {
              applyPatchAndRun({ sheetId: undefined });
            }
          }}
          width={50}
          placeholder="Pick a sheet"
        />
      </InlineField>

      <Stack direction="row" gap={2}>
        <InlineField label="Limit" labelWidth={16} tooltip="Max rows (default 5000)">
          <Input
            value={String(query.limit ?? 5000)}
            width={20}
            onChange={(e) => applyPatch({ limit: Number(e.currentTarget.value) || 0 })}
            onBlur={() => onRunQuery()}
          />
        </InlineField>
        <InlineField label="Skip" labelWidth={16} tooltip="Offset rows (default 0)">
          <Input
            value={String(query.skip ?? 0)}
            width={20}
            onChange={(e) => applyPatch({ skip: Number(e.currentTarget.value) || 0 })}
            onBlur={() => onRunQuery()}
          />
        </InlineField>
      </Stack>

      <InlineField label="Time field" labelWidth={16} tooltip="Optional: name of a date/datetime field">
        <Input
          placeholder="e.g., date"
          value={timeField ?? ''}
          width={50}
          onChange={(e) => setTimeField(e.currentTarget.value)}
          onBlur={() => {
            applyPatchAndRun({ timeField: timeField?.trim() ? timeField.trim() : undefined });
          }}
        />
      </InlineField>

      <InlineField label="Filters" labelWidth={16} tooltip='Optional: comma-separated "field=value" pairs'>
        <Input
          placeholder="status=Active, site=UK"
          value={filterText}
          width={50}
          onChange={(e) => setFilterText(e.currentTarget.value)}
          onBlur={() => {
            applyPatchAndRun({ filters: parseFilters(filterText) });
          }}
        />
      </InlineField>
    </Stack>
  );
};
