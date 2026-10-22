// Чистая игровая логика: без Firebase и UI, чтобы все телефоны считали одинаково.

export type LatLng = { lat: number; lng: number };
export type Zone = LatLng & { r: number };
export type Role = 'seeker' | 'hider';
export type PlayerStatus = 'alive' | 'found' | 'out';
export type RoomStatus = 'lobby' | 'playing';

export type Settings = {
  startRadius: number; // м
  endRadius: number; // м
  shrinkSteps: number; // сколько раз зона сужается
  shrinkEveryMin: number; // через сколько минут каждое сужение
  shiftCenter: boolean; // новая зона смещается внутри старой
  hideTimeMin: number; // время спрятаться до старта поиска
  finalMinutes: number; // последние минуты на минимальной зоне
  pingEveryMin: number; // как часто показывать точки
  pingDelayMin: number; // точка показывает, где игрок был N минут назад
  hidersSeeSeeker: boolean;
  hidersSeeTeammates: boolean;
  anonymous: boolean; // точки прячущихся без имён
  graceSec: number; // сколько секунд можно быть вне зоны
};

export const DEFAULT_SETTINGS: Settings = {
  startRadius: 1000,
  endRadius: 300,
  shrinkSteps: 4,
  shrinkEveryMin: 5,
  shiftCenter: true,
  hideTimeMin: 3,
  finalMinutes: 5,
  pingEveryMin: 2,
  pingDelayMin: 2,
  hidersSeeSeeker: false,
  hidersSeeTeammates: false,
  anonymous: false,
  graceSec: 15,
};

export type PresetId = 'quick' | 'classic' | 'marathon';

export const PRESETS: Record<PresetId, { label: string; settings: Partial<Settings> }> = {
  quick: {
    label: 'Быстрая',
    settings: { startRadius: 600, endRadius: 200, shrinkSteps: 3, shrinkEveryMin: 3, hideTimeMin: 2, finalMinutes: 3, pingEveryMin: 1, pingDelayMin: 1 },
  },
  classic: {
    label: 'Классика',
    settings: { startRadius: 1000, endRadius: 300, shrinkSteps: 4, shrinkEveryMin: 5, hideTimeMin: 3, finalMinutes: 5, pingEveryMin: 2, pingDelayMin: 2 },
  },
  marathon: {
    label: 'Марафон',
    settings: { startRadius: 2000, endRadius: 400, shrinkSteps: 6, shrinkEveryMin: 8, hideTimeMin: 5, finalMinutes: 10, pingEveryMin: 3, pingDelayMin: 3 },
  },
};

export function matchPreset(s: Settings): PresetId | null {
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    const p = PRESETS[id].settings;
    if ((Object.keys(p) as (keyof Settings)[]).every((k) => p[k] === s[k])) return id;
  }
  return null;
}

export function totalMinutes(s: Settings): number {
  return s.hideTimeMin + s.shrinkSteps * s.shrinkEveryMin + s.finalMinutes;
}

export type Room = {
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: Settings;
  center: LatLng | null;
  zones: Zone[]; // zones[0] — стартовая, zones[shrinkSteps] — финальная
  startedAt: number | null; // ms
};

export type Player = {
  id: string;
  name: string;
  role: Role;
  status: PlayerStatus;
  lastLoc: (LatLng & { t: number }) | null;
};

const MIN = 60_000;
const EARTH_R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

function offset(p: LatLng, meters: number, bearingRad: number): LatLng {
  const dLat = (meters * Math.cos(bearingRad)) / EARTH_R;
  const dLng = (meters * Math.sin(bearingRad)) / (EARTH_R * Math.cos(rad(p.lat)));
  return { lat: p.lat + deg(dLat), lng: p.lng + deg(dLng) };
}

/** Все зоны игры заранее. Каждая следующая целиком лежит внутри предыдущей. */
export function buildZones(center: LatLng, s: Settings): Zone[] {
  const zones: Zone[] = [{ ...center, r: s.startRadius }];
  for (let i = 1; i <= s.shrinkSteps; i++) {
    const prev = zones[i - 1];
    const r = s.startRadius - ((s.startRadius - s.endRadius) * i) / s.shrinkSteps;
    let c: LatLng = prev;
    if (s.shiftCenter) {
      // Случайный сдвиг, но не дальше чем на (rPrev - r) — чтобы новая зона была внутри старой.
      const maxShift = (prev.r - r) * 0.8;
      c = offset(prev, Math.sqrt(Math.random()) * maxShift, Math.random() * 2 * Math.PI);
    }
    zones.push({ ...c, r });
  }
  return zones;
}

