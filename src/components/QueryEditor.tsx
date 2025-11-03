import React, { useEffect, useMemo, useState } from 'react';
import type { QueryEditorProps, SelectableValue } from '@grafana/data';
import { Button, IconButton, InlineField, Input, Select, Stack, Text } from '@grafana/ui';
import { DataSource } from '../datasource';
import type { OrcaDataSourceOptions, OrcaQuery } from '../types';

type Props = QueryEditorProps<DataSource, OrcaQuery, OrcaDataSourceOptions>;

type FilterRow = { id: string; key: string; value: string };

const createFilterRow = (): FilterRow => ({
  id: `${Date.now()}-${Math.random()}`,
  key: '',
  value: '',
});

const toFilterRows = (filters?: Array<{ key: string; value: string }>): FilterRow[] => {
  if (!filters || !filters.length) {
    return [createFilterRow()];
  }
  return filters.map((f, idx) => ({
    id: `${Date.now()}-${idx}`,
    key: f.key,
    value: f.value,
  }));
};

export const QueryEditor: React.FC<Props> = ({ datasource, query, onChange, onRunQuery }) => {
  const [sheets, setSheets] = useState<Array<{ _id: string; name: string }>>([]);
  const [timeField, setTimeField] = useState<string | undefined>(query.timeField);
  const [availableFields, setAvailableFields] = useState<Array<SelectableValue<string>>>([]);
  const [timeFieldOptions, setTimeFieldOptions] = useState<Array<SelectableValue<string>>>([]);
  const [filterRows, setFilterRows] = useState<FilterRow[]>(() => toFilterRows(query.filters));
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
    const sanitized = JSON.stringify(query.filters ?? []);
    setFilterRows((current) => {
      const currentSerialized = JSON.stringify(current.map(({ key, value }) => ({ key, value })));
      if (currentSerialized === sanitized) {
        return current.length ? current : [createFilterRow()];
      }
      return toFilterRows(query.filters);
    });
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

  const syncFilters = (rows: FilterRow[]) => {
    const cleaned = rows.length ? rows : [createFilterRow()];
    setFilterRows(cleaned);
    const sanitized = cleaned
      .filter((row) => row.key.trim() && row.value.trim())
      .map((row) => ({ key: row.key.trim(), value: row.value.trim() }));
    applyPatch({ filters: sanitized });
  };

  const handleFilterKeyChange = (id: string, value: string | null) => {
    const nextRows = filterRows.map((row) => (row.id === id ? { ...row, key: value ?? '' } : row));
    syncFilters(nextRows);
    const updated = nextRows.find((row) => row.id === id);
    if (updated && updated.key.trim() && updated.value.trim()) {
      onRunQuery();
    }
  };

  const handleFilterValueChange = (id: string, value: string) => {
    const nextRows = filterRows.map((row) => (row.id === id ? { ...row, value } : row));
    syncFilters(nextRows);
    const updated = nextRows.find((row) => row.id === id);
    if (updated && updated.key.trim() && updated.value.trim()) {
      onRunQuery();
    }
  };

  const removeFilterRow = (id: string) => {
    const next = filterRows.filter((row) => row.id !== id);
    syncFilters(next.length ? next : [createFilterRow()]);
    onRunQuery();
  };

  const addFilterRow = () => {
    syncFilters([...filterRows, createFilterRow()]);
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
      <InlineField label="Sheet" labelWidth={16}>
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
        {showAdvanced ? 'Hide advanced options' : 'Show advanced options'}
      </Button>

      {showAdvanced && (
        <Stack direction="column" gap={1}>
          <Text variant="bodySmall" color="secondary">
            Orca Scan returns up to 5000 rows per request. Use Skip to paginate through larger sheets.
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

      <InlineField
        label="Time field"
        labelWidth={16}
        tooltip="Optional. Select a time column so Grafana can drive the dashboard time range."
      >
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
          Filters are applied after rows are loaded. Leave fields blank to remove the filter.
        </Text>
        {filterRows.map((row, idx) => {
          const datalistId = `orca-filter-fields-${idx}`;
          return (
            <Stack direction="row" gap={1} alignItems="center" key={row.id}>
              <Input
                placeholder="Field"
                value={row.key}
                width={20}
                list={datalistId}
                disabled={!query.sheetId}
                onChange={(e) => handleFilterKeyChange(row.id, e.currentTarget.value)}
                onBlur={() => {
                  const target = filterRows.find((r) => r.id === row.id);
                  if (target && target.key.trim() && target.value.trim()) {
                    onRunQuery();
                  }
                }}
              />
              <datalist id={datalistId}>
                {availableFields.map((option) => (
                  <option key={`${datalistId}-${option.value}`} value={option.value ?? ''}>
                    {option.label}
                  </option>
                ))}
              </datalist>
              <Input
                placeholder="Value"
                value={row.value}
                width={20}
                onChange={(e) => handleFilterValueChange(row.id, e.currentTarget.value)}
                onBlur={() => onRunQuery()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    onRunQuery();
                  }
                }}
              />
              <IconButton
                name="trash-alt"
                variant="secondary"
                aria-label="Remove filter"
                disabled={filterRows.length === 1 && !row.key && !row.value}
                onClick={() => removeFilterRow(row.id)}
              />
            </Stack>
          );
        })}
        <Button icon="plus" variant="secondary" onClick={addFilterRow}>
          Add filter
        </Button>
      </Stack>
    </Stack>
  );
};
