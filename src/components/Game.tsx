import { haptic } from '@/lib/haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import YandexMap, { type MapMarker, type YandexMapHandle } from '@/components/YandexMap';
import { Avatar, Button, IconButton, Pill } from '@/components/ui';
import {
  formatMs,
  gameResult,
  pingSnapshotTime,
  timeline,
  visiblePingTargets,
  type Player,
  type Room,
} from '@/lib/game';
import { locationAt, resetGame, setStatus } from '@/lib/rooms';
import {
  handleLocation,
  markNotAlive,
  startTracking,
  stopTracking,
  subscribeTracker,
  trackerTick,
  type TrackMode,
} from '@/lib/tracker';
import { useMyLocation, useNow } from '@/lib/useMyLocation';
import { colors, fonts, radius, roleColor } from '@/theme';

type Props = { room: Room; players: Player[]; me: Player; onLeave: () => void };
type Ping = MapMarker & { t: number };

export default function Game({ room, players, me, onLeave }: Props) {
  useKeepAwake(); // пока игра открыта, экран не гаснет
  const insets = useSafeAreaInsets();
  const mapRef = useRef<YandexMapHandle>(null);

  const now = useNow();
  const tl = timeline(room, now);
  const result = gameResult(players, tl);
  const s = room.settings;
  const isHost = room.hostId === me.id;
  const isHider = me.role === 'hider';
  const alive = me.status === 'alive';

  // ---------- Трекинг (фон / экран) ----------
  const [mode, setMode] = useState<TrackMode | null>(null);
  const [outSince, setOutSince] = useState<number | null>(null);

  useEffect(() => subscribeTracker((st) => setOutSince(st.outSince)), []);

  useEffect(() => {
    if (result.finished) {
      stopTracking();
      return;
    }
    if (!alive) {
      markNotAlive();
      return;
    }
    startTracking(room, me, players).then(setMode);
    // перезапускаем только при смене игры или статуса
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.startedAt, alive, result.finished]);

  const { loc, error } = useMyLocation((l) => {
    if (mode === 'foreground') handleLocation(l);
  }, 1000);

  useEffect(() => {
    if (!result.finished && alive) trackerTick();
  }, [now, result.finished, alive]);

  // ---------- Пинги ----------
  const [pings, setPings] = useState<Ping[]>([]);
  const targets = visiblePingTargets(me, players, s);
  const targetsKey = targets.map((t) => t.player.id).join(',');

  useEffect(() => {
    if (tl.pingIndex < 1) return;
    const at = pingSnapshotTime(room, tl.pingIndex);
    let cancelled = false;
    Promise.all(
      targets.map(async ({ player, color, label }) => {
        const l = await locationAt(room.code, player.id, at).catch(() => null);
        // точки из прошлой игры в этой же комнате не показываем
        if (!l || l.t < (room.startedAt ?? 0)) return null;
        const ping: Ping = { id: player.id, kind: 'ping', lat: l.lat, lng: l.lng, t: l.t, color, label };
        return ping;
      }),
    ).then((res) => {
      if (!cancelled) setPings(res.filter((p): p is Ping => p !== null));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl.pingIndex, targetsKey, room.code, room.startedAt]);

  const minuteNow = Math.floor(now / 60_000);
  const markers = useMemo<MapMarker[]>(
    () =>
      pings.map((p) => {
        const ago = Math.max(0, Math.round((minuteNow * 60_000 - p.t) / 60_000));
        return { ...p, sub: ago === 0 ? 'только что' : `${ago} мин назад` };
      }),
    [pings, minuteNow],
  );

  // ---------- События: тост + вибрация ----------
  const toast = useToast();
  const prev = useRef({ phase: tl.phase, zone: tl.zoneIndex, ping: tl.pingIndex, statuses: statusMap(players) });
  useEffect(() => {
    const p = prev.current;
    if (p.phase === 'hiding' && tl.phase !== 'hiding') {
      toast.show('🔎 Охота началась!', isHider ? 'Не высовывайся' : 'Ищи их!');
      haptic('warning');
    } else if (tl.zoneIndex > p.zone) {
      toast.show(tl.phase === 'final' ? '🔥 Финал!' : '⭕ Зона сузилась', `Радиус ${Math.round(tl.zone.r)} м`);
      haptic('warning');
    } else if (tl.pingIndex > p.ping && targets.length > 0) {
      toast.show('📍 Новые точки', 'Смотри на карту');
      haptic('medium');
    }
    const statuses = statusMap(players);
    for (const pl of players) {
      if (p.statuses[pl.id] === 'alive' && pl.status !== 'alive' && pl.id !== me.id) {
        toast.show(pl.status === 'found' ? `🎯 Нашли: ${pl.name}` : `❌ Вне зоны: ${pl.name}`, 'Выбывает из игры');
        haptic('success');
      }
    }
    prev.current = { phase: tl.phase, zone: tl.zoneIndex, ping: tl.pingIndex, statuses };
  });

  // Вибрация каждые 3 секунды, пока игрок вне зоны.
  const tick3 = Math.floor(now / 3000);
  useEffect(() => {
    if (outSince !== null && alive) haptic('error');
  }, [outSince, alive, tick3]);

  const onFound = () =>
    Alert.alert('Тебя нашли?', 'Отменить будет нельзя.', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Да, нашли',
        style: 'destructive',
        onPress: () => {
          haptic('success');
          setStatus(room.code, me.id, 'found');
          markNotAlive();
        },
      },
    ]);

  const hiders = players.filter((p) => p.role === 'hider');
  const aliveHiders = hiders.filter((p) => p.status === 'alive').length;

  const shrinkTotal = s.shrinkEveryMin * 60_000;
  const shrinkProgress =
    tl.phase === 'seeking' && tl.msToNextShrink !== null ? 1 - tl.msToNextShrink / shrinkTotal : tl.phase === 'final' ? 1 : 0;
  const outLeft = outSince !== null ? s.graceSec * 1000 - (now - outSince) : 0;
  const bannerTop = insets.top + 150;

  return (
    <View style={styles.screen}>
      <YandexMap ref={mapRef} me={loc} zone={tl.zone} nextZone={tl.nextZone} markers={markers} mask />

      {outSince !== null && alive && <View style={styles.vignette} pointerEvents="none" />}

      {/* ---------- HUD ---------- */}
      <View style={[styles.hud, { top: insets.top + 8 }]}>
        <View style={styles.hudHead}>
          <Pill text={isHider ? '🙈 Прячешься' : '🎯 Охотник'} color={roleColor(me.role)} solid />
          <Text style={styles.phase} numberOfLines={1}>
            {tl.phase === 'hiding' && 'Прячемся'}
            {tl.phase === 'seeking' && `Зона ${tl.zoneIndex + 1}/${s.shrinkSteps + 1}`}
            {tl.phase === 'final' && '🔥 Финал'}
            {tl.phase === 'over' && 'Конец'}
          </Text>
          <Text style={styles.radius}>{Math.round(tl.zone.r)} м</Text>
          <IconButton icon="⋯" onPress={onLeave} style={styles.menuBtn} />
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(shrinkProgress * 100)}%` }]} />
        </View>

        <View style={styles.tiles}>
          {tl.phase === 'hiding' ? (
            <Tile label="До охоты" value={formatMs(tl.msToSeekStart)} color={colors.primary} />
          ) : (
            tl.msToNextShrink !== null && <Tile label="Сужение" value={formatMs(tl.msToNextShrink)} color={colors.warn} />
          )}
          {tl.msToNextPing !== null && (targets.length > 0 || isHider) && (
            <Tile label={isHider ? 'Тебя увидят' : 'Точки'} value={formatMs(tl.msToNextPing)} color={colors.seeker} />
          )}
          <Tile label="До конца" value={formatMs(tl.msToEnd)} color={colors.text} />
          <Tile label="В игре" value={`${aliveHiders}/${hiders.length}`} color={colors.hider} />
        </View>
      </View>

      {outSince !== null && alive ? (
        <View style={[styles.outBanner, { top: bannerTop }]}>
          <Text style={styles.outTitle}>⚠️ ТЫ ВНЕ ЗОНЫ</Text>
          <Text style={styles.outTimer}>{formatMs(outLeft)}</Text>
          <Text style={styles.outSub}>Вернись в фиолетовый круг</Text>
        </View>
      ) : toast.state ? (
        <Toast state={toast.state} top={bannerTop} />
      ) : (
        (error || mode === 'foreground') &&
        alive &&
        !result.finished && (
          <View style={[styles.notice, { top: bannerTop }]} pointerEvents="none">
            <Text style={styles.noticeText}>
              {error ??
                (Platform.OS === 'web'
                  ? '📱 Не сворачивай Telegram: позиция шлётся, только пока игра открыта'
                  : '📱 Не сворачивай игру: фоновая геолокация выключена, позиция шлётся только с открытого экрана')}
            </Text>
          </View>
        )
      )}

      {/* ---------- Низ ---------- */}
      <View style={[styles.bottom, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
        <View style={styles.bottomRow} pointerEvents="box-none">
          <View style={styles.squad}>
            {hiders.map((p) => (
              <View key={p.id} style={{ opacity: p.status === 'alive' ? 1 : 0.35 }}>
                <Avatar name={p.name} id={p.id} size={30} ring={p.status === 'alive' ? colors.hider : colors.muted} />
                {p.status !== 'alive' && <Text style={styles.squadX}>{p.status === 'found' ? '🎯' : '✕'}</Text>}
              </View>
            ))}
          </View>
          <IconButton icon="◎" onPress={() => mapRef.current?.recenter()} />
        </View>

        {isHider && alive && !result.finished && (
          <Button big variant="seeker" icon="🙋" title="Меня нашли" onPress={onFound} />
        )}
        {isHider && !alive && !result.finished && (
          <View style={styles.status}>
            <Text style={styles.statusText}>
              {me.status === 'found' ? '🎯 Тебя нашли — болей за своих' : '❌ Ты выбыл из-за зоны'}
            </Text>
          </View>
        )}
      </View>

      {/* ---------- Охотник ждёт ---------- */}
      {!isHider && tl.phase === 'hiding' && !result.finished && (
        <LinearGradient colors={['#1A1240', colors.bg]} style={styles.overlay}>
          <Text style={styles.overlayEmoji}>🙈</Text>
          <Text style={styles.overlayTitle}>Закрой глаза</Text>
          <Text style={styles.overlayText}>Все прячутся. Охота начнётся через</Text>
          <Text style={styles.bigTimer}>{formatMs(tl.msToSeekStart)}</Text>
          <Text style={styles.overlayHint}>
            Зона: {s.startRadius} м · прячутся: {hiders.length}
          </Text>
        </LinearGradient>
      )}

      {/* ---------- Итоги ---------- */}
      {result.finished && (
        <Results room={room} players={players} winner={result.winner} me={me} isHost={isHost} bottomInset={insets.bottom} />
      )}
    </View>
  );
}

function statusMap(players: Player[]) {
  return Object.fromEntries(players.map((p) => [p.id, p.status]));
}

function Tile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

// ---------- Тосты ----------

type ToastState = { title: string; body: string; anim: Animated.Value } | null;

function useToast() {
  const anim = useRef(new Animated.Value(0)).current;
  const [state, setState] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const show = (title: string, body: string) => {
    if (timer.current) clearTimeout(timer.current);
    setState({ title, body, anim });
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 8 }).start();
    timer.current = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setState(null));
    }, 3500);
  };
  return { state, show };
}

function Toast({ state, top }: { state: NonNullable<ToastState>; top: number }) {
  const translateY = state.anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] });
  return (
    <Animated.View style={[styles.toast, { top, opacity: state.anim, transform: [{ translateY }] }]} pointerEvents="none">
      <Text style={styles.toastTitle}>{state.title}</Text>
      <Text style={styles.toastBody}>{state.body}</Text>
    </Animated.View>
  );
}

// ---------- Итоги ----------

type ResultsProps = {
  room: Room;
  players: Player[];
  winner: 'seeker' | 'hider';
  me: Player;
  isHost: boolean;
  bottomInset: number;
};

function Results({ room, players, winner, me, isHost, bottomInset }: ResultsProps) {
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 14 }).start();
    haptic('success');
  }, [scale]);

  const iWon = me.role === winner;
  const sorted = [...players].sort((a, b) => (a.role === b.role ? 0 : a.role === 'seeker' ? -1 : 1));
  const hidersWon = winner === 'hider';

  return (
    <LinearGradient colors={hidersWon ? ['#0D3B2C', colors.bg] : ['#3B0D16', colors.bg]} style={[styles.overlay, { alignItems: 'stretch' }]}>
      <ScrollView contentContainerStyle={[styles.resultsContent, { paddingBottom: bottomInset + 24 }]}>
        <Animated.Text style={[styles.resultEmoji, { transform: [{ scale }] }]}>{hidersWon ? '🙈' : '🎯'}</Animated.Text>
        <Text style={[styles.resultTitle, { color: hidersWon ? colors.hider : colors.seeker }]}>
          {hidersWon ? 'Прячущиеся победили' : 'Охотник победил'}
        </Text>
        <Text style={styles.resultSub}>{iWon ? 'Ты в команде победителей! 🎉' : 'В следующий раз повезёт 💪'}</Text>

        <View style={styles.resultCard}>
          {sorted.map((p) => (
            <View key={p.id} style={styles.resultRow}>
              <Avatar name={p.name} id={p.id} size={34} ring={roleColor(p.role)} />
              <Text style={styles.resultName}>{p.name}</Text>
              <Text style={styles.resultStatus}>
                {p.role === 'seeker'
                  ? '🎯 охотник'
                  : p.status === 'alive'
                    ? '🏆 не нашли'
                    : p.status === 'found'
                      ? '🔍 нашли'
                      : '❌ вне зоны'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.resultButtons}>
          {isHost ? (
            <Button big icon="🔁" title="Сыграть ещё" onPress={() => resetGame(room.code, players)} />
          ) : (
            <Text style={styles.overlayHint}>Хост может начать новую игру — ты останешься в комнате</Text>
          )}
          <Button variant="ghost" title="На главную" onPress={() => router.replace('/')} />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const glass = {
  backgroundColor: colors.glass,
  borderWidth: 1,
  borderColor: colors.cardBorder,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  vignette: { ...StyleSheet.absoluteFill, borderWidth: 6, borderColor: colors.seeker + 'CC' },
  hud: { position: 'absolute', left: 10, right: 10, borderRadius: radius.lg, padding: 12, ...glass },
  hudHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  phase: { flex: 1, color: colors.text, fontFamily: fonts.title, fontSize: 15 },
  radius: { color: colors.primary, fontFamily: fonts.heavy, fontSize: 14 },
  menuBtn: { width: 34, height: 34, borderRadius: 17 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.input, marginTop: 10, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.warn },
  tiles: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  tile: { flex: 1, alignItems: 'center' },
  tileValue: { fontSize: 19, fontFamily: fonts.heavy, fontVariant: ['tabular-nums'] },
  tileLabel: { fontSize: 11, color: colors.muted, fontFamily: fonts.semibold, marginTop: 1 },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.lg,
    alignItems: 'center',
    ...glass,
    borderColor: colors.primary + '88',
  },
  toastTitle: { color: colors.text, fontFamily: fonts.heavy, fontSize: 16 },
  toastBody: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 13 },
  notice: { position: 'absolute', left: 16, right: 16, padding: 8, borderRadius: radius.md, ...glass },
  noticeText: { color: colors.warn, fontFamily: fonts.semibold, fontSize: 12, textAlign: 'center' },
  outBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.seekerDeep,
    alignItems: 'center',
  },
  outTitle: { color: '#fff', fontFamily: fonts.title, fontSize: 15, letterSpacing: 1 },
  outTimer: { color: '#fff', fontFamily: fonts.display, fontSize: 40, marginVertical: 2 },
  outSub: { color: '#FFD9DD', fontFamily: fonts.semibold, fontSize: 13 },
  bottom: { position: 'absolute', left: 12, right: 12, gap: 10 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  squad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 8, borderRadius: radius.lg, maxWidth: '75%', ...glass },
  squadX: { position: 'absolute', right: -4, bottom: -4, fontSize: 12, color: colors.text },
  status: { padding: 14, borderRadius: radius.lg, ...glass },
  statusText: { color: colors.text, fontFamily: fonts.bold, fontSize: 15, textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 24 },
  overlayEmoji: { fontSize: 72 },
  overlayTitle: { color: colors.text, fontFamily: fonts.display, fontSize: 28, marginTop: 12, textAlign: 'center' },
  overlayText: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 15, marginTop: 8, textAlign: 'center' },
  bigTimer: { color: colors.text, fontFamily: fonts.display, fontSize: 72, marginTop: 8, fontVariant: ['tabular-nums'] },
  overlayHint: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13, marginTop: 12, textAlign: 'center' },
  resultsContent: { flexGrow: 1, justifyContent: 'center', paddingTop: 60 },
  resultEmoji: { fontSize: 96, textAlign: 'center' },
  resultTitle: { fontFamily: fonts.display, fontSize: 26, textAlign: 'center', marginTop: 10 },
  resultSub: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center', marginTop: 6 },
  resultCard: { marginTop: 24, borderRadius: radius.lg, padding: 12, gap: 4, ...glass },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  resultName: { flex: 1, color: colors.text, fontFamily: fonts.bold, fontSize: 15 },
  resultStatus: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 13 },
  resultButtons: { marginTop: 24, gap: 10 },
});
