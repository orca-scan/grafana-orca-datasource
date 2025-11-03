import React, { useEffect, useMemo, useState } from 'react';
import type { QueryEditorProps } from '@grafana/data';
import { Button, Combobox, ComboboxOption, IconButton, InlineField, Input, Stack, Text } from '@grafana/ui';
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
  const [availableFields, setAvailableFields] = useState<Array<ComboboxOption<string>>>([]);
  const [timeFieldOptions, setTimeFieldOptions] = useState<Array<ComboboxOption<string>>>([]);
  const [filterRows, setFilterRows] = useState<FilterRow[]>(() => toFilterRows(query.filters));
  const [isLoadingFields, setIsLoadingFields] = useState(false);

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
        const options = fields.map((f) => ({
          label: f.label ?? f.key,
          value: f.key,
          description: f.isTime ? 'Time field' : undefined,
        }));
        setAvailableFields(options);
        setTimeFieldOptions(
          fields
            .filter((f) => f.grafanaType === 'time')
            .map((f) => ({
              label: f.label ?? f.key,
              value: f.key,
            }))
        );
      })
      .catch(() => {
        setAvailableFields([]);
        setTimeFieldOptions([]);
      })
      .finally(() => setIsLoadingFields(false));
  }, [datasource, query.sheetId]);

  const sheetOptions = useMemo<Array<ComboboxOption<string>>>(() => sheets.map((s) => ({ label: s.name, value: s._id })), [sheets]);

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
    syncFilters(filterRows.map((row) => (row.id === id ? { ...row, key: value ?? '' } : row)));
  };

  const handleFilterValueChange = (id: string, value: string) => {
    syncFilters(filterRows.map((row) => (row.id === id ? { ...row, value } : row)));
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
        <Combobox
          options={sheetOptions}
          value={query.sheetId ?? null}
          isClearable
          placeholder="Select a sheet"
          onChange={(option) => {
            const value = option?.value ?? '';
            applyPatchAndRun({
              sheetId: value || undefined,
              skip: query.skip ?? 0,
            });
          }}
          loading={!sheets.length}
          width="auto"
          minWidth={22}
        />
      </InlineField>

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

      <InlineField
        label="Time field"
        labelWidth={16}
        tooltip="Optional. Select a time column so Grafana can drive the dashboard time range."
      >
        <Combobox
          options={timeFieldOptions}
          value={timeField ?? null}
          isClearable
          createCustomValue
          placeholder={timeFieldOptions.length ? 'Select or type field name' : 'Type field name'}
          disabled={!query.sheetId}
          loading={isLoadingFields && !timeFieldOptions.length}
          onChange={(option) => {
            const value = option?.value ?? '';
            setTimeField(value || undefined);
            applyPatchAndRun({ timeField: value ? value : undefined });
          }}
          onBlur={() => {
            const trimmed = timeField?.trim();
            applyPatch({ timeField: trimmed ? trimmed : undefined });
          }}
          width="auto"
          minWidth={22}
        />
      </InlineField>

      <Stack direction="column" gap={1}>
        <Text variant="bodySmall" color="secondary">
          Filters are applied client-side after fetching rows.
        </Text>
        {filterRows.map((row, idx) => (
          <Stack direction="row" gap={1} alignItems="center" key={row.id}>
            <Combobox
              options={availableFields}
              value={row.key || null}
              isClearable
              createCustomValue
              placeholder="Field"
              disabled={!query.sheetId}
              width="auto"
              minWidth={16}
              onChange={(option) => handleFilterKeyChange(row.id, option?.value ?? null)}
            />
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
        ))}
        <Button icon="plus" variant="secondary" onClick={addFilterRow}>
          Add filter
        </Button>
      </Stack>
    </Stack>
  );
};
