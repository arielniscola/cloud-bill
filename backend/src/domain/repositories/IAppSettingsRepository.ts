import { AppSettings, UpdateAppSettingsInput } from '../entities/AppSettings';

export interface IAppSettingsRepository {
  get(companyId?: string): Promise<AppSettings | null>;
  upsert(data: UpdateAppSettingsInput, companyId?: string): Promise<AppSettings>;
}
