import React, { useEffect, useState } from 'react';
import { View, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const C = {
  low: '#1c1b1b', mid: '#201f1f', high: '#2a2a2a', on: '#e5e2e1', dim: '#bccbb9',
  green: '#4be277', blue: '#0284C7', orange: '#EA580C',
};
const API = (process.env.EXPO_PUBLIC_GENIUZ_API_URL ?? '').trim().replace(/\/+$/, '');

function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<'loading' | 'error' | 'ok'>('loading');
  useEffect(() => {
    let off = false;
    setState('loading');
    fetch(`${API}${path}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad'))))
      .then((d) => { if (!off) { setData(d); setState('ok'); } })
      .catch(() => { if (!off) setState('error'); });
    return () => { off = true; };
  }, [path]);
  return { data, state };
}

function Logo({ url, size = 20 }: { url?: string; size?: number }) {
  const [bad, setBad] = useState(false);
  if (url && !bad) {
    return <Image source={{ uri: url }} onError={() => setBad(true)} resizeMode="contain" style={{ width: size, height: size }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.high, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="football" size={size * 0.62} color={C.dim} />
    </View>
  );
}

function Notice({ text }: { text: string }) {
  return <Text style={{ color: C.dim, textAlign: 'center', paddingVertical: 48 }}>{text}</Text>;
}

type TableRow = {
  position: number; team: string; logoUrl?: string; played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
};
type Standings = { competition: string; table: TableRow[] };
type Scorer = { name: string; position: string; team: string; logoUrl?: string; goals: number; assists: number; penalties: number; played: number };

type Row = { pos: number; name: string; logoUrl?: string; sub?: string; value: string; me: boolean };

function pick(rows: Row[], limit = 5): Row[] {
  const top = rows.slice(0, limit);
  const mine = rows.find((r) => r.me);
  return mine && !top.includes(mine) ? [...top, mine] : top;
}

function RankCard({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <View style={{ backgroundColor: C.low, borderRadius: 12, padding: 14 }}>
      <Text style={{ color: C.on, fontSize: 16, fontWeight: '600', paddingBottom: 8 }}>{title}</Text>
      {rows.length === 0 && <Text style={{ color: C.dim, fontSize: 12 }}>No data yet.</Text>}
      {rows.map((r) => (
        <View key={r.pos + r.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, backgroundColor: r.me ? C.high : 'transparent' }}>
          <Text style={{ width: 28, color: r.me ? C.green : C.dim, fontSize: 12, fontWeight: '700' }}>{r.pos}</Text>
          <Logo url={r.logoUrl} size={22} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text numberOfLines={1} style={{ color: C.on, fontSize: 14, fontWeight: r.me ? '700' : '500' }}>{r.name}</Text>
            {r.sub ? <Text numberOfLines={1} style={{ color: C.dim, fontSize: 11 }}>{r.sub}</Text> : null}
          </View>
          <Text style={{ color: r.me ? C.green : C.on, fontSize: 16, fontWeight: '700' }}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function StandingsTab({ team }: { team: string }) {
  const { data, state } = useData<Standings>('/football/standings?code=PL');
  if (state === 'loading') return <Notice text="Loading table..." />;
  if (state === 'error' || !data) return <Notice text="The table is not available right now." />;
  const cell = (w: number, t: string | number, bold = false, color = C.dim) => (
    <Text style={{ width: w, textAlign: 'center', color, fontSize: 12, fontWeight: bold ? '700' : '600' }}>{t}</Text>
  );
  return (
    <View style={{ paddingTop: 8 }}>
      <Text style={{ color: C.on, fontSize: 16, fontWeight: '600', marginBottom: 12 }}>{data.competition || 'League table'}</Text>
      <View style={{ backgroundColor: C.low, borderRadius: 12, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 36, paddingHorizontal: 8, backgroundColor: 'rgba(32,31,31,0.6)' }}>
          {cell(28, '#')}
          <Text style={{ flex: 1, color: C.dim, fontSize: 10, fontWeight: '700', paddingLeft: 4 }}>TEAM</Text>
          {cell(28, 'P')}{cell(28, 'W')}{cell(28, 'D')}{cell(28, 'L')}{cell(34, 'GD')}{cell(36, 'PTS', true, C.on)}
        </View>
        {data.table.map((r, i) => {
          const me = r.team === team;
          return (
            <View key={r.team} style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 8, backgroundColor: me ? C.high : 'transparent' }}>
              {i < 5 && <View style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: i < 4 ? C.blue : C.orange }} />}
              {cell(28, r.position, true, me ? C.green : C.on)}
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
                <Logo url={r.logoUrl} />
                <Text numberOfLines={1} style={{ color: C.on, fontSize: 13, fontWeight: me ? '700' : '500', flexShrink: 1 }}>{r.team}</Text>
              </View>
              {cell(28, r.played)}{cell(28, r.won)}{cell(28, r.drawn)}{cell(28, r.lost)}
              {cell(34, r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference)}
              {cell(36, r.points, true, me ? C.green : C.on)}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, paddingHorizontal: 8 }}>
        {[[C.blue, 'Champions League'], [C.orange, 'Europa League']].map(([c, t]) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} />
            <Text style={{ color: C.dim, fontSize: 10, fontWeight: '700' }}>{t.toUpperCase()}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PlayerStatsTab({ team }: { team: string }) {
  const { data, state } = useData<{ scorers: Scorer[] }>('/football/scorers?code=PL');
  if (state === 'loading') return <Notice text="Loading player stats..." />;
  if (state === 'error' || !data) return <Notice text="Player stats are not available right now." />;
  const sub = (s: Scorer) => `${s.team}${s.position ? ' · ' + s.position : ''}`;
  const goals = [...data.scorers].sort((a, b) => b.goals - a.goals)
    .map((s, i): Row => ({ pos: i + 1, name: s.name, logoUrl: s.logoUrl, sub: sub(s), value: String(s.goals), me: s.team === team }));
  const assists = [...data.scorers].filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists)
    .map((s, i): Row => ({ pos: i + 1, name: s.name, logoUrl: s.logoUrl, sub: sub(s), value: String(s.assists), me: s.team === team }));
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <RankCard title="Top scorers" rows={pick(goals, 10)} />
      <RankCard title="Most assists (among top scorers)" rows={pick(assists, 10)} />
    </View>
  );
}

export function TeamStatsTab({ team }: { team: string }) {
  const { data, state } = useData<Standings>('/football/standings?code=PL');
  if (state === 'loading') return <Notice text="Loading team stats..." />;
  if (state === 'error' || !data) return <Notice text="Team stats are not available right now." />;
  const make = (val: (r: TableRow) => number, desc: boolean, fmt: (n: number) => string = String) =>
    pick([...data.table].sort((a, b) => (desc ? val(b) - val(a) : val(a) - val(b)))
      .map((r, i): Row => ({ pos: i + 1, name: r.team, logoUrl: r.logoUrl, value: fmt(val(r)), me: r.team === team })));
  return (
    <View style={{ gap: 16, paddingTop: 8 }}>
      <RankCard title="Goals scored" rows={make((r) => r.goalsFor, true)} />
      <RankCard title="Goals conceded (fewest)" rows={make((r) => r.goalsAgainst, false)} />
      <RankCard title="Goal difference" rows={make((r) => r.goalDifference, true, (n) => (n > 0 ? `+${n}` : String(n)))} />
      <RankCard title="Wins" rows={make((r) => r.won, true)} />
    </View>
  );
}
