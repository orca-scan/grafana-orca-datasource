import React, { useMemo, useState } from 'react';
import type { QueryEditorProps } from '@grafana/data';
import { InlineField, Input, Select, Stack, Text } from '@grafana/ui';
import { DataSource } from '../datasource';
import type { OrcaDataSourceOptions, OrcaQuery } from '../types';

type Props = QueryEditorProps<DataSource, OrcaQuery, OrcaDataSourceOptions>;

export const QueryEditor: React.FC<Props> = ({ datasource, query, onChange, onRunQuery }) => {
  const [sheets, setSheets] = useState<Array<{ _id: string; name: string }>>([]);
  const [timeField, setTimeField] = useState<string | undefined>(query.timeField);

  React.useEffect(() => {
    datasource
      .listSheets()
      .then(setSheets)
      .catch(() => setSheets([]));
  }, [datasource]);

  React.useEffect(() => {
    setTimeField(query.timeField);
  }, [query.timeField]);

  const sheetOptions = useMemo(() => sheets.map((s) => ({ label: s.name, value: s._id })), [sheets]);

  const applyPatchAndRun = (patch: Partial<OrcaQuery>) => {
    onChange({ ...query, ...patch });
    onRunQuery();
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
    </Stack>
  );
};
