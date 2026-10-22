import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { colors, fonts } from '@/theme';
import { mapHtml as html, type MapMarker, type MapProps, type YandexMapHandle } from './mapHtml';

export type { MapMarker, YandexMapHandle };

// Яндекс Карты JS API 3.0 в WebView. Страница открывается с адреса https://pryatki.app/ —
// этот домен должен быть указан в ключе в поле «Ограничение по HTTP Referer».
const BASE_URL = 'https://pryatki.app/';

const YandexMap = forwardRef<YandexMapHandle, MapProps>(function YandexMap(
  { me, zone, nextZone, markers, mask = false, onPress },
  handle,
) {
  // WebView<object>: у библиотеки дефолт P = undefined, и пропсы схлопываются в never.
  const ref = useRef<WebView<object>>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(handle, () => ({
    recenter: () => ref.current?.injectJavaScript('window.recenter(); true;'),
  }));

  // Перерисовываем карту только когда данные реально изменились.
  const payload = useMemo(
    () =>
      JSON.stringify({
        me: me ? { lat: me.lat, lng: me.lng } : null,
        zone: zone ?? null,
        nextZone: nextZone ?? null,
        markers: markers ?? [],
        mask,
      }),
    [me, zone, nextZone, markers, mask],
  );

  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.update(${payload}); true;`);
  }, [payload, ready]);

  const onMessage = (e: WebViewMessageEvent) => {
    const msg = JSON.parse(e.nativeEvent.data);
    if (msg.type === 'ready') setReady(true);
    else if (msg.type === 'press') onPress?.({ lat: msg.lat, lng: msg.lng });
    else if (msg.type === 'error') setError(msg.message);
  };

  return (
    <View style={styles.wrap}>
      <WebView<object>
        ref={ref}
        source={{ html, baseUrl: BASE_URL }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        overScrollMode="never"
        bounces={false}
        setSupportMultipleWindows={false}
        style={styles.map}
      />
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
  map: { flex: 1, backgroundColor: colors.bg },
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
