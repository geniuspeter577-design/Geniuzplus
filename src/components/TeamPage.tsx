import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { StandingsTab, PlayerStatsTab, TeamStatsTab } from './TeamTabs';

const C = {
  bg: '#131313', low: '#1c1b1b', mid: '#201f1f', high: '#2a2a2a', variant: '#353534',
  on: '#e5e2e1', dim: '#bccbb9', outline: '#869585', green: '#4be277', onGreen: '#003915',
  red: '#ffb4ab', blue: '#0284C7', orange: '#EA580C', tert: '#ffb69b',
};
const TABS = ['Overview', 'Fixtures', 'Results', 'Standings', 'Squad', 'Player Stats', 'Team Stats'];
let L = 'Liverpool';
const TC: Record<string, string> = {
  Liverpool: C.green, 'Man City': '#6CADDF', 'Manchester City': '#6CADDF', Arsenal: '#EF0107', Brighton: '#0057B8',
  Chelsea: '#034694', Brentford: '#e30613', Leeds: '#FFCD00', Everton: '#003399', Hull: '#F5971E', Ipswich: '#003399',
  Newcastle: '#9A9A9A', 'Aston Villa': '#b0366b', 'Man Utd': '#DA291C', 'Manchester United': '#DA291C', 'Crystal Palace': '#1B458F',
};

const API = (process.env.EXPO_PUBLIC_GENIUZ_API_URL ?? '').trim().replace(/\/+$/, '');
const fmtDate = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', day: '2-digit', month: 'short' }).format(new Date(iso)).toUpperCase();
const fmtTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
const toM = (x: any) => ({
  comp: x.competition?.name ?? '', round: x.round ?? '', date: fmtDate(x.startsAt), time: fmtTime(x.startsAt),
  home: x.homeTeam?.name ?? '', away: x.awayTeam?.name ?? '', hs: x.homeScore ?? 0, as: x.awayScore ?? 0,
});
const grp = (p: string) => (/keeper/i.test(p) ? 0 : /back|defen/i.test(p) ? 1 : /midfield/i.test(p) ? 2 : 3);
const ABBR: Record<string, string> = {
  Goalkeeper: 'GK', 'Centre-Back': 'CB', 'Left-Back': 'LB', 'Right-Back': 'RB', Defence: 'DF', 'Defensive Midfield': 'DM',
  'Central Midfield': 'CM', 'Attacking Midfield': 'AM', Midfield: 'MF', 'Left Winger': 'LW', 'Right Winger': 'RW',
  'Centre-Forward': 'CF', Offence: 'FW',
};

type M = { comp: string; round: string; date: string; time?: string; home: string; away: string; hs?: number; as?: number };
let RESULTS: M[] = [
  { comp: 'Premier League', round: 'Matchday 8', date: '17 OCT', home: 'Brentford', away: L, hs: 1, as: 2 },
  { comp: 'Champions League', round: 'Group Stage', date: '14 OCT', home: 'LASK', away: L, hs: 3, as: 6 },
  { comp: 'Premier League', round: 'Matchday 7', date: '11 OCT', home: L, away: 'Manchester City', hs: 0, as: 3 },
  { comp: 'Premier League', round: 'Matchday 6', date: '20 SEP', home: 'AFC Bournemouth', away: L, hs: 0, as: 1 },
  { comp: 'EFL Cup', round: 'Round 3', date: '15 SEP', home: L, away: 'Tottenham Hotspur', hs: 3, as: 1 },
  { comp: 'Premier League', round: 'Matchday 5', date: '12 SEP', home: L, away: 'Fulham', hs: 0, as: 0 },
  { comp: 'Champions League', round: 'Group Stage', date: '09 SEP', home: L, away: 'Atletico Madrid', hs: 2, as: 1 },
];
let FIXTURES: M[] = [
  { comp: 'Champions League', round: '', date: '20 OCT', time: '20:00', home: L, away: 'Villarreal' },
  { comp: 'Premier League', round: '', date: '25 OCT', time: '15:00', home: L, away: 'Brighton' },
  { comp: 'EFL Cup', round: '', date: '28 OCT', time: '21:00', home: L, away: 'Chelsea' },
  { comp: 'Premier League', round: '', date: '01 NOV', time: '17:30', home: L, away: 'Arsenal' },
  { comp: 'Champions League', round: '', date: '04 NOV', time: '18:45', home: 'Fenerbahçe', away: L },
  { comp: 'Premier League', round: '', date: '08 NOV', time: '15:00', home: 'Crystal Palace', away: L },
  { comp: 'Premier League', round: '', date: '22 NOV', time: '17:30', home: L, away: 'Manchester United' },
];
const TABLE = [
  ['Man City', 7, 12, 21, 7], ['Arsenal', 7, 6, 18, 6], ['Brighton', 7, 18, 16, 5], ['Chelsea', 7, 4, 13, 4],
  [L, 7, 1, 12, 3], ['Brentford', 7, 5, 10, 2], ['Leeds', 7, 3, 10, 2], ['Everton', 7, 1, 10, 2], ['Hull', 7, 1, 9, 2],
  ['Ipswich', 7, -4, 9, 3], ['Newcastle', 7, -4, 8, 2], ['Aston Villa', 7, -4, 8, 2], ['Man Utd', 7, 0, 7, 1], ['Crystal Palace', 7, -8, 7, 2],
] as [string, number, number, number, number][];

