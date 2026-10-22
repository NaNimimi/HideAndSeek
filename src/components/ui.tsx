import { haptic } from '@/lib/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { avatarColor, colors, fonts, gradients, radius } from '@/theme';

export const tap = () => haptic('light');

// ---------- Кнопки ----------

type ButtonVariant = 'primary' | 'seeker' | 'hider' | 'ghost';

type ButtonProps = {
  title: string;
  subtitle?: string;
  icon?: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ title, subtitle, icon, onPress, variant = 'primary', disabled, loading, big, style }: ButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const off = disabled || loading;
  const animate = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40 }).start();

  const content = loading ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <View style={styles.btnInner}>
      {icon && <Text style={[styles.btnIcon, big && styles.btnIconBig]}>{icon}</Text>}
      <View style={{ alignItems: icon ? 'flex-start' : 'center', flexShrink: 1 }}>
        <Text style={[styles.btnText, big && styles.btnTextBig]}>{title}</Text>
        {subtitle && <Text style={styles.btnSub}>{subtitle}</Text>}
      </View>
    </View>
  );

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity: off ? 0.5 : 1 }, style]}>
      <Pressable
        disabled={off}
        onPressIn={() => animate(0.97)}
        onPressOut={() => animate(1)}
        onPress={() => {
          tap();
          onPress();
        }}
      >
        {variant === 'ghost' ? (
          <View style={[styles.btn, big && styles.btnBig, styles.ghost]}>{content}</View>
        ) : (
          <LinearGradient
            colors={gradients[variant]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.btn, big && styles.btnBig]}
          >
            {content}
          </LinearGradient>
        )}
      </Pressable>
    </Animated.View>
  );
}

export function IconButton({ icon, onPress, style }: { icon: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }, style]}
    >
      <Text style={styles.iconBtnText}>{icon}</Text>
    </Pressable>
  );
}

// ---------- Карточки и текст ----------

export function Card({ title, icon, children, style }: { title?: string; icon?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]}>
      {title && (
        <View style={styles.cardHead}>
          {icon && <Text style={styles.cardIcon}>{icon}</Text>}
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
      )}
      {children}
    </View>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

// ---------- Настройки ----------

type StepperProps = {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  unit: string;
  disabled?: boolean;
};

export function Stepper({ label, hint, value, onChange, step, min, max, unit, disabled }: StepperProps) {
  const change = (v: number) => {
    if (v === value) return;
    haptic('selection');
    onChange(v);
  };
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <View style={styles.stepper}>
        {!disabled && (
          <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => change(Math.max(min, value - step))}>
            <Text style={[styles.stepBtnText, value <= min && styles.stepOff]}>−</Text>
          </Pressable>
        )}
        <Text style={styles.value}>
          {value}
          <Text style={styles.unit}> {unit}</Text>
        </Text>
        {!disabled && (
          <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => change(Math.min(max, value + step))}>
            <Text style={[styles.stepBtnText, value >= max && styles.stepOff]}>+</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

type ToggleProps = { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean };

export function Toggle({ label, hint, value, onChange, disabled }: ToggleProps) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: value ? 1 : 0, useNativeDriver: false, speed: 30, bounciness: 6 }).start();
  }, [value, anim]);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.input, colors.primary] });
  const x = anim.interpolate({ inputRange: [0, 1], outputRange: [3, 23] });

  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        haptic('selection');
        onChange(!value);
      }}
      style={styles.row}
    >
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      <Animated.View style={[styles.switch, { backgroundColor: bg, opacity: disabled ? 0.6 : 1 }]}>
        <Animated.View style={[styles.knob, { transform: [{ translateX: x }] }]} />
      </Animated.View>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            disabled={disabled}
            onPress={() => {
              haptic('selection');
              onChange(o.value);
            }}
            style={[styles.segmentItem, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Игроки ----------

export function Avatar({ name, id, size = 40, ring }: { name: string; id: string; size?: number; ring?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avatarColor(id),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 3 : 0,
        borderColor: ring,
      }}
    >
      <Text style={{ color: '#fff', fontFamily: fonts.heavy, fontSize: size * 0.42 }}>
        {(name || '?').slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function Pill({ text, color, solid }: { text: string; color: string; solid?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: solid ? color : color + '22', borderColor: color + '55' }]}>
      <Text style={[styles.pillText, { color: solid ? '#fff' : color }]}>{text}</Text>
    </View>
  );
}

/** Пульсирующая точка — «в эфире». */
export function LiveDot({ color = colors.hider }: { color?: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: 10, height: 10, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
        }}
      />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
  btnBig: { paddingVertical: 18, paddingHorizontal: 20, borderRadius: radius.lg, minHeight: 64 },
  ghost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btnIcon: { fontSize: 20 },
  btnIconBig: { fontSize: 28 },
  btnText: { color: '#fff', fontSize: 16, fontFamily: fonts.bold },
  btnTextBig: { fontSize: 18, fontFamily: fonts.heavy },
  btnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontFamily: fonts.semibold, marginTop: 1 },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 20, color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardIcon: { fontSize: 18 },
  cardTitle: { fontSize: 15, fontFamily: fonts.title, color: colors.text, letterSpacing: 0.2 },
  hint: { color: colors.muted, fontSize: 13, fontFamily: fonts.body, marginTop: 6, lineHeight: 18 },
  divider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, minHeight: 48 },
  label: { fontSize: 15, color: colors.text, fontFamily: fonts.semibold },
  rowHint: { fontSize: 12, color: colors.muted, fontFamily: fonts.body, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.input,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: colors.text, fontFamily: fonts.bold, marginTop: -2 },
  stepOff: { color: colors.muted },
  value: { minWidth: 72, textAlign: 'center', fontSize: 16, fontFamily: fonts.heavy, color: colors.text },
  unit: { fontSize: 13, fontFamily: fonts.semibold, color: colors.textDim },
  switch: { width: 50, height: 30, borderRadius: 15, justifyContent: 'center' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  segment: { flexDirection: 'row', backgroundColor: colors.input, borderRadius: radius.md, padding: 4, gap: 4 },
  segmentItem: { flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: 'center' },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textDim, fontFamily: fonts.bold, fontSize: 13 },
  segmentTextActive: { color: '#fff' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  pillText: { fontFamily: fonts.bold, fontSize: 12 },
});