export type Phase = 'hiding' | 'seeking' | 'final' | 'over';

export type Timeline = {
  phase: Phase;
  zoneIndex: number;
  zone: Zone;
  nextZone: Zone | null;
  msToNextShrink: number | null;
  msToEnd: number;
  msToSeekStart: number;
  /** Номер текущего пинга (0 = пингов ещё не было). */
  pingIndex: number;
  msToNextPing: number | null;
  seekStart: number;
  endAt: number;
};

export function timeline(room: Room, now: number): Timeline {
  const s = room.settings;
  const start = room.startedAt ?? now;
  const seekStart = start + s.hideTimeMin * MIN;
  const finalStart = seekStart + s.shrinkSteps * s.shrinkEveryMin * MIN;
  const endAt = finalStart + s.finalMinutes * MIN;

  const sinceSeek = now - seekStart;
  const zoneIndex =
    sinceSeek < 0 ? 0 : Math.min(s.shrinkSteps, Math.floor(sinceSeek / (s.shrinkEveryMin * MIN)));
  const zone = room.zones[zoneIndex];
  const nextZone = zoneIndex < s.shrinkSteps ? room.zones[zoneIndex + 1] : null;

  let phase: Phase;
  if (now < seekStart) phase = 'hiding';
  else if (now < finalStart) phase = 'seeking';
  else if (now < endAt) phase = 'final';
  else phase = 'over';

  const msToNextShrink = nextZone
    ? seekStart + (zoneIndex + 1) * s.shrinkEveryMin * MIN - now
    : null;

  const pingMs = s.pingEveryMin * MIN;
  const pingIndex = sinceSeek < 0 ? 0 : Math.floor(sinceSeek / pingMs);
  const msToNextPing =
    phase === 'over' ? null : sinceSeek < 0 ? -sinceSeek + pingMs : pingMs - (sinceSeek % pingMs);

  return {
    phase,
    zoneIndex,
    zone,
    nextZone,
    msToNextShrink,
    msToEnd: endAt - now,
    msToSeekStart: seekStart - now,
    pingIndex,
    msToNextPing,
    seekStart,
    endAt,
  };
}

/** Момент, позицию на который показывает пинг №index. */
export function pingSnapshotTime(room: Room, pingIndex: number): number {
  const s = room.settings;
  const seekStart = (room.startedAt ?? 0) + s.hideTimeMin * MIN;
  return seekStart + pingIndex * s.pingEveryMin * MIN - s.pingDelayMin * MIN;
}

/** Кого и каким цветом я вижу на пингах. */
export function visiblePingTargets(
  me: Player,
  players: Player[],
  s: Settings,
): { player: Player; color: string; label: string | null }[] {
  const out: { player: Player; color: string; label: string | null }[] = [];
  for (const p of players) {
    if (p.id === me.id || p.status !== 'alive') continue;
    const hiderLabel = s.anonymous ? null : p.name;
    if (me.role === 'seeker' && p.role === 'hider') {
      out.push({ player: p, color: '#e53935', label: hiderLabel });
    } else if (me.role === 'hider' && p.role === 'seeker' && s.hidersSeeSeeker) {
      out.push({ player: p, color: '#e53935', label: `Охотник ${p.name}` });
    } else if (me.role === 'hider' && p.role === 'hider' && s.hidersSeeTeammates) {
      out.push({ player: p, color: '#43a047', label: hiderLabel });
    }
  }
  return out;
}

export type Result = { finished: false } | { finished: true; winner: Role };

export function gameResult(players: Player[], tl: Timeline): Result {
  const aliveHiders = players.filter((p) => p.role === 'hider' && p.status === 'alive');
  if (aliveHiders.length === 0) return { finished: true, winner: 'seeker' };
  if (tl.phase === 'over') return { finished: true, winner: 'hider' };
  return { finished: false };
}

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
