// Фоновая задача геолокации должна быть объявлена при запуске приложения.
import '@/lib/tracker';

import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';
import { Unbounded_700Bold, Unbounded_800ExtraBold } from '@expo-google-fonts/unbounded';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { setupTelegram } from '@/lib/telegram';
import { colors, fonts } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
setupTelegram();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    Unbounded_700Bold,
    Unbounded_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.title, fontSize: 16 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="rules" options={{ title: 'Как играть', presentation: 'modal' }} />
        <Stack.Screen name="room/[code]" options={{ title: 'Комната' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
