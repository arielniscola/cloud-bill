import { AppSettings, UpdateAppSettingsInput } from '../entities/AppSettings';

export interface IAppSettingsRepository {
  get(): Promise<AppSettings | null>;
  upsert(data: UpdateAppSettingsInput): Promise<AppSettings>;
}
