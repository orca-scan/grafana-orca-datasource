import React, { useMemo, useState } from 'react';
import type { QueryEditorProps } from '@grafana/data';
import { InlineField, Input, Select, Stack, Text, TextArea } from '@grafana/ui';
import { DataSource } from '../datasource';
import type { OrcaDataSourceOptions, OrcaQuery } from '../types';

type Props = QueryEditorProps<DataSource, OrcaQuery, OrcaDataSourceOptions>;

const serializeFilters = (filters?: Array<{ key: string; value: string }>) =>
  (filters ?? []).map((f) => `${f.key}=${f.value}`).join('\n');

export const QueryEditor: React.FC<Props> = ({ datasource, query, onChange, onRunQuery }) => {
  const [sheets, setSheets] = useState<Array<{ _id: string; name: string }>>([]);
  const [timeField, setTimeField] = useState<string | undefined>(query.timeField);
  const [filterText, setFilterText] = useState(() => serializeFilters(query.filters));

  React.useEffect(() => {
    datasource
      .listSheets()
      .then(setSheets)
      .catch(() => setSheets([]));
  }, [datasource]);

  React.useEffect(() => {
    setTimeField(query.timeField);
  }, [query.timeField]);

  React.useEffect(() => {
    setFilterText(serializeFilters(query.filters));
  }, [query.filters]);

  const sheetOptions = useMemo(() => sheets.map((s) => ({ label: s.name, value: s._id })), [sheets]);

  const applyPatch = (patch: Partial<OrcaQuery>) => {
    onChange({ ...query, ...patch });
  };

  const applyPatchAndRun = (patch: Partial<OrcaQuery>) => {
    onChange({ ...query, ...patch });
    onRunQuery();
  };

  const parseFilterText = (value: string): Array<{ key: string; value: string }> => {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [k, ...rest] = line.split('=');
        return { key: (k || '').trim(), value: rest.join('=').trim() };
      })
      .filter((pair) => pair.key && pair.value);
  };

  return (
    <Stack direction="column" gap={2}>
      <Text variant="bodySmall" color="secondary">
        1. Pick the Orca Scan sheet you want to use.
      </Text>
      <InlineField label="Sheet" labelWidth={14}>
        {/* Temporary use of Select until Combobox is fully supported in Grafana UI */}
        {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
        <Select
          options={sheetOptions}
          value={sheetOptions.find((option) => option.value === query.sheetId) ?? null}
          isClearable
          placeholder="Select a sheet"
          onChange={(option) => {
            const value = option?.value ?? undefined;
            applyPatchAndRun({
              sheetId: value,
              skip: query.skip ?? 0,
            });
          }}
          isLoading={!sheets.length}
          width="auto"
        />
      </InlineField>

      <Text variant="bodySmall" color="secondary">
        2. (Optional) Enter the timestamp column that should drive Grafana’s time range. Leave blank for table views.
      </Text>
      <InlineField label="Time field" labelWidth={14} tooltip="Type the exact field name, for example Release Date.">
        <Input
          value={timeField ?? ''}
          placeholder="Type field name"
          disabled={!query.sheetId}
          onChange={(event) => {
            setTimeField(event.currentTarget.value || undefined);
          }}
          onBlur={() => {
            const trimmed = timeField?.trim();
            if (trimmed !== timeField) {
              setTimeField(trimmed || undefined);
            }
            applyPatchAndRun({ timeField: trimmed ? trimmed : undefined });
          }}
          width={30}
        />
      </InlineField>

      <Stack direction="column" gap={1}>
        <Text variant="bodySmall" color="secondary">
          3. (Optional) Add filters — enter one <code>field=value</code> pair per line. Matching is case sensitive.
        </Text>
        <TextArea
          value={filterText}
          placeholder="field=value"
          spellCheck={false}
          onChange={(e) => setFilterText(e.currentTarget.value)}
          onBlur={() => {
            applyPatch({ filters: parseFilterText(filterText) });
            onRunQuery();
          }}
          rows={3}
        />
      </Stack>
    </Stack>
  );
};
