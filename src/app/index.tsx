import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, LiveDot, tap } from '@/components/ui';
import { getPlayerId, getPlayerName, setPlayerName } from '@/lib/player';
import { createRoom, joinRoom } from '@/lib/rooms';
import { takeStartCode } from '@/lib/telegram';
import { getActiveSession, type Session } from '@/lib/tracker';
import { colors, fonts, gradients, radius } from '@/theme';

const CODE_LEN = 5;

export default function Home() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [busy, setBusy] = useState<'host' | 'join' | null>(null);
  const [active, setActive] = useState<Session | null>(null);
  const codeInput = useRef<TextInputInstance>(null);

  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    getPlayerName().then(setName);
    // Открыли по ссылке-приглашению из Telegram — код уже вписан.
    const invited = takeStartCode();
    if (invited) {
      setCode(invited);
      setJoining(true);
    }
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ]),
    ).start();
  }, [float]);

  useFocusEffect(
    useCallback(() => {
      getActiveSession().then(setActive);
    }, []),
  );

  const checkName = () => {
    if (!name.trim()) {
      Alert.alert('Как тебя зовут?', 'Введи имя, чтобы друзья видели тебя в игре.');
      return false;
    }
    setPlayerName(name.trim());
    return true;
  };

  const onHost = async () => {
    if (!checkName()) return;
    setBusy('host');
    try {
      const c = await createRoom(await getPlayerId(), name.trim());
      router.push(`/room/${c}`);
    } catch (e) {
      Alert.alert('Не удалось создать игру', 'Проверь интернет и попробуй ещё раз.\n\n' + String(e));
    } finally {
      setBusy(null);
    }
  };

  const onJoin = async () => {
    if (!checkName()) return;
    if (code.length !== CODE_LEN) {
      codeInput.current?.focus();
      return;
    }
    setBusy('join');
    try {
      const err = await joinRoom(code, await getPlayerId(), name.trim());
      if (err) Alert.alert('Не получилось', err);
      else {
        setCode('');
        setJoining(false);
        router.push(`/room/${code}`);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Проверь интернет и попробуй ещё раз.\n\n' + String(e));
    } finally {
      setBusy(null);
    }
  };

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });

  return (
    <LinearGradient colors={gradients.bg} style={styles.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Animated.View style={{ transform: [{ translateY }] }}>
              <Image source={require('../../assets/icon.png')} style={styles.logo} />
            </Animated.View>
            <Text style={styles.title}>ПРЯТКИ</Text>
            <Text style={styles.tagline}>Настоящие прятки на карте города</Text>
          </View>

          {active && (
            <Pressable
              onPress={() => {
                tap();
                router.push(`/room/${active.code}`);
              }}
              style={styles.resume}
            >
              <LiveDot />
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>Игра идёт</Text>
                <Text style={styles.resumeSub}>Комната {active.code} · нажми, чтобы вернуться</Text>
              </View>
              <Text style={styles.resumeArrow}>›</Text>
            </Pressable>
          )}

          <Text style={styles.label}>Твоё имя</Text>
          <TextInput
            style={styles.input}
            placeholder="Например, Саша"
            placeholderTextColor={colors.muted}
            value={name}
            onChangeText={setName}
            maxLength={16}
            returnKeyType="done"
          />

          <View style={styles.actions}>
            <Button
              big
              icon="👑"
              title="Создать игру"
              subtitle="Ты хост: выбираешь зону и правила"
              onPress={onHost}
              loading={busy === 'host'}
            />

            {!joining ? (
              <Button
                big
                icon="🔑"
                variant="hider"
                title="Присоединиться"
                subtitle="По коду от друга"
                onPress={() => {
                  setJoining(true);
                  setTimeout(() => codeInput.current?.focus(), 100);
                }}
              />
            ) : (
              <View style={styles.joinCard}>
                <Text style={styles.joinTitle}>Код комнаты</Text>
                <Pressable style={styles.codeBoxes} onPress={() => codeInput.current?.focus()}>
                  {Array.from({ length: CODE_LEN }).map((_, i) => (
                    <View key={i} style={[styles.codeBox, i === code.length && styles.codeBoxActive]}>
                      <Text style={styles.codeChar}>{code[i] ?? ''}</Text>
                    </View>
                  ))}
                  <TextInput
                    ref={codeInput}
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN))}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={CODE_LEN}
                    style={styles.hiddenInput}
                    onSubmitEditing={onJoin}
                    caretHidden
                  />
                </Pressable>
                <View style={styles.joinButtons}>
                  <Button
                    variant="ghost"
                    title="Отмена"
                    onPress={() => {
                      setJoining(false);
                      setCode('');
                    }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="hider"
                    title="Войти"
                    onPress={onJoin}
                    loading={busy === 'join'}
                    disabled={code.length !== CODE_LEN}
                    style={{ flex: 2 }}
                  />
                </View>
              </View>
            )}
          </View>

          <Pressable onPress={() => router.push('/rules')} style={styles.rulesLink}>
            <Text style={styles.rulesText}>📖 Как играть</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, flexGrow: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 120, height: 120, borderRadius: 32 },
  title: { fontFamily: fonts.display, fontSize: 40, color: colors.text, marginTop: 16, letterSpacing: 4 },
  tagline: { fontFamily: fonts.semibold, fontSize: 15, color: colors.textDim, marginTop: 6 },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.hider + '18',
    borderColor: colors.hider + '55',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 20,
  },
  resumeTitle: { color: colors.hider, fontFamily: fonts.heavy, fontSize: 15 },
  resumeSub: { color: colors.textDim, fontFamily: fonts.semibold, fontSize: 13 },
  resumeArrow: { color: colors.hider, fontSize: 28, fontFamily: fonts.bold },
  label: { color: colors.textDim, fontFamily: fonts.bold, fontSize: 13, marginBottom: 8, marginLeft: 4 },
  input: {
    backgroundColor: colors.input,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.text,
    fontFamily: fonts.semibold,
    marginBottom: 20,
  },
  actions: { gap: 12 },
  joinCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    gap: 14,
  },
  joinTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 15, textAlign: 'center' },
  codeBoxes: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  codeBox: {
    width: 52,
    height: 62,
    borderRadius: radius.md,
    backgroundColor: colors.input,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxActive: { borderColor: colors.hider },
  codeChar: { color: colors.text, fontFamily: fonts.display, fontSize: 24 },
  hiddenInput: { position: 'absolute', width: '100%', height: '100%', opacity: 0 },
  joinButtons: { flexDirection: 'row', gap: 10 },
  rulesLink: { alignSelf: 'center', marginTop: 28, padding: 8 },
  rulesText: { color: colors.textDim, fontFamily: fonts.bold, fontSize: 15 },
});
