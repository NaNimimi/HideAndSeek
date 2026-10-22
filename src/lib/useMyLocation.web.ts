// Веб / Telegram: геолокация через Telegram LocationManager (если есть) или браузер.
import { useEffect, useRef, useState } from 'react';

import { tg, type TgLocation } from './telegram';
import type { MyLocation } from './useMyLocation';

export { useNow } from './useNow';
export type { MyLocation };

const POLL_MS = 3000;
const DENIED = 'Нет доступа к геолокации. Разреши его для Telegram в настройках телефона и открой игру заново.';

export function useMyLocation(
  onUpload?: (loc: MyLocation) => void,
  uploadEveryMs = 10_000,
): { loc: MyLocation | null; error: string | null } {
  const [loc, setLoc] = useState<MyLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uploadRef = useRef(onUpload);
  uploadRef.current = onUpload;
  const lastUpload = useRef(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let watchId: number | undefined;

    const accept = (lat: number, lng: number, accuracy: number | null) => {
      if (stopped) return;
      const next: MyLocation = { lat, lng, t: Date.now(), accuracy };
      setLoc(next);
      setError(null);
      if (Date.now() - lastUpload.current >= uploadEveryMs) {
        lastUpload.current = Date.now();
        uploadRef.current?.(next);
      }
    };

    const startBrowser = () => {
      if (!navigator.geolocation) {
        setError('Это устройство не отдаёт геолокацию.');
        return;
      }
      watchId = navigator.geolocation.watchPosition(
        (p) => accept(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
        (e) => setError(e.code === e.PERMISSION_DENIED ? DENIED : 'Не получается определить, где ты. Выйди на открытое место.'),
        { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
      );
    };

    const lm = tg?.isVersionAtLeast('8.0') ? tg.LocationManager : undefined;
    if (lm) {
      const poll = () => {
        if (stopped) return;
        lm.getLocation((d: TgLocation | null) => {
          if (stopped) return;
          if (d) accept(d.latitude, d.longitude, d.horizontal_accuracy ?? null);
          else if (!lm.isAccessGranted) setError(DENIED);
          timer = setTimeout(poll, POLL_MS);
        });
      };
      const start = () => {
        if (stopped) return;
        if (lm.isLocationAvailable) poll();
        else startBrowser();
      };
      if (lm.isInited) start();
      else lm.init(start);
    } else {
      startBrowser();
    }

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [uploadEveryMs]);

  return { loc, error };
}
