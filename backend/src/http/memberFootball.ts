import { ApiFootballProvider } from '../providers/ApiFootballProvider';
import { FootballMatchesService } from '../services/FootballMatchesService';

let cached: { key: string; service: FootballMatchesService } | undefined;

export function getMemberFootball(apiSportsKey: string) {
  if (!cached || cached.key !== apiSportsKey) {
    cached = { key: apiSportsKey, service: new FootballMatchesService(new ApiFootballProvider(apiSportsKey)) };
  }
  return cached.service;
}
