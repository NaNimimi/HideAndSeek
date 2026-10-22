import AsyncStorage from '@react-native-async-storage/async-storage';

import { tgUser } from './telegram';

const ID_KEY = 'playerId';
const NAME_KEY = 'playerName';

let cachedId: string | null = null;

/** Постоянный ID игрока на этом телефоне (без регистрации). */
export async function getPlayerId(): Promise<string> {
  if (cachedId) return cachedId;
  // В Telegram ID привязан к аккаунту — тот же игрок на любом устройстве.
  if (tgUser) return (cachedId = `tg${tgUser.id}`);
  let id = await AsyncStorage.getItem(ID_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    await AsyncStorage.setItem(ID_KEY, id);
  }
  cachedId = id;
  return id;
}

export async function getPlayerName(): Promise<string> {
  return (await AsyncStorage.getItem(NAME_KEY)) ?? tgUser?.first_name?.slice(0, 16) ?? '';
}

export async function setPlayerName(name: string): Promise<void> {
  await AsyncStorage.setItem(NAME_KEY, name);
}
