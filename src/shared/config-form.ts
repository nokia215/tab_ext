import { lineListToText, textToLineList } from './format';
import type { AppConfig } from './types';

interface ConfigFormFields {
  config: AppConfig;
  ignoreDomainsText: string;
  ignoreTitlesText: string;
}

export function configToFormFields(config: AppConfig): ConfigFormFields {
  return {
    config,
    ignoreDomainsText: lineListToText(config.ignoreDomains),
    ignoreTitlesText: lineListToText(config.ignoreTitles)
  };
}

export function configFromFormFields(fields: ConfigFormFields): AppConfig {
  return {
    supabaseUrl: fields.config.supabaseUrl.trim(),
    supabaseKey: fields.config.supabaseKey.trim(),
    ignoreDomains: textToLineList(fields.ignoreDomainsText),
    ignoreTitles: textToLineList(fields.ignoreTitlesText)
  };
}
