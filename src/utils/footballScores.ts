import type { FootballMatch } from '../models/football';

export function getWestAfricaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: 'year' | 'month' | 'day') => parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getNextFootballDates(value = new Date()) {
  const today = new Date(`${getWestAfricaDate(value)}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + offset);
    return {
      date: date.toISOString().slice(0, 10),
      label: offset === 0
        ? 'Today'
        : new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short' }).format(date),
      day: new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(date),
    };
  });
}

export function formatWestAfricaKickoff(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

export function getKickoffPresentation(value: string, now = new Date()) {
  const sameDay = getWestAfricaDate(new Date(value)) === getWestAfricaDate(now);
  const time = formatWestAfricaKickoff(value);
  if (sameDay) {
    return { label: `Today, ${time}`, comingSoon: false };
  }
  const date = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
  return { label: `${date}, ${time}`, comingSoon: true };
}

export function sortHomeFootballMatches(matches: FootballMatch[]) {
  const priority = (match: FootballMatch) =>
    match.status === 'live' ? 0 : match.status === 'scheduled' ? 1 : 2;
  return matches
    .filter((match) => match.status === 'live' || match.status === 'scheduled' || match.status === 'finished')
    .slice()
    .sort((left, right) =>
      priority(left) - priority(right) ||
      (priority(left) === 2
        ? right.startsAt.localeCompare(left.startsAt)
        : left.startsAt.localeCompare(right.startsAt)));
}

export function getGoalBallCounts(previous: FootballMatch | undefined, current: FootballMatch) {
  if (!previous) {
    return { home: 0, away: 0 };
  }
  return {
    home: previous.homeScore !== null && current.homeScore !== null && current.homeScore > previous.homeScore
      ? current.homeScore - previous.homeScore
      : 0,
    away: previous.awayScore !== null && current.awayScore !== null && current.awayScore > previous.awayScore
      ? current.awayScore - previous.awayScore
      : 0,
  };
}


const WEST_AFRICA_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEST_AFRICA_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatWestAfricaDate(value: string) {
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) {
    return '';
  }
  const local = new Date(time + 60 * 60 * 1000);
  return `${WEST_AFRICA_DAYS[local.getUTCDay()]} ${local.getUTCDate()} ${WEST_AFRICA_MONTHS[local.getUTCMonth()]}`;
}
