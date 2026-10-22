import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import YandexMap, { type MapMarker, type YandexMapHandle } from '@/components/YandexMap';
import { Avatar, Button, Card, Divider, Hint, IconButton, LiveDot, Pill, Segmented, Stepper, tap, Toggle } from '@/components/ui';
import { matchPreset, PRESETS, totalMinutes, type Player, type PresetId, type Room, type Settings } from '@/lib/game';
import { pushLobbyLocation, setCenter, setRole, startGame, updateSettings } from '@/lib/rooms';
import { shareRoom } from '@/lib/telegram';
import { hasBackgroundPermission, isExpoGo, requestBackgroundPermission } from '@/lib/tracker';
import { useMyLocation } from '@/lib/useMyLocation';
import { colors, fonts, roleColor, roleName } from '@/theme';

type Props = { room: Room; players: Player[]; me: Player };

export default function Lobby({ room, players, me }: Props) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<YandexMapHandle>(null);
  const isHost = room.hostId === me.id;
  const s = room.settings;
  const [starting, setStarting] = useState(false);
  const [bgGranted, setBgGranted] = useState<boolean | null>(null);

  const { loc, error } = useMyLocation((l) => pushLobbyLocation(room.code, me.id, l, l.t), 5_000);

  // Если хост ещё не выбрал центр — ставим его там, где хост стоит.
  useEffect(() => {
    if (isHost && !room.center && loc) setCenter(room.code, loc);
  }, [isHost, room.center, room.code, loc]);

  // Проверяем фоновую геолокацию (и снова — когда игрок вернулся из настроек).
  useEffect(() => {
    hasBackgroundPermission().then(setBgGranted);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') hasBackgroundPermission().then(setBgGranted);
    });
    return () => sub.remove();
  }, []);

  const markers = useMemo<MapMarker[]>(
    () =>
      players
        .filter((p) => p.id !== me.id && p.lastLoc)
        .map((p) => ({
          id: p.id,
          kind: 'player',
          lat: p.lastLoc!.lat,
          lng: p.lastLoc!.lng,
          color: roleColor(p.role),
          label: p.name,
        })),
    [players, me.id],
  );

  const zone = useMemo(() => (room.center ? { ...room.center, r: s.startRadius } : null), [room.center, s.startRadius]);
  const finalZone = useMemo(() => (room.center ? { ...room.center, r: s.endRadius } : null), [room.center, s.endRadius]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = { ...s, [key]: value };
    if (next.endRadius > next.startRadius - 50) next.endRadius = Math.max(50, next.startRadius - 50);
    updateSettings(room.code, next);
  };
  const applyPreset = (id: PresetId) => updateSettings(room.code, { ...s, ...PRESETS[id].settings });

  const seekers = players.filter((p) => p.role === 'seeker');
  const hiders = players.filter((p) => p.role === 'hider');

  const share = () => {
    tap();
    shareRoom(room.code);
  };

  const onStart = () => {
    if (seekers.length === 0) return Alert.alert('Нужен охотник', 'Нажми на игрока в списке, чтобы сделать его охотником.');
    if (hiders.length === 0) return Alert.alert('Некому прятаться', 'Хотя бы один игрок должен прятаться.');
    if (!room.center) return Alert.alert('Где играем?', 'Нажми на карту, чтобы выбрать центр зоны.');
    const go = async () => {
      setStarting(true);
      try {
        await startGame(room);
      } catch (e) {
        Alert.alert('Ошибка', String(e));
        setStarting(false);
      }
    };
    const noLoc = players.filter((p) => (p.id === me.id ? !loc : !p.lastLoc));
    if (noLoc.length > 0) {
      Alert.alert('Не у всех есть геолокация', `Нет позиции у: ${noLoc.map((p) => p.name).join(', ')}. Начать всё равно?`, [
        { text: 'Подождать', style: 'cancel' },
        { text: 'Начать', onPress: go },
      ]);
    } else go();
  };

  const preset = matchPreset(s);

  return (
    <View style={styles.screen}>
      <View style={styles.mapBox}>
        <YandexMap
          ref={mapRef}
          me={loc}
          zone={zone}
          nextZone={finalZone}
          markers={markers}
          onPress={isHost ? (p) => setCenter(room.code, p) : undefined}
        />
        <Pressable style={styles.codeChip} onPress={share}>
          <Text style={styles.codeLabel}>КОД</Text>
          <Text style={styles.code}>{room.code}</Text>
          <Text style={styles.shareIcon}>↗</Text>
        </Pressable>
        <IconButton icon="◎" onPress={() => mapRef.current?.recenter()} style={styles.recenter} />
        {isHost && (
          <View style={styles.mapHint} pointerEvents="none">
            <Text style={styles.mapHintText}>👆 Нажми на карту — там будет центр зоны</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.sheet} contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + (isHost ? 110 : 40) }]}>
        <View style={styles.grabber} />
        {error && <Text style={styles.error}>{error}</Text>}

        <Card>
          <View style={styles.playersHead}>
            <Text style={styles.cardTitle}>Игроки · {players.length}</Text>
            <View style={styles.legend}>
              <Pill text={`🎯 ${seekers.length}`} color={colors.seeker} />
              <Pill text={`🙈 ${hiders.length}`} color={colors.hider} />
            </View>
          </View>
          {players.map((p, i) => (
            <View key={p.id}>
              {i > 0 && <Divider />}
              <Pressable
                disabled={!isHost}
                onPress={() => {
                  tap();
                  setRole(room.code, p.id, p.role === 'seeker' ? 'hider' : 'seeker');
                }}
                style={({ pressed }) => [styles.player, pressed && { opacity: 0.6 }]}
              >
                <Avatar name={p.name} id={p.id} ring={roleColor(p.role)} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>
                    {p.name}
                    {p.id === me.id && <Text style={styles.you}>  ты</Text>}
                  </Text>
                  <View style={styles.playerSub}>
                    {p.id === room.hostId && <Text style={styles.playerMeta}>👑 хост</Text>}
                    {p.lastLoc ? (
                      <View style={styles.online}>
                        <LiveDot />
                        <Text style={styles.playerMeta}>на карте</Text>
                      </View>
                    ) : (
                      <Text style={styles.playerMeta}>ждём GPS…</Text>
                    )}
                  </View>
                </View>
                <Pill text={roleName(p.role)} color={roleColor(p.role)} solid={p.id === me.id} />
              </Pressable>
            </View>
          ))}
          {isHost && <Hint>Нажми на игрока, чтобы поменять роль. Отправь код друзьям — нажми на него на карте.</Hint>}
        </Card>

        <Card title="Режим" icon="🎮">
          <Segmented
            options={(Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))}
            value={preset}
            onChange={applyPreset}
            disabled={!isHost}
          />
          <View style={styles.summary}>
            <Summary icon="⏱" value={`${totalMinutes(s)} мин`} label="вся игра" />
            <Summary icon="⭕" value={`${s.startRadius}→${s.endRadius}`} label="метров" />
            <Summary icon="📍" value={`${s.pingEveryMin} мин`} label="точки" />
          </View>
          {!preset && <Hint>Свои настройки ✏️</Hint>}
        </Card>

        <Card title="Зона" icon="⭕">
          <Stepper label="Стартовый радиус" value={s.startRadius} unit="м" step={100} min={200} max={5000}
            onChange={(v) => set('startRadius', v)} disabled={!isHost} />
          <Stepper label="Финальный радиус" value={s.endRadius} unit="м" step={50} min={50}
            max={s.startRadius - 50} onChange={(v) => set('endRadius', v)} disabled={!isHost} />
          <Stepper label="Сужений" value={s.shrinkSteps} unit="раз" step={1} min={1} max={10}
            onChange={(v) => set('shrinkSteps', v)} disabled={!isHost} />
          <Stepper label="Сужается каждые" value={s.shrinkEveryMin} unit="мин" step={1} min={1} max={30}
            onChange={(v) => set('shrinkEveryMin', v)} disabled={!isHost} />
          <Toggle label="Смещать зону" hint="Новая зона появляется в случайном месте внутри старой"
            value={s.shiftCenter} onChange={(v) => set('shiftCenter', v)} disabled={!isHost} />
          <Stepper label="Можно быть вне зоны" value={s.graceSec} unit="сек" step={5} min={0} max={60}
            onChange={(v) => set('graceSec', v)} disabled={!isHost} />
        </Card>

        <Card title="Время" icon="⏱">
          <Stepper label="Чтобы спрятаться" value={s.hideTimeMin} unit="мин" step={1} min={0} max={15}
            onChange={(v) => set('hideTimeMin', v)} disabled={!isHost} />
          <Stepper label="Финал" hint="Сколько длится последняя зона" value={s.finalMinutes} unit="мин" step={1} min={1} max={30}
            onChange={(v) => set('finalMinutes', v)} disabled={!isHost} />
        </Card>

        <Card title="Точки на карте" icon="📍">
          <Stepper label="Показывать каждые" value={s.pingEveryMin} unit="мин" step={1} min={1} max={15}
            onChange={(v) => set('pingEveryMin', v)} disabled={!isHost} />
          <Stepper label="С задержкой" hint="Точка — где игрок был N минут назад" value={s.pingDelayMin} unit="мин" step={1} min={0} max={15}
            onChange={(v) => set('pingDelayMin', v)} disabled={!isHost} />
          <Divider />
          <Toggle label="🔴 Прячущиеся видят охотника" value={s.hidersSeeSeeker}
            onChange={(v) => set('hidersSeeSeeker', v)} disabled={!isHost} />
          <Toggle label="🟢 Прячущиеся видят своих" value={s.hidersSeeTeammates}
            onChange={(v) => set('hidersSeeTeammates', v)} disabled={!isHost} />
          <Toggle label="🕶 Анонимно" hint="На точках прячущихся не видно имён" value={s.anonymous}
            onChange={(v) => set('anonymous', v)} disabled={!isHost} />
        </Card>

        {bgGranted === false && (
          <Card title="Игра с выключенным экраном" icon="🔋" style={styles.permCard}>
            {Platform.OS === 'web' ? (
              <Hint>
                В Telegram позиция передаётся, только пока игра открыта: не сворачивай её и не выключай экран.
                В приложении для Android (APK) игра идёт и с выключенным экраном.
              </Hint>
            ) : isExpoGo ? (
              <Hint>
                В Expo Go фоновая геолокация не работает — держи экран включённым. В установленной версии приложения
                (APK) игра идёт и с выключенным экраном.
              </Hint>
            ) : (
              <>
                <Hint>
                  Разреши доступ к геолокации «Всегда» — тогда позиция будет передаваться, даже если экран погас.
                  Только во время игры.
                </Hint>
                <Button
                  title="Разрешить"
                  variant="primary"
                  style={{ marginTop: 12 }}
                  onPress={async () => setBgGranted(await requestBackgroundPermission())}
                />
              </>
            )}
          </Card>
        )}

        {!isHost && (
          <View style={styles.waiting}>
            <LiveDot color={colors.primary} />
            <Text style={styles.waitingText}>Ждём, пока хост начнёт игру…</Text>
          </View>
        )}
      </ScrollView>

      {isHost && (
        <LinearGradient
          colors={['rgba(11,14,20,0)', colors.bg]}
          style={[styles.startBar, { paddingBottom: insets.bottom + 12 }]}
          pointerEvents="box-none"
        >
          <Button big icon="▶" title="Начать игру" subtitle={`${players.length} игроков · ${totalMinutes(s)} мин`}
            onPress={onStart} loading={starting} />
        </LinearGradient>
      )}
    </View>
  );
}

