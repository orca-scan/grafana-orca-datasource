import React from 'react';
import type { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { InlineField, SecretInput, Stack } from '@grafana/ui';
import type { OrcaDataSourceOptions, OrcaSecureJsonData } from '../types';

type Props = DataSourcePluginOptionsEditorProps<OrcaDataSourceOptions, OrcaSecureJsonData>;

export const ConfigEditor: React.FC<Props> = ({ options, onOptionsChange }) => {
  const secureJsonData = options.secureJsonData ?? {};
  const secureFields = options.secureJsonFields ?? {};

  const onApiKeyChange = (v?: string) => {
    onOptionsChange({
      ...options,
      secureJsonData: { ...secureJsonData, apiKey: v },
    });
  };

  const onResetApiKey = () => {
    onOptionsChange({
      ...options,
      secureJsonFields: { ...secureFields, apiKey: false },
      secureJsonData: { ...secureJsonData, apiKey: '' },
    });
  };

  return (
    <Stack direction="column" gap={2}>
      <InlineField label="API Key" tooltip="Paste your Orca Scan API key (from Account → REST API)" labelWidth={20}>
        <SecretInput
          isConfigured={Boolean(secureFields?.apiKey)}
          value={secureFields?.apiKey ? undefined : secureJsonData.apiKey ?? ''}
          placeholder={secureFields?.apiKey ? 'Configured' : 'orca_xxxxxxxxxxxxxxxxxxxxxxxx'}
          onReset={onResetApiKey}
          onChange={(e) => onApiKeyChange(e.currentTarget.value)}
          width={50}
        />
      </InlineField>

      <div>Click “Save &amp; test” to verify your connection.</div>
    </Stack>
  );
};
