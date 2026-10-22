import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import Game from '@/components/Game';
import Lobby from '@/components/Lobby';
import { Button } from '@/components/ui';
import type { Player, Room } from '@/lib/game';
import { getPlayerId } from '@/lib/player';
import { leaveRoom, subscribePlayers, subscribeRoom } from '@/lib/rooms';
import { setClosingConfirmation } from '@/lib/telegram';
import { stopTracking } from '@/lib/tracker';
import { colors, fonts } from '@/theme';

export default function RoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [myId, setMyId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[] | null>(null);

  useEffect(() => {
    getPlayerId().then(setMyId);
    const unRoom = subscribeRoom(code, setRoom);
    const unPlayers = subscribePlayers(code, setPlayers);
    return () => {
      unRoom();
      unPlayers();
    };
  }, [code]);

  // В Telegram во время игры спрашиваем, прежде чем закрыть мини-апп.
  const inGame = room?.status === 'playing';
  useEffect(() => {
    setClosingConfirmation(inGame);
    return () => setClosingConfirmation(false);
  }, [inGame]);

  const me = players?.find((p) => p.id === myId);

  const leave = () =>
    Alert.alert('Выйти из комнаты?', room?.hostId === myId ? 'Ты хост — без тебя никто не сможет начать игру.' : undefined, [
      { text: 'Остаться', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          if (myId) await leaveRoom(code, myId).catch(() => {});
          await stopTracking();
          router.replace('/');
        },
      },
    ]);

  if (room === null || (room && players && myId && !me)) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.emoji}>🤷</Text>
        <Text style={styles.title}>{room === null ? 'Комната не найдена' : 'Тебя нет в этой комнате'}</Text>
        <Button title="На главную" onPress={() => router.replace('/')} style={{ marginTop: 20, minWidth: 200 }} />
      </View>
    );
  }
  if (!room || !players || !me) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const playing = room.status === 'playing';
  return (
    <>
      <Stack.Screen
        options={{
          headerShown: !playing,
          title: 'Лобби',
          gestureEnabled: !playing,
          headerRight: () => (
            <Pressable onPress={leave} hitSlop={10}>
              <Text style={styles.leave}>Выйти</Text>
            </Pressable>
          ),
        }}
      />
      {playing ? (
        <Game room={room} players={players} me={me} onLeave={leave} />
      ) : (
        <Lobby room={room} players={players} me={me} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  emoji: { fontSize: 56, marginBottom: 12 },
  title: { color: colors.text, fontFamily: fonts.title, fontSize: 18, textAlign: 'center' },
  leave: { color: colors.seeker, fontFamily: fonts.bold, fontSize: 15 },
});