function Summary({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryIcon}>{icon}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  mapBox: { height: '42%' },
  codeChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.glass,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  codeLabel: { color: colors.muted, fontFamily: fonts.heavy, fontSize: 11, letterSpacing: 1 },
  code: { color: colors.text, fontFamily: fonts.display, fontSize: 20, letterSpacing: 3 },
  shareIcon: { color: colors.primary, fontSize: 18, fontFamily: fonts.heavy },
  recenter: { position: 'absolute', right: 12, bottom: 36 },
  mapHint: {
    position: 'absolute',
    left: 12,
    bottom: 36,
    right: 70,
    backgroundColor: colors.glass,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  mapHintText: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 12 },
  sheet: {
    flex: 1,
    marginTop: -24,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: { padding: 14, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.cardBorder, marginBottom: 12 },
  error: { color: colors.seeker, fontFamily: fonts.semibold, marginBottom: 10, textAlign: 'center' },
  cardTitle: { fontSize: 15, fontFamily: fonts.title, color: colors.text },
  playersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  legend: { flexDirection: 'row', gap: 6 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  playerName: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
  you: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13 },
  playerSub: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  online: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerMeta: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryIcon: { fontSize: 18 },
  summaryValue: { color: colors.text, fontFamily: fonts.heavy, fontSize: 15, marginTop: 4 },
  summaryLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 11 },
  permCard: { borderColor: colors.warn + '66' },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
  waitingText: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 15 },
  startBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 28 },
});
