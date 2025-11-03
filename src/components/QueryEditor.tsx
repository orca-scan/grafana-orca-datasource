import React, { useEffect, useMemo, useState } from 'react';
import type { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Button, InlineField, Input, Select, Stack, Text, TextArea } from '@grafana/ui';
import { DataSource } from '../datasource';
import type { OrcaDataSourceOptions, OrcaQuery } from '../types';

type Props = QueryEditorProps<DataSource, OrcaQuery, OrcaDataSourceOptions>;

const serializeFilters = (filters?: Array<{ key: string; value: string }>) =>
  (filters ?? []).map((f) => `${f.key}=${f.value}`).join('\n');

export const QueryEditor: React.FC<Props> = ({ datasource, query, onChange, onRunQuery }) => {
  const [sheets, setSheets] = useState<Array<{ _id: string; name: string }>>([]);
  const [timeField, setTimeField] = useState<string | undefined>(query.timeField);
  const [availableFields, setAvailableFields] = useState<Array<SelectableValue<string>>>([]);
  const [timeFieldOptions, setTimeFieldOptions] = useState<Array<SelectableValue<string>>>([]);
  const [filterText, setFilterText] = useState(() => serializeFilters(query.filters));
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    datasource
      .listSheets()
      .then(setSheets)
      .catch(() => setSheets([]));
  }, [datasource]);

  useEffect(() => {
    setTimeField(query.timeField);
  }, [query.timeField]);

  useEffect(() => {
    setFilterText(serializeFilters(query.filters));
  }, [query.filters]);

  useEffect(() => {
    if (!query.sheetId) {
      setAvailableFields([]);
      setTimeFieldOptions([]);
      return;
    }

    setIsLoadingFields(true);
    datasource
      .listFields(query.sheetId)
      .then((fields) => {
        const options: Array<SelectableValue<string>> = fields.map((f) => ({
          label: f.label ?? f.key,
          value: f.key,
          description: f.isTime ? 'Time field' : undefined,
        }));
        setAvailableFields(options);
        const timeOptions: Array<SelectableValue<string>> = fields
          .filter((f) => f.grafanaType === 'time')
          .map((f) => ({
            label: f.label ?? f.key,
            value: f.key,
          }));
        setTimeFieldOptions(timeOptions);
      })
      .catch(() => {
        setAvailableFields([]);
        setTimeFieldOptions([]);
      })
      .finally(() => setIsLoadingFields(false));
  }, [datasource, query.sheetId]);

  const sheetOptions = useMemo<Array<SelectableValue<string>>>(() => sheets.map((s) => ({ label: s.name, value: s._id })), [sheets]);

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

  const positiveNumberOr = (value: string, fallback: number) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }
    return Math.floor(parsed);
  };

  return (
    <Stack direction="column" gap={2}>
      <Text variant="bodySmall" color="secondary">
        Choose the Orca Scan sheet you want to visualise.
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

      <Button
        icon={showAdvanced ? 'angle-down' : 'angle-right'}
        variant="secondary"
        fill="text"
        onClick={() => setShowAdvanced((prev) => !prev)}
      >
        {showAdvanced ? 'Hide advanced options' : 'Advanced options (limit & offset)'}
      </Button>

      {showAdvanced && (
        <Stack direction="column" gap={1}>
          <Text variant="bodySmall" color="secondary">
            Each request can fetch up to 5,000 rows. Use Skip to jump past the first N rows when working with very large
            sheets.
          </Text>
          <Stack direction="row" gap={2}>
            <InlineField label="Limit" labelWidth={16} tooltip="Max rows per request (Orca API limit 5000)">
              <Input
                type="number"
                value={String(query.limit ?? 5000)}
                width={20}
                min={0}
                onChange={(e) => applyPatch({ limit: positiveNumberOr(e.currentTarget.value, query.limit ?? 5000) })}
                onBlur={() => onRunQuery()}
              />
            </InlineField>
            <InlineField label="Skip" labelWidth={16} tooltip="Offset rows (default 0)">
              <Input
                type="number"
                value={String(query.skip ?? 0)}
                width={20}
                min={0}
                onChange={(e) => applyPatch({ skip: positiveNumberOr(e.currentTarget.value, query.skip ?? 0) })}
                onBlur={() => onRunQuery()}
              />
            </InlineField>
          </Stack>
        </Stack>
      )}

      <Text variant="bodySmall" color="secondary">
        Optional: pick the timestamp column that should drive Grafana’s time range. Leave blank for table mode.
      </Text>
      <InlineField label="Time field" labelWidth={14}>
        {/* eslint-disable-next-line @typescript-eslint/no-deprecated */}
        <Select
          options={timeFieldOptions}
          value={
            timeField
              ? timeFieldOptions.find((option) => option.value === timeField) ?? { label: timeField, value: timeField }
              : null
          }
          isClearable
          allowCustomValue
          placeholder={timeFieldOptions.length ? 'Select or type field name' : 'Type field name'}
          disabled={!query.sheetId}
          isLoading={isLoadingFields && !timeFieldOptions.length}
          onChange={(option) => {
            const value = option?.value ?? undefined;
            setTimeField(value);
            applyPatchAndRun({ timeField: value });
          }}
          onCreateOption={(value) => {
            const trimmed = value.trim();
            setTimeField(trimmed);
            applyPatchAndRun({ timeField: trimmed || undefined });
          }}
          width="auto"
        />
      </InlineField>

      <Stack direction="column" gap={1}>
        <Text variant="bodySmall" color="secondary">
          Filters (one per line). Example: <code>status=Active</code>
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
        {availableFields.length > 0 && (
          <Text variant="bodySmall" color="secondary">
            Available columns: {availableFields.map((option) => option.value).filter(Boolean).join(', ')}
          </Text>
        )}
      </Stack>
    </Stack>
  );
};