type P = [string, string, string, string, string, boolean?, string?];
let COACH = '';
let SQUAD: { title: string; list: P[] }[] = [
  { title: 'Goalkeepers', list: [
    ['1', 'Alisson', '🇧🇷', 'Brazil', 'GK', true], ['25', 'Giorgi Mamardashvili', '🇬🇪', 'Georgia', 'GK'],
    ['28', 'Freddie Woodman', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England', 'GK'], ['56', 'Vítězslav Jaroš', '🇨🇿', 'Czech Republic', 'GK'],
    ['95', 'Harvey Davies', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England', 'GK'], ['-', 'Lucca Kiaba Brughmans', '🇧🇪', 'Belgium', 'GK'] ] },
  { title: 'Defenders', list: [
    ['2', 'Joe Gomez', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England', 'CB'], ['4', 'Virgil van Dijk', '🇳🇱', 'Netherlands', 'CB', true, 'C'],
    ['-', 'Jeremy Jacquet', '🇫🇷', 'France', 'CB'], ['5', 'Ibrahima Konaté', '🇫🇷', 'France', 'CB'],
    ['66', 'Trent Alexander-Arnold', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'England', 'RB', true] ] },
  { title: 'Midfielders', list: [
    ['8', 'Dominik Szoboszlai', '🇭🇺', 'Hungary', 'MF'], ['10', 'Alexis Mac Allister', '🇦🇷', 'Argentina', 'MF', true],
    ['38', 'Ryan Gravenberch', '🇳🇱', 'Netherlands', 'MF'] ] },
  { title: 'Attackers', list: [
    ['11', 'Mohamed Salah', '🇪🇬', 'Egypt', 'RW', true, 'fire'], ['9', 'Darwin Núñez', '🇺🇾', 'Uruguay', 'CF'],
    ['18', 'Cody Gakpo', '🇳🇱', 'Netherlands', 'LW'], ['7', 'Luis Díaz', '🇨🇴', 'Colombia', 'LW'] ] },
];

type V = [string, ('bold' | 'dim' | 'pos' | 'neg')?];
type R = { r: string; name: string; sub: string; v: V[]; hl?: boolean; team?: boolean };
const PS_GOALS: R[] = [
  { r: '1', name: 'A. Isak', sub: 'Forward', v: [['5', 'bold'], ['3.9', 'dim'], ['+1.1', 'pos']] },
  { r: '2', name: 'V. Munoz', sub: 'Forward', v: [['2', 'bold'], ['0.8', 'dim'], ['+1.2', 'pos']] },
  { r: '3', name: 'C. Gakpo', sub: 'Forward', v: [['1', 'bold'], ['0.6', 'dim'], ['+0.4', 'pos']] },
];
const PS_ASSISTS: R[] = [
  { r: '1', name: 'C. Gakpo', sub: 'Forward', v: [['3', 'bold'], ['1.7', 'dim'], ['+1.3', 'pos']] },
  { r: '2', name: 'F. Wirtz', sub: 'Midfielder', v: [['2', 'bold'], ['0.8', 'dim'], ['+1.2', 'pos']] },
  { r: '3', name: 'B. Barcola', sub: 'Forward', v: [['1', 'bold'], ['0.3', 'dim'], ['+0.7', 'pos']] },
];
const PS_SOT: R[] = [
  { r: '1', name: 'A. Isak', sub: 'Forward', v: [['1.3', 'dim'], ['8', 'bold']] },
  { r: '2', name: 'D. Szoboszlai', sub: 'Midfielder', v: [['0.8', 'dim'], ['5', 'bold']] },
  { r: '3', name: 'V. Munoz', sub: 'Forward', v: [['0.7', 'dim'], ['5', 'bold']] },
];
const TS_GOALS: R[] = [
  { r: '1', name: 'Brighton', sub: 'England', team: true, v: [['23', 'bold'], ['14.9', 'dim'], ['+8.1', 'pos']] },
  { r: '2', name: 'Manchester City', sub: 'England', team: true, v: [['19', 'bold'], ['15.3', 'dim'], ['+3.7', 'pos']] },
  { r: '11', name: L, sub: 'England', team: true, hl: true, v: [['9', 'bold'], ['10.9', 'dim'], ['-1.9', 'neg']] },
];
const TS_ASSISTS: R[] = [
  { r: '1', name: 'Manchester City', sub: 'England', team: true, v: [['15', 'bold'], ['11.5', 'dim'], ['+3.5', 'pos']] },
  { r: '2', name: 'Brighton', sub: 'England', team: true, v: [['14', 'bold'], ['6.4', 'dim'], ['+7.6', 'pos']] },
  { r: '8', name: L, sub: 'England', team: true, hl: true, v: [['7', 'bold'], ['6.2', 'dim'], ['+0.8', 'pos']] },
];
const TS_SOT: R[] = [
  { r: '1', name: 'Brighton', sub: 'England', team: true, v: [['6.0', 'dim'], ['42', 'bold']] },
  { r: '2', name: 'Chelsea', sub: 'England', team: true, v: [['5.6', 'dim'], ['39', 'bold']] },
  { r: '5', name: L, sub: 'England', team: true, hl: true, v: [['5.0', 'dim'], ['35', 'bold']] },
];

const outcome = (m: M) => {
  const lh = m.home === L;
  const a = lh ? m.hs! : m.as!, b = lh ? m.as! : m.hs!;
  return a > b ? 'W' : a < b ? 'L' : 'D';
};
const oc = (o: string) => (o === 'W' ? C.green : o === 'L' ? C.red : C.outline);
const T = (p: any) => <Text {...p} style={[{ color: C.on, fontSize: 14 }, p.style]} />;

let LOGOS: Record<string, string> = {};
function Crest({ name, size = 24 }: { name: string; size?: number }) {
  const [bad, setBad] = useState(false);
  const url = LOGOS[name];
  if (url && !bad) {
    return <Image source={{ uri: url }} onError={() => setBad(true)} resizeMode="contain" style={{ width: size, height: size }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.high, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name === L ? 'shield' : 'football'} size={size * 0.62} color={TC[name] || C.dim} />
    </View>
  );
}
function Arrow({ onPress, name = 'arrow-forward', size = 32 }: { onPress?: () => void; name?: any; size?: number }) {
  return (
    <Pressable onPress={onPress} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.high, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.56} color={C.on} />
    </Pressable>
  );
}
const Card = ({ children, r = 12 }: any) => <View style={{ backgroundColor: C.low, borderRadius: r, padding: 14 }}>{children}</View>;
const H2 = ({ children }: any) => <Text style={{ color: C.on, fontSize: 16, fontWeight: '600' }}>{children}</Text>;
const Label = ({ children, color = C.dim, style }: any) => (
  <Text style={[{ color, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }, style]}>{children}</Text>
);

function Dropdown({ value, options, onChange, count }: { value: string; options: string[]; onChange: (v: string) => void; count?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ zIndex: 20, marginTop: 12, marginBottom: 8 }}>
      <Pressable onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.mid, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.high, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="globe-outline" size={14} color={C.green} />
          </View>
          <T style={{ fontSize: 12, fontWeight: '600' }}>{value}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {count ? <Label color={C.green}>{count}</Label> : null}
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.dim} />
        </View>
      </Pressable>
      {open && (
        <View style={{ backgroundColor: C.high, borderRadius: 12, marginTop: 4, paddingVertical: 4 }}>
          {options.map((o) => (
            <Pressable key={o} onPress={() => { onChange(o); setOpen(false); }} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 }}>
              <T style={{ fontSize: 12, fontWeight: '600', color: o === value ? C.on : C.dim }}>{o}</T>
              {o === value && <Ionicons name="checkmark" size={16} color={C.green} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function StatCard({ title, badge, cols, rows, boxed, onArrow, rad = 12 }: { title: string; badge?: string; cols: string[]; rows: R[]; boxed?: boolean; onArrow?: () => void; rad?: number }) {
  const col = (k?: string) => (k === 'pos' ? C.green : k === 'neg' ? C.red : k === 'dim' ? C.dim : C.on);
  return (
    <Card r={rad}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <H2>{title}</H2>
          {badge ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.high, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Ionicons name="information-circle-outline" size={13} color={C.dim} />
              <Text style={{ color: C.dim, fontSize: 10, fontWeight: '700' }}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Arrow onPress={onArrow} size={rad > 12 ? 28 : 32} />
      </View>
      <View style={{ flexDirection: 'row', paddingVertical: 4, paddingHorizontal: boxed ? 8 : 4 }}>
        <Label style={{ width: 24 }}>#</Label>
        <Label style={{ flex: 1 }}>{rows[0]?.team ? 'Team' : 'Player'}</Label>
        {cols.map((c) => <Label key={c} style={{ width: 44, textAlign: 'right' }}>{c}</Label>)}
      </View>
      <View style={{ gap: boxed ? 4 : 0 }}>
        {rows.map((x) => (
          <View key={x.r + x.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: boxed ? 8 : 10, paddingHorizontal: boxed ? 8 : 4, borderRadius: 8, backgroundColor: x.hl ? C.high : boxed ? C.mid : 'transparent' }}>
            <Text style={{ width: 24, color: x.hl ? C.green : C.dim, fontSize: 12, fontWeight: x.hl ? '700' : '600', textAlign: boxed ? 'center' : 'left' }}>{x.r}</Text>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 }}>
              {!boxed && (x.team ? <Crest name={x.name} size={20} /> : (
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.high, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={14} color={C.dim} />
                </View>
              ))}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={{ color: C.on, fontSize: boxed ? 16 : 12, fontWeight: '600' }}>{x.name}</Text>
                <Text numberOfLines={1} style={{ color: C.dim, fontSize: boxed ? 12 : 10 }}>{x.sub}</Text>
              </View>
            </View>
            {x.v.map(([t, k], i) => (
              <Text key={i} style={{ width: 44, textAlign: 'right', color: col(k), fontSize: k === 'bold' ? 16 : 14, fontWeight: k === 'bold' || k === 'pos' || k === 'neg' ? '700' : '400' }}>{t}</Text>
            ))}
          </View>
        ))}
      </View>
    </Card>
  );
}

function Overview({ go }: { go: (t: string) => void }) {
  return (
    <View style={{ gap: 16 }}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12 }}>
          <H2>Upcoming fixture</H2><Arrow onPress={() => go('Fixtures')} />
        </View>
        <View style={{ backgroundColor: C.mid, borderRadius: 8, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 8 }}><Crest name={FIXTURES[0]?.home ?? L} size={48} /><T style={{ fontSize: 16, fontWeight: '600' }}>{FIXTURES[0]?.home ?? L}</T></View>
          <View style={{ alignItems: 'center', paddingHorizontal: 12 }}>
            <Text style={{ color: C.on, fontSize: 32, fontWeight: '700' }}>{FIXTURES[0]?.time ?? '--:--'}</Text><Label>{FIXTURES[0]?.date ?? ''}</Label>
          </View>
          <View style={{ flex: 1, alignItems: 'center', gap: 8 }}><Crest name={FIXTURES[0]?.away ?? ''} size={48} /><T style={{ fontSize: 16, fontWeight: '600' }}>{FIXTURES[0]?.away ?? 'TBC'}</T></View>
        </View>
      </Card>
      <Card>
        <H2>Results</H2>
        <Text style={{ color: C.dim, fontSize: 12 }}>Catch up on the latest {L} matches</Text>
        <View style={{ gap: 8, marginTop: 12 }}>
          {RESULTS.slice(0, 5).map((m) => {
            const o = outcome(m);
            return (
              <View key={m.date + m.home} style={{ backgroundColor: C.mid, borderRadius: 8, padding: 12, overflow: 'hidden' }}>
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: oc(o) }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 6, marginBottom: 6 }}>
                  <Label>{m.date}</Label><Text style={{ color: C.on, fontSize: 12, fontWeight: '600' }}>FT</Text>
                </View>
                {[[m.home, m.hs], [m.away, m.as]].map(([n, s], i) => {
                  const win = (i === 0 ? m.hs! > m.as! : m.as! > m.hs!);
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 6, marginTop: i ? 4 : 0 }}>
                      <Crest name={n as string} size={20} />
                      <Text numberOfLines={1} style={{ flex: 1, marginLeft: 8, color: C.on, fontSize: n === L ? 16 : 14, fontWeight: n === L ? '600' : '400' }}>{n}</Text>
                      <Text style={{ color: win && n === L ? C.green : C.on, fontSize: 16, fontWeight: win ? '700' : '600', paddingHorizontal: 8 }}>{s}</Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
        <Pressable onPress={() => go('Results')} style={{ marginTop: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: C.high, alignItems: 'center' }}>
          <T style={{ fontSize: 16, fontWeight: '600' }}>View all recent results</T>
        </Pressable>
      </Card>
    </View>
  );
}

let COMPS = ['All Competitions'];

function Fixtures() {
  const [c, setC] = useState(COMPS[0]);
  const list = FIXTURES.filter((m) => c === COMPS[0] || m.comp === c);
  return (
    <View>
      <Dropdown value={c} options={COMPS} onChange={setC} />
      <View style={{ gap: 12, marginTop: 4 }}>
        {list.map((m) => (
          <View key={m.date + m.away} style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 }}>
              <Ionicons name="football-outline" size={14} color={C.dim} /><Label>{m.comp}</Label>
            </View>
            <View style={{ backgroundColor: C.low, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 64, alignItems: 'center' }}>
                <Label>{m.date}</Label><Text style={{ color: C.on, fontSize: 16, fontWeight: '600' }}>{m.time}</Text>
              </View>
              <View style={{ width: 1, height: 40, backgroundColor: C.variant, marginHorizontal: 12 }} />
              <View style={{ flex: 1, gap: 4 }}>
                {[m.home, m.away].map((n) => (
                  <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Crest name={n} size={24} /><T style={{ fontWeight: '500' }}>{n}</T>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Results() {
  const [c, setC] = useState(COMPS[0]);
  const list = RESULTS.filter((m) => c === COMPS[0] || m.comp === c);
  const all = RESULTS.map(outcome);
  const w = all.filter((x) => x === 'W').length, d = all.filter((x) => x === 'D').length, l = all.filter((x) => x === 'L').length;
  return (
    <View>
      <Dropdown value={c} options={COMPS} onChange={setC} count={`${list.length} Matches`} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.low, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Label>Recent Form:</Label>
          {all.slice(0, 5).map((o, i) => (
            <View key={i} style={{ width: 20, height: 20, borderRadius: 4, backgroundColor: oc(o), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: o === 'L' ? '#690005' : C.onGreen, fontSize: 10, fontWeight: '700' }}>{o}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: C.green, fontSize: 10, fontWeight: '600' }}>{w}W · {d}D · {l}L</Text>
      </View>
      {list.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <T style={{ fontSize: 16, fontWeight: '600' }}>No completed fixtures</T>
          <Text style={{ color: C.dim, fontSize: 12, marginTop: 4 }}>No recorded match results found for this competition.</Text>
        </View>
      )}
      <View style={{ gap: 12 }}>
        {list.map((m) => {
          const o = outcome(m);
          return (
            <View key={m.date + m.home} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name={m.comp === 'Champions League' ? 'star' : m.comp === 'EFL Cup' ? 'trophy' : 'football-outline'} size={14} color={m.comp === 'Champions League' ? '#93ccff' : m.comp === 'EFL Cup' ? C.tert : C.dim} />
                  <Label>{m.comp}</Label>
                </View>
                <Label color={m.comp === 'Champions League' ? '#93ccff' : m.comp === 'EFL Cup' ? C.tert : m.round === 'Matchday 8' ? C.green : C.dim}>{m.round}</Label>
              </View>
              <View style={{ backgroundColor: C.mid, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' }}>
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, backgroundColor: oc(o) }} />
                <View style={{ width: 56, alignItems: 'center', paddingLeft: 4 }}>
                  <Text style={{ color: C.on, fontSize: 12, fontWeight: '600' }}>{m.date}</Text>
                  <Label style={{ marginTop: 2 }}>FT</Label>
                </View>
                <View style={{ width: 1, height: 36, backgroundColor: C.variant, marginHorizontal: 4 }} />
                <View style={{ flex: 1, gap: 4, paddingHorizontal: 8 }}>
                  {[m.home, m.away].map((n) => (
                    <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Crest name={n} size={20} />
                      <Text numberOfLines={1} style={{ color: C.on, fontSize: 14, fontWeight: n === L ? '600' : '400', flex: 1 }}>{n}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4, paddingHorizontal: 4 }}>
                  {[m.hs!, m.as!].map((s, i) => {
                    const lv = (i === 0) === (m.home === L);
                    const color = o === 'D' ? C.dim : lv ? (o === 'W' ? C.green : C.red) : C.on;
                    return <Text key={i} style={{ color, fontSize: 16, fontWeight: '700', minWidth: 20, textAlign: 'right' }}>{s}</Text>;
                  })}
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Standings() {
  const [f, setF] = useState('All');
  return (
    <View style={{ paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.high, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99 }}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#38003c', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="paw" size={12} color="#fff" />
          </View>
          <T style={{ fontSize: 12, fontWeight: '600' }}>Premier League</T>
          <Ionicons name="chevron-down" size={18} color={C.dim} />
        </View>
        <Arrow name="open-outline" size={32} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {['All', 'Home', 'Away', 'Form'].map((p) => (
          <Pressable key={p} onPress={() => setF(p)} style={{ paddingHorizontal: 14, paddingVertical: 4, borderRadius: 99, backgroundColor: f === p ? '#fff' : C.high }}>
            <Text style={{ color: f === p ? C.bg : C.dim, fontSize: 12, fontWeight: f === p ? '700' : '600' }}>{p}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingHorizontal: 4 }}>
        <H2>Latest table</H2>
        <View style={{ flexDirection: 'row', gap: 4 }}><Arrow name="chevron-back" size={28} /><Arrow name="chevron-forward" size={28} /></View>
      </View>
      <View style={{ backgroundColor: C.low, borderRadius: 12, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', height: 36, paddingHorizontal: 8, backgroundColor: 'rgba(32,31,31,0.6)' }}>
          <Label style={{ width: 28, textAlign: 'center' }}>#</Label><Label style={{ flex: 1, paddingLeft: 4 }}>Team</Label>
          <Label style={{ width: 28, textAlign: 'center' }}>P</Label><Label style={{ width: 32, textAlign: 'center' }}>GD</Label>
          <Label color={C.on} style={{ width: 36, textAlign: 'center' }}>PTS</Label><Label style={{ width: 28, textAlign: 'center' }}>W</Label>
        </View>
        {TABLE.map(([n, p, gd, pts, w], i) => {
          const me = n === L;
          return (
            <View key={n} style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 8, backgroundColor: me ? C.high : 'transparent' }}>
              {i < 5 && <View style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4, backgroundColor: i < 4 ? C.blue : C.orange }} />}
              <Text style={{ width: 28, textAlign: 'center', color: me ? C.green : C.on, fontSize: 12, fontWeight: '700' }}>{i + 1}</Text>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 4 }}>
                <Crest name={n} size={20} />
                <Text numberOfLines={1} style={{ color: C.on, fontSize: 14, fontWeight: me ? '700' : '500', flexShrink: 1 }}>{n}</Text>
              </View>
              <Text style={{ width: 28, textAlign: 'center', color: me ? C.on : C.dim, fontSize: 12, fontWeight: '600' }}>{p}</Text>
              <Text style={{ width: 32, textAlign: 'center', color: me ? C.on : C.dim, fontSize: 12, fontWeight: '600' }}>{gd}</Text>
              <Text style={{ width: 36, textAlign: 'center', color: me ? C.green : C.on, fontSize: 12, fontWeight: '700' }}>{pts}</Text>
              <Text style={{ width: 28, textAlign: 'center', color: me ? C.on : C.dim, fontSize: 12, fontWeight: '600' }}>{w}</Text>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 12, paddingHorizontal: 8 }}>
        {[[C.blue, 'Champions League'], [C.orange, 'Europa League']].map(([c, t]) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c }} /><Label>{t}</Label>
          </View>
        ))}
      </View>
    </View>
  );
}

function Squad() {
  return (
    <View style={{ gap: 20, paddingTop: 12 }}>
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 4 }}><Label>Coach</Label><Label color={C.outline}>1</Label></View>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.high, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="person" size={22} color={C.dim} />
              </View>
              <View>
                <T style={{ fontSize: 16, fontWeight: '600' }}>{COACH || 'Not listed'}</T>
              </View>
            </View>
            <Text style={{ color: C.dim, fontSize: 10, fontWeight: '700', backgroundColor: C.variant, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' }}>Manager</Text>
          </View>
        </Card>
      </View>
      {SQUAD.map((g) => (
        <View key={g.title}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, paddingHorizontal: 4 }}><Label>{g.title}</Label><Label color={C.outline}>{g.list.length}</Label></View>
          <View style={{ backgroundColor: C.low, borderRadius: 12, overflow: 'hidden' }}>
            {g.list.map(([num, name, flag, country, pos, hl, badge], i) => (
              <View key={name} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(42,42,42,0.4)' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: C.high, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: hl ? C.green : C.dim, fontSize: 12, fontWeight: '700' }}>{num}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text numberOfLines={1} style={{ color: C.on, fontSize: 14, fontWeight: badge ? '600' : '500', flexShrink: 1 }}>{name}</Text>
                      {badge === 'C' && <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(75,226,119,0.2)', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: C.green, fontSize: 9, fontWeight: '700' }}>C</Text></View>}
                      {badge === 'fire' && <Ionicons name="flame" size={14} color={C.tert} />}
                    </View>
                    <Text style={{ color: C.dim, fontSize: 12 }}>{flag}  {country}</Text>
                  </View>
                </View>
                <Text style={{ color: hl ? C.green : C.dim, backgroundColor: hl ? 'rgba(75,226,119,0.1)' : C.mid, fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, overflow: 'hidden' }}>{pos}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Filters() {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 4 }}>
      {[['trophy', 'Premier League', C.green], ['options-outline', 'All statistics', C.dim]].map(([ic, t, col]) => (
        <View key={t} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.mid, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name={ic as any} size={18} color={col} /><Text numberOfLines={1} style={{ color: C.on, fontSize: 12, fontWeight: '600', flex: 1 }}>{t}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={C.dim} />
        </View>
      ))}
    </View>
  );
}

function Soon() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48 }}>
      <T style={{ fontSize: 16, fontWeight: '600' }}>Details coming soon</T>
    </View>
  );
}

export default function TeamPage({ onBack }: { onBack?: () => void }) {
  const [tab, setTab] = useState('Overview');
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string | string[] }>();
  const teamName = (Array.isArray(params.name) ? params.name[0] : params.name) ?? '';
  const [team, setTeam] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  useEffect(() => {
    let off = false;
    setStatus('loading');
    fetch(`${API}/football/team?name=${encodeURIComponent(teamName)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad'))))
      .then((d) => { if (!off) { setTeam(d); setStatus('ok'); } })
      .catch(() => { if (!off) setStatus('error'); });
    return () => { off = true; };
  }, [teamName]);
  L = team?.name ?? teamName;
  RESULTS = (team?.results ?? []).map(toM);
  FIXTURES = (team?.fixtures ?? []).map(toM);
  COMPS = ['All Competitions', ...Array.from(new Set([...RESULTS, ...FIXTURES].map((m) => m.comp)))];
  COACH = team?.coach ?? '';
  const logoOf = (t: any) => t?.logoUrl ?? t?.crest ?? t?.logo ?? t?.image;
  LOGOS = {};
  [...(team?.results ?? []), ...(team?.fixtures ?? [])].forEach((x: any) => {
    [x.homeTeam, x.awayTeam].forEach((t: any) => { const u = logoOf(t); if (t?.name && u) LOGOS[t.name] = u; });
  });
  const ownLogo = logoOf(team);
  if (ownLogo) LOGOS[L] = ownLogo;
  const titles = ['Goalkeepers', 'Defenders', 'Midfielders', 'Attackers'];
  SQUAD = titles.map((title, gi) => ({
    title,
    list: (team?.squad ?? [])
      .filter((x: any) => grp(x.position ?? '') === gi)
      .map((x: any) => ['-', x.name, '', x.nationality ?? '', ABBR[x.position ?? ''] ?? String(x.position ?? '').slice(0, 3).toUpperCase()] as P),
  })).filter((g) => g.list.length > 0);
  const ok = status === 'ok';
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top, backgroundColor: C.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Pressable onPress={onBack} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-back" size={20} color={C.on} />
            </Pressable>
            <View style={{ marginRight: 8 }}><Crest name={L} size={36} /></View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: C.on, fontSize: 16, fontWeight: '600' }}>{L}</Text>
                <Label color={C.green}>{tab}</Label>
              </View>
              <Text style={{ color: C.dim, fontSize: 12 }}>{team?.venue ?? ''}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="search" size={20} color={C.dim} /></View>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={18} color={C.onGreen} />
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 20 }} style={{ height: 44, flexGrow: 0 }}>
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={{ height: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: tab === t ? C.on : 'transparent' }}>
              <Text style={{ color: tab === t ? C.on : C.dim, fontSize: 12, fontWeight: '600' }}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        {status === 'loading' && <Text style={{ color: C.dim, textAlign: 'center', paddingVertical: 48 }}>Loading team...</Text>}
        {status === 'error' && <Text style={{ color: C.dim, textAlign: 'center', paddingVertical: 48 }}>Details for this team are not available yet.</Text>}
        {ok && tab === 'Overview' && <Overview go={setTab} />}
        {ok && tab === 'Fixtures' && <Fixtures />}
        {ok && tab === 'Results' && <Results />}
        {ok && tab === 'Standings' && <StandingsTab team={L} />}
        {ok && tab === 'Player Stats' && <PlayerStatsTab team={L} />}
        {ok && tab === 'Team Stats' && <TeamStatsTab team={L} />}
        {ok && tab === 'Squad' && <Squad />}
      </ScrollView>
    </View>
  );
}
