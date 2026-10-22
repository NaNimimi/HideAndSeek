// Отправка позиции и проверка зоны — и в фоне, и при открытом приложении.
//
// В отдельной сборке (APK / dev build) работает фоновая задача expo-location:
// позиция уходит даже с выключенным экраном, в шторке висит уведомление «Идёт игра».
// В Expo Go и в Telegram (веб) фоновых задач нет — тогда позицию шлёт экран игры, пока он открыт.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { colors } from '@/theme';
import { distanceM, timeline, type Player, type Role, type Room } from './game';
import { cancelGameNotifications, notifyNow, scheduleGameNotifications, setupNotifications } from './notify';
import { pushGameLocation, setStatus } from './rooms';

export const LOCATION_TASK = 'pryatki-location';
const SESSION_KEY = 'activeSession';
const UPLOAD_EVERY_MS = 10_000;

export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
/** Фоновая геолокация возможна только в установленном приложении. */
export const canTrackInBackground = !isExpoGo && Platform.OS !== 'web';

export type Session = { code: string; playerId: string; role: Role; alive: boolean; room: Room };
export type TrackMode = 'background' | 'foreground';
export type TrackerState = { outSince: number | null };
type Loc = { lat: number; lng: number; t: number; accuracy: number | null };

let session: Session | null = null;
let lastLoc: Loc | null = null;
let lastUpload = 0;
let outSince: number | null = null;
const listeners = new Set<(s: TrackerState) => void>();

function emit() {
  listeners.forEach((l) => l({ outSince }));
}

export function subscribeTracker(cb: (s: TrackerState) => void) {
  listeners.add(cb);
  cb({ outSince });
  return () => {
    listeners.delete(cb);
  };
}

async function loadSession(): Promise<Session | null> {
  if (session) return session;
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  session = raw ? (JSON.parse(raw) as Session) : null;
  return session;
}

/** Активная игра (чтобы вернуться в неё после перезапуска). */
export async function getActiveSession(): Promise<Session | null> {
  const s = await loadSession();
  if (s && timeline(s.room, Date.now()).phase === 'over') {
    await stopTracking();
    return null;
  }
  return s;
}

async function saveSession(s: Session | null) {
  session = s;
  if (s) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else await AsyncStorage.removeItem(SESSION_KEY);
}

/** Главная функция: вызывается на каждую новую позицию (из фона или с экрана). */
export async function handleLocation(loc: Loc | null) {
  if (loc) lastLoc = loc;
  const s = await loadSession();
  if (!s || !s.alive || !lastLoc) return;

  const now = Date.now();
  const tl = timeline(s.room, now);
  if (tl.phase === 'over') return;

  if (loc && now - lastUpload >= UPLOAD_EVERY_MS) {
    lastUpload = now;
    pushGameLocation(s.code, s.playerId, loc, loc.t).catch(() => {
      lastUpload = 0; // не получилось — попробуем со следующей точкой
    });
  }

  if (s.role !== 'hider') return;

  // Запас на погрешность GPS — до 30 м.
  const outside = distanceM(lastLoc, tl.zone) - Math.min(lastLoc.accuracy ?? 0, 30) > tl.zone.r;
  const grace = s.room.settings.graceSec * 1000;

  if (!outside) {
    if (outSince !== null) {
      outSince = null;
      emit();
    }
    return;
  }
  if (outSince === null) {
    outSince = now;
    emit();
    notifyNow('⚠️ Ты вне зоны!', `Вернись в зону за ${s.room.settings.graceSec} сек, иначе выбываешь.`);
  } else if (now - outSince >= grace) {
    outSince = null;
    await saveSession({ ...s, alive: false });
    emit();
    await setStatus(s.code, s.playerId, 'out').catch(() => {});
    notifyNow('❌ Ты выбыл', 'Ты слишком долго был вне зоны.');
    stopBackgroundUpdates();
  }
}

/** Проверка зоны по последней известной позиции (вызывается каждую секунду с экрана игры). */
export function trackerTick() {
  handleLocation(null);
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const p = data.locations[data.locations.length - 1];
    await handleLocation({ lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp, accuracy: p.coords.accuracy });
  });
}

export async function hasBackgroundPermission(): Promise<boolean> {
  if (!canTrackInBackground) return false;
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function requestBackgroundPermission(): Promise<boolean> {
  if (!canTrackInBackground) return false;
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return false;
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.granted;
}

/** Старт игры на этом телефоне. Возвращает, в каком режиме идёт трекинг. */
export async function startTracking(room: Room, me: Player, players: Player[]): Promise<TrackMode> {
  const prev = await loadSession();
  const sameGame = prev && prev.code === room.code && prev.room.startedAt === room.startedAt;
  const alive = me.status === 'alive' && (!sameGame || prev.alive);
  if (!sameGame) {
    outSince = null;
    lastUpload = 0;
    emit();
  }
  await saveSession({ code: room.code, playerId: me.id, role: me.role, alive, room });

  if (!sameGame && (await setupNotifications())) {
    scheduleGameNotifications(room, me, players);
  }

  if (!alive || !(await hasBackgroundPermission())) return 'foreground';
  try {
    if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Fitness,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Прятки — идёт игра',
          notificationBody: 'Позиция передаётся только до конца игры',
          notificationColor: colors.primary,
        },
      });
    }
    return 'background';
  } catch {
    return 'foreground';
  }
}

/** Игрока нашли/он выбыл — дальше слать позицию не нужно. */
export async function markNotAlive() {
  const s = await loadSession();
  if (s) await saveSession({ ...s, alive: false });
  outSince = null;
  emit();
  await stopBackgroundUpdates();
}

async function stopBackgroundUpdates() {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch {
    // ignore
  }
}

/** Игра закончилась или игрок вышел. */
export async function stopTracking() {
  await stopBackgroundUpdates();
  await cancelGameNotifications();
  await saveSession(null);
  outSince = null;
  lastLoc = null;
  emit();
}
