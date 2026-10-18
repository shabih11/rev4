import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

export const app = initializeApp({
  apiKey: 'AIzaSyDy6K57_X0zfm8Wj_QJDq_peEIO89CdEm0',
  authDomain: 'iamspec.firebaseapp.com',
  projectId: 'iamspec',
  storageBucket: 'iamspec.firebasestorage.app',
  messagingSenderId: '16910957582',
  appId: '1:16910957582:web:e5f9f33d759658cc14505f',
});
export const db = getFirestore(app);
export const auth = getAuth(app);
export const APP_PATH = 'apps/rev4';
