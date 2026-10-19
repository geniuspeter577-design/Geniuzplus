import { FootballDataProvider } from '../providers/FootballDataProvider';
import { FootballMatchesService } from '../services/FootballMatchesService';

let cached: { key: string; service: FootballMatchesService } | undefined;

export function getMemberFootball(footballDataKey: string) {
  if (!cached || cached.key !== footballDataKey) {
    cached = { key: footballDataKey, service: new FootballMatchesService(new FootballDataProvider(footballDataKey)) };
  }
  return cached.service;
}
