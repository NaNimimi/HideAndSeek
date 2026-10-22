import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { colors } from '@/theme';
import { timeline, visiblePingTargets, type Player, type Room } from './game';

const CHANNEL = 'game';
const MIN = 60_000;

// Когда приложение открыто, события показываем внутри игры — системный баннер не нужен.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function setupNotifications(): Promise<boolean> {
  // В Telegram/браузере системных уведомлений нет — события видны внутри игры.
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'События игры',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
        lightColor: colors.primary,
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

export async function notifyNow(title: string, body: string) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
  } catch {
    // уведомления — приятный бонус, игра работает и без них
  }
}

/** Планируем все события игры заранее — они придут, даже если приложение свёрнуто. */
export async function scheduleGameNotifications(room: Room, me: Player, players: Player[]) {
  await cancelGameNotifications();
  const s = room.settings;
  const start = room.startedAt ?? Date.now();
  const tl = timeline(room, start);
  const now = Date.now();
  const events: { at: number; title: string; body: string }[] = [];
  const isHider = me.role === 'hider';

  events.push({
    at: tl.seekStart,
    title: isHider ? '🔎 Охота началась!' : '🔎 Твой выход!',
    body: isHider ? 'Охотник вышел на поиски. Не высовывайся.' : 'Время пряток вышло — ищи их!',
  });

  for (let i = 1; i <= s.shrinkSteps; i++) {
    const at = tl.seekStart + i * s.shrinkEveryMin * MIN;
    const r = Math.round(room.zones[i]?.r ?? 0);
    if (s.shrinkEveryMin > 1) {
      events.push({ at: at - MIN, title: '⭕ Зона сузится через минуту', body: `Новая зона — ${r} м. Проверь пунктир на карте.` });
    }
    events.push({
      at,
      title: i === s.shrinkSteps ? '🔥 Финал!' : '⭕ Зона сузилась',
      body: i === s.shrinkSteps ? `Последняя зона ${r} м. Осталось ${s.finalMinutes} мин.` : `Радиус теперь ${r} м.`,
    });
  }

  const seesSomeone = visiblePingTargets(me, players, s).length > 0;
  const seekerSeesMe = isHider;
  if (seesSomeone || seekerSeesMe) {
    for (let at = tl.seekStart + s.pingEveryMin * MIN; at < tl.endAt; at += s.pingEveryMin * MIN) {
      events.push({
        at,
        title: '📍 Новые точки на карте',
        body: isHider ? 'Охотник увидел, где ты был недавно.' : 'Смотри, где они были.',
      });
    }
  }

  events.push({ at: tl.endAt, title: '🏁 Время вышло', body: 'Открой игру, чтобы узнать результат.' });

  const upcoming = events
    .filter((e) => e.at > now + 2000)
    .sort((a, b) => a.at - b.at)
    .slice(0, 60); // у iOS лимит 64 запланированных уведомления

  await Promise.all(
    upcoming.map((e) =>
      Notifications.scheduleNotificationAsync({
        content: { title: e.title, body: e.body, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(e.at),
          ...(Platform.OS === 'android' ? { channelId: CHANNEL } : {}),
        },
      }).catch(() => null),
    ),
  );
}

export async function cancelGameNotifications() {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // ignore
  }
}
