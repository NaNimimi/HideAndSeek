// Веб / Telegram: та же страница карты, но в iframe вместо WebView.
// Ключ Яндекса должен разрешать домен сайта в «Ограничение по HTTP Referer».
import { createElement, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/theme';
import { mapHtml, type MapMarker, type MapProps, type YandexMapHandle } from './mapHtml';

export type { MapMarker, YandexMapHandle };

type MapWindow = Window & { update?: (d: unknown) => void; recenter?: () => void };

const YandexMap = forwardRef<YandexMapHandle, MapProps>(function YandexMap(
  { me, zone, nextZone, markers, mask = false, onPress },
  handle,
) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const frame = () => ref.current?.contentWindow as MapWindow | null | undefined;

  useImperativeHandle(handle, () => ({ recenter: () => frame()?.recenter?.() }));

  const payload = useMemo(
    () => ({
      me: me ? { lat: me.lat, lng: me.lng } : null,
      zone: zone ?? null,
      nextZone: nextZone ?? null,
      markers: markers ?? [],
      mask,
    }),
    [me, zone, nextZone, markers, mask],
  );

  useEffect(() => {
    if (ready) frame()?.update?.(payload);
  }, [payload, ready]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !e.data?.ymap) return;
      const msg = e.data.ymap;
      if (msg.type === 'ready') setReady(true);
      else if (msg.type === 'press') onPressRef.current?.({ lat: msg.lat, lng: msg.lng });
      else if (msg.type === 'error') setError(msg.message);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <View style={styles.wrap}>
      {createElement('iframe', {
        ref,
        srcDoc: mapHtml,
        title: 'map',
        style: { border: 0, width: '100%', height: '100%', display: 'block', background: colors.bg },
      })}
      {!ready && !error && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.loadingText}>Загружаем карту…</Text>
        </View>
      )}
      {error && (
        <View style={styles.loading}>
          <Text style={styles.errorTitle}>Карта не загрузилась</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
});

export default YandexMap;

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden', backgroundColor: colors.bg },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 24,
    gap: 10,
  },
  loadingText: { color: colors.textDim, fontFamily: fonts.semibold },
  errorTitle: { color: colors.text, fontFamily: fonts.title, fontSize: 16 },
  errorText: { color: colors.textDim, fontFamily: fonts.body, textAlign: 'center' },
});
