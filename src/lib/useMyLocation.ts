import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';

import type { LatLng } from './game';

export type MyLocation = LatLng & { t: number; accuracy: number | null };

/**
 * Следит за GPS. `onUpload` вызывается не чаще чем раз в `uploadEveryMs`,
 * чтобы не тратить лимиты Firebase.
 */
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
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Нет доступа к геолокации. Разреши его в настройках телефона.');
        return;
      }
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 3 },
        (p) => {
          const next: MyLocation = {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            t: p.timestamp,
            accuracy: p.coords.accuracy,
          };
          setLoc(next);
          if (Date.now() - lastUpload.current >= uploadEveryMs) {
            lastUpload.current = Date.now();
            uploadRef.current?.(next);
          }
        },
        (reason) => setError(reason),
      );
      if (cancelled) s.remove();
      else sub = s;
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [uploadEveryMs]);

  return { loc, error };
}

export { useNow } from './useNow';
