import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui';
import { colors, fonts } from '@/theme';

const RULES: { icon: string; title: string; text: string }[] = [
  { icon: '👑', title: 'Хост', text: 'Создаёт игру, выбирает центр зоны на карте, распределяет роли и настраивает правила.' },
  { icon: '🙈', title: 'Прячься', text: 'Пока идёт отсчёт, охотник не видит карту. Успей уйти подальше, но оставайся в зоне.' },
  { icon: '⭕', title: 'Зона', text: 'Фиолетовый круг — где можно находиться. Оранжевый пунктир — следующая зона. Зона сужается по таймеру.' },
  { icon: '⚠️', title: 'Вне зоны', text: 'Если выйти из зоны, начнётся отсчёт. Не вернулся вовремя — выбываешь.' },
  { icon: '📍', title: 'Точки', text: 'Раз в несколько минут охотник видит красные точки — где прячущиеся были чуть раньше. Хост может включить, чтобы прячущиеся видели охотника и друг друга (зелёные).' },
  { icon: '🙋', title: 'Тебя нашли', text: 'Охотник тебя увидел — честно нажми «Меня нашли».' },
  { icon: '🏁', title: 'Победа', text: 'Нашли всех — побеждает охотник. Кто-то продержался до конца финала — побеждают прячущиеся.' },
  { icon: '🔋', title: 'Совет', text: 'Возьми заряженный телефон и разреши геолокацию «Всегда» — тогда игра работает даже с выключенным экраном.' },
];

export default function Rules() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
      {RULES.map((r) => (
        <Card key={r.title}>
          <View style={styles.row}>
            <Text style={styles.icon}>{r.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{r.title}</Text>
              <Text style={styles.text}>{r.text}</Text>
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  icon: { fontSize: 28 },
  title: { color: colors.text, fontFamily: fonts.title, fontSize: 15, marginBottom: 4 },
  text: { color: colors.textDim, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
});
