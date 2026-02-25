import { AfipConfig, CreateAfipConfigInput } from '../entities/AfipConfig';

export interface IAfipConfigRepository {
  getActive(): Promise<AfipConfig | null>;
  upsert(data: CreateAfipConfigInput): Promise<AfipConfig>;
}
