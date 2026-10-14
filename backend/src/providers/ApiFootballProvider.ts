import type { FootballMatch, FootballMatchStatus, SportsProvider } from './SportsProvider';
import { SportsProviderError } from './SportsProvider';

type ApiFixture = {
  fixture: { id: number; date: string; status: { short: string | null; elapsed: number | null } };
  league: { id: number; name: string; logo?: string | null };
  teams: { home: { name: string; logo?: string | null }; away: { name: string; logo?: string | null } };
  goals: { home: number | null; away: number | null };
};

type ApiResponse = { errors?: unknown; response?: ApiFixture[] };

const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT']);
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const CANCELLED = new Set(['CANC', 'ABD', 'AWD', 'WO']);
const POSTPONED = new Set(['PST', 'SUSP']);

function mapStatus(short: string | null): FootballMatchStatus {
  if (!short) return 'scheduled';
  if (LIVE.has(short)) return 'live';
  if (FINISHED.has(short)) return 'finished';
  if (CANCELLED.has(short)) return 'cancelled';
  if (POSTPONED.has(short)) return 'postponed';
  return 'scheduled';
}

function logo(url?: string | null) {
  return url ? { logoUrl: url } : {};
}

function toMatch(item: ApiFixture): FootballMatch {
  const status = mapStatus(item.fixture.status.short);
  return {
    id: String(item.fixture.id),
    competition: { id: String(item.league.id), name: item.league.name, ...logo(item.league.logo) },
    startsAt: item.fixture.date,
    status,
    minute: status === 'live' ? item.fixture.status.elapsed ?? null : null,
    homeTeam: { name: item.teams.home.name, ...logo(item.teams.home.logo) },
    awayTeam: { name: item.teams.away.name, ...logo(item.teams.away.logo) },
    homeScore: item.goals.home,
    awayScore: item.goals.away,
  };
}

export class ApiFootballProvider implements SportsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://v3.football.api-sports.io',
  ) {}

  getMatches(date: string): Promise<FootballMatch[]> {
    return this.fetchFixtures(`date=${encodeURIComponent(date)}`);
  }

  getMatchesRange(dateFrom: string, _dateTo: string): Promise<FootballMatch[]> {
    return this.fetchFixtures(`date=${encodeURIComponent(dateFrom)}`);
  }

  private async fetchFixtures(query: string): Promise<FootballMatch[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let body: ApiResponse;
    try {
      const res = await fetch(`${this.baseUrl}/fixtures?${query}`, {
        headers: { 'x-apisports-key': this.apiKey },
        signal: controller.signal,
      });
      if (res.status === 429) throw new SportsProviderError('RATE_LIMITED');
      if (!res.ok) throw new SportsProviderError('UNAVAILABLE');
      body = (await res.json()) as ApiResponse;
    } catch (error) {
      if (error instanceof SportsProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new SportsProviderError('TIMEOUT');
      throw new SportsProviderError('UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
    const errors = body.errors;
    const hasErrors = Array.isArray(errors)
      ? errors.length > 0
      : errors !== null && typeof errors === 'object' && Object.keys(errors).length > 0;
    if (hasErrors) {
      const text = JSON.stringify(errors);
      console.error('API-Football error:', text);
      const lower = text.toLowerCase();
      throw new SportsProviderError(lower.includes('limit') || lower.includes('request') ? 'RATE_LIMITED' : 'UNAVAILABLE');
    }
    if (!Array.isArray(body.response)) throw new SportsProviderError('INVALID_RESPONSE');
    return body.response.map(toMatch);
  }
}
