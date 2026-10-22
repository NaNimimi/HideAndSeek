import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from './firebase';
import {
  buildZones,
  DEFAULT_SETTINGS,
  type LatLng,
  type Player,
  type Role,
  type Room,
  type Settings,
} from './game';

// Структура:
// rooms/{code}                              — Room
// rooms/{code}/players/{playerId}           — Player
// rooms/{code}/players/{playerId}/locs/{t}  — история позиций во время игры

const roomRef = (code: string) => doc(db, 'rooms', code);
const playersCol = (code: string) => collection(db, 'rooms', code, 'players');
const playerRef = (code: string, id: string) => doc(db, 'rooms', code, 'players', id);
const locsCol = (code: string, id: string) => collection(db, 'rooms', code, 'players', id, 'locs');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // без 0/O и 1/I

function randomCode(): string {
  let c = '';
  for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

export async function createRoom(hostId: string, hostName: string): Promise<string> {
  let code = randomCode();
  while ((await getDoc(roomRef(code))).exists()) code = randomCode();

  const room: Room = {
    code,
    hostId,
    status: 'lobby',
    settings: DEFAULT_SETTINGS,
    center: null,
    zones: [],
    startedAt: null,
  };
  await setDoc(roomRef(code), room);
  await joinRoom(code, hostId, hostName, 'seeker');
  return code;
}

/** Возвращает текст ошибки или null, если всё ок. */
export async function joinRoom(
  code: string,
  id: string,
  name: string,
  role: Role = 'hider',
): Promise<string | null> {
  const snap = await getDoc(roomRef(code));
  if (!snap.exists()) return 'Комната не найдена';
  const existing = await getDoc(playerRef(code, id));
  if (existing.exists()) {
    await updateDoc(playerRef(code, id), { name });
    return null;
  }
  if ((snap.data() as Room).status !== 'lobby') return 'Игра уже началась';
  const player: Player = { id, name, role, status: 'alive', lastLoc: null };
  await setDoc(playerRef(code, id), player);
  return null;
}

export async function leaveRoom(code: string, id: string) {
  await deleteDoc(playerRef(code, id));
}

export function subscribeRoom(code: string, cb: (room: Room | null) => void) {
  return onSnapshot(roomRef(code), (s) => cb(s.exists() ? (s.data() as Room) : null));
}

export function subscribePlayers(code: string, cb: (players: Player[]) => void) {
  return onSnapshot(playersCol(code), (s) => cb(s.docs.map((d) => d.data() as Player)));
}

export async function updateSettings(code: string, settings: Settings) {
  await updateDoc(roomRef(code), { settings });
}

export async function setCenter(code: string, center: LatLng) {
  await updateDoc(roomRef(code), { center });
}

export async function setRole(code: string, id: string, role: Role) {
  await updateDoc(playerRef(code, id), { role });
}

export async function setStatus(code: string, id: string, status: Player['status']) {
  await updateDoc(playerRef(code, id), { status });
}

export async function startGame(room: Room) {
  if (!room.center) throw new Error('Не выбран центр зоны');
  await updateDoc(roomRef(room.code), {
    status: 'playing',
    zones: buildZones(room.center, room.settings),
    startedAt: Date.now(),
  });
}

/** Вернуть всех в лобби для новой игры. */
export async function resetGame(code: string, players: Player[]) {
  await updateDoc(roomRef(code), { status: 'lobby', zones: [], startedAt: null });
  await Promise.all(players.map((p) => setStatus(code, p.id, 'alive')));
}

/** В лобби: живая позиция (видна всем, чтобы хост видел, где игроки). */
export async function pushLobbyLocation(code: string, id: string, loc: LatLng, t: number) {
  await updateDoc(playerRef(code, id), { lastLoc: { ...loc, t } });
}

/** В игре: позиция пишется в историю, а живую позицию больше никто не видит. */
export async function pushGameLocation(code: string, id: string, loc: LatLng, t: number) {
  await setDoc(doc(locsCol(code, id), String(t)), { ...loc, t });
}

/** Где был игрок в момент `at` (последняя точка не позже `at`). */
export async function locationAt(code: string, id: string, at: number) {
  const q = query(locsCol(code, id), where('t', '<=', at), orderBy('t', 'desc'), limit(1));
  const s = await getDocs(q);
  return s.empty ? null : (s.docs[0].data() as LatLng & { t: number });
}
