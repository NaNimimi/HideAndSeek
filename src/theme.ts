// Единая дизайн-система: ночная игровая тема.

export const colors = {
  bg: '#0B0E14',
  bgElevated: '#121722',
  card: '#161C28',
  cardBorder: '#232B3B',
  input: '#1C2333',
  text: '#F3F5FA',
  textDim: '#A3ABBD',
  muted: '#6C7489',
  primary: '#7C5CFF',
  primaryDeep: '#5B3DF0',
  seeker: '#FF4D5E',
  seekerDeep: '#E0263A',
  hider: '#2EE59D',
  hiderDeep: '#12B877',
  warn: '#FFB020',
  me: '#3DA9FF',
  white: '#FFFFFF',
  overlay: 'rgba(6, 8, 12, 0.88)',
  glass: 'rgba(18, 23, 34, 0.86)',
};

export const gradients = {
  primary: ['#8B6CFF', '#5B3DF0'] as const,
  seeker: ['#FF6B6B', '#E0263A'] as const,
  hider: ['#3FF0AE', '#12B877'] as const,
  bg: ['#151A2C', '#0B0E14'] as const,
};

export const fonts = {
  display: 'Unbounded_800ExtraBold',
  title: 'Unbounded_700Bold',
  body: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
};

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };

export const roleColor = (role: 'seeker' | 'hider') => (role === 'seeker' ? colors.seeker : colors.hider);
export const roleName = (role: 'seeker' | 'hider') => (role === 'seeker' ? 'Охотник' : 'Прячется');

/** Цвет аватарки по имени — у каждого игрока свой. */
const AVATAR = ['#7C5CFF', '#3DA9FF', '#FF8A3D', '#FF5FA2', '#2EC4B6', '#C77DFF', '#FFC43D', '#5BD15B'];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR[h % AVATAR.length];
}
