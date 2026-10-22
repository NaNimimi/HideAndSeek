import { initializeApp } from 'firebase/app';
import { initializeFirestore } from 'firebase/firestore';

import { FIREBASE_CONFIG } from '@/config';

const app = initializeApp(FIREBASE_CONFIG);

// Long polling работает в React Native стабильнее, чем WebChannel по умолчанию.
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
