// Telegram Mini App: та же игра, открытая внутри Telegram (веб-версия приложения).
// В APK и в обычном браузере `tg` = null — всё работает как раньше.

import { Alert, Platform, Share } from 'react-native';

import { TELEGRAM_APP_LINK } from '@/config';

type PopupButton = { id: string; type: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'; text?: string };

export type TgLocation = { latitude: number; longitude: number; horizontal_accuracy?: number | null };

type WebApp = {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; username?: string }; start_param?: string };
  version: string;
  isVersionAtLeast(v: string): boolean;
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  showPopup(p: { title?: string; message: string; buttons?: PopupButton[] }, cb?: (id: string) => void): void;
  openTelegramLink(url: string): void;
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(t: 'error' | 'success' | 'warning'): void;
  };
  LocationManager?: {
    isInited: boolean;
    isLocationAvailable: boolean;
    isAccessGranted: boolean;
    init(cb?: () => void): void;
    getLocation(cb: (data: TgLocation | null) => void): void;
    openSettings(): void;
  };
};

const webApp: WebApp | null =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? ((window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp ?? null)
    : null;

/** Мини-апп открыт внутри Telegram (а не просто в браузере). */
export const tg: WebApp | null = webApp && webApp.initData ? webApp : null;

export const tgUser = tg?.initDataUnsafe.user ?? null;

let startParamUsed = false;
/** Код комнаты из ссылки t.me/бот/app?startapp=КОД (один раз). */
export function takeStartCode(): string | null {
  if (startParamUsed) return null;
  startParamUsed = true;
  const p = tg?.initDataUnsafe.start_param?.toUpperCase();
  return p && /^[A-Z0-9]{5}$/.test(p) ? p : null;
}

export function setupTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    // Иначе свайп по карте вниз сворачивает мини-апп.
    if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes?.();
    tg.setHeaderColor('#0B0E14');
    tg.setBackgroundColor('#0B0E14');
    if (tg.isVersionAtLeast('7.10')) tg.setBottomBarColor?.('#0B0E14');
  } catch {
    // старый Telegram — не страшно
  }
}

/** Во время игры спрашиваем, прежде чем закрыть мини-апп. */
export function setClosingConfirmation(on: boolean) {
  if (!tg) return;
  try {
    if (on) tg.enableClosingConfirmation();
    else tg.disableClosingConfirmation();
  } catch {
    // ignore
  }
}

export function tgHaptic(kind: 'light' | 'medium' | 'success' | 'warning' | 'error') {
  const h = tg?.HapticFeedback;
  if (!h) return;
  try {
    if (kind === 'light' || kind === 'medium') h.impactOccurred(kind);
    else h.notificationOccurred(kind);
  } catch {
    // ignore
  }
}

/** Пригласить в комнату: в Telegram — через выбор чата, в приложении — системным «Поделиться». */
export function shareRoom(code: string) {
  const text = `Го в Прятки! 🙈 Код комнаты: ${code}`;
  const link = TELEGRAM_APP_LINK ? `${TELEGRAM_APP_LINK}?startapp=${code}` : '';
  if (tg && link) {
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    return;
  }
  const message = link ? `${text}\n${link}` : text;
  if (Platform.OS === 'web') {
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) nav.share({ text: message }).catch(() => {});
    else navigator.clipboard?.writeText(message).then(() => Alert.alert('Скопировано', message), () => {});
    return;
  }
  Share.share({ message });
}

// На вебе Alert из react-native ничего не показывает — подменяем на попап Telegram или браузерный.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  type Btn = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
  Alert.alert = (title: string, message?: string, buttons?: Btn[]) => {
    const list: Btn[] = buttons?.length ? buttons : [{ text: 'OK' }];
    if (tg) {
      tg.showPopup(
        {
          title: title.slice(0, 64),
          message: (message || title).slice(0, 256),
          buttons: list.slice(0, 3).map((b, i) => ({
            id: String(i),
            type: b.style === 'destructive' ? 'destructive' : b.style === 'cancel' ? 'cancel' : 'default',
            text: b.style === 'cancel' ? undefined : (b.text ?? 'OK'),
          })) as PopupButton[],
        },
        (id) => {
          const b = list[Number(id)];
          b?.onPress?.();
        },
      );
      return;
    }
    const text = message ? `${title}\n\n${message}` : title;
    if (list.length === 1) {
      window.alert(text);
      list[0].onPress?.();
      return;
    }
    const cancel = list.find((b) => b.style === 'cancel');
    const action = list.find((b) => b.style !== 'cancel') ?? list[list.length - 1];
    if (window.confirm(text)) action.onPress?.();
    else cancel?.onPress?.();
  };
}
