import { SportsProviderError } from './SportsProvider';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const https = (v: unknown) => {
  const s = str(v);
  return s.startsWith('https://') ? s : undefined;
};

async function getJson(path: string, apiKey: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://api.football-data.org/v4${path}`, {
      headers: { 'X-Auth-Token': apiKey },
      signal: controller.signal,
    });
    if (response.status === 429) throw new SportsProviderError('RATE_LIMITED');
    if (!response.ok) throw new SportsProviderError('UNAVAILABLE');
    const payload: unknown = await response.json();
    if (!isRecord(payload)) throw new SportsProviderError('INVALID_RESPONSE');
    return payload;
  } catch (error) {
    if (error instanceof SportsProviderError) throw error;
    if (controller.signal.aborted) throw new SportsProviderError('TIMEOUT');
    throw new SportsProviderError('UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

export async function getStandings(apiKey: string, code: string) {
  const payload = await getJson(`/competitions/${code}/standings`, apiKey);
  const groups = Array.isArray(payload.standings) ? payload.standings : [];
  const total = groups.find((g) => isRecord(g) && g.type === 'TOTAL') ?? groups[0];
  const table = isRecord(total) && Array.isArray(total.table) ? total.table : [];
  return {
    competition: isRecord(payload.competition) ? str(payload.competition.name) : code,
    table: table.flatMap((row) => {
      if (!isRecord(row) || !isRecord(row.team)) return [];
      const logo = https(row.team.crest);
      return [{
        position: num(row.position),
        team: str(row.team.shortName) || str(row.team.name),
        ...(logo ? { logoUrl: logo } : {}),
        played: num(row.playedGames),
        won: num(row.won),
        drawn: num(row.draw),
        lost: num(row.lost),
        goalsFor: num(row.goalsFor),
        goalsAgainst: num(row.goalsAgainst),
        goalDifference: num(row.goalDifference),
        points: num(row.points),
      }];
    }),
  };
}

export async function getScorers(apiKey: string, code: string) {
  const payload = await getJson(`/competitions/${code}/scorers?limit=30`, apiKey);
  const list = Array.isArray(payload.scorers) ? payload.scorers : [];
  return {
    scorers: list.flatMap((row) => {
      if (!isRecord(row) || !isRecord(row.player) || !isRecord(row.team)) return [];
      const logo = https(row.team.crest);
      return [{
        name: str(row.player.name),
        position: str(row.player.position),
        team: str(row.team.shortName) || str(row.team.name),
        ...(logo ? { logoUrl: logo } : {}),
        goals: num(row.goals),
        assists: num(row.assists),
        penalties: num(row.penalties),
        played: num(row.playedMatches),
      }];
    }),
  };
}
