import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { tgHaptic } from './telegram';

type Kind = 'light' | 'medium' | 'selection' | 'success' | 'warning' | 'error';

/** Вибро-отклик: в приложении — expo-haptics, в Telegram — его HapticFeedback. */
export function haptic(kind: Kind) {
  if (Platform.OS === 'web') {
    tgHaptic(kind === 'selection' ? 'light' : kind);
    return;
  }
  const p =
    kind === 'selection'
      ? Haptics.selectionAsync()
      : kind === 'light' || kind === 'medium'
        ? Haptics.impactAsync(kind === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium)
        : Haptics.notificationAsync(
            kind === 'success'
              ? Haptics.NotificationFeedbackType.Success
              : kind === 'warning'
                ? Haptics.NotificationFeedbackType.Warning
                : Haptics.NotificationFeedbackType.Error,
          );
  p.catch(() => {});
}
