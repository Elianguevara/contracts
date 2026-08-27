import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';
import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_FIREBASE_STORAGE_BUCKET,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	PUBLIC_FIREBASE_APP_ID
} from '$env/static/public';

/**
 * SDK de Firebase para el navegador (cliente).
 * Se usa para: login (Auth), lecturas en tiempo real (onSnapshot) y subida a Storage.
 * Las escrituras sensibles de estado se hacen vía acciones del servidor (firebase-admin).
 */
const firebaseConfig = {
	apiKey: PUBLIC_FIREBASE_API_KEY,
	authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: PUBLIC_FIREBASE_APP_ID
};

export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

const useFirebaseEmulators = publicEnv.PUBLIC_USE_FIREBASE_EMULATORS === 'true';
const useStorageEmulator = publicEnv.PUBLIC_USE_STORAGE_EMULATOR === 'true' || useFirebaseEmulators;

if (browser && (useFirebaseEmulators || useStorageEmulator)) {
	const g = globalThis as typeof globalThis & {
		__ecotraceFirebaseEmu?: boolean;
	};
	if (!g.__ecotraceFirebaseEmu) {
		if (useFirebaseEmulators) {
			connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
				disableWarnings: true
			});
			connectFirestoreEmulator(db, '127.0.0.1', 8080);
		}
		if (useStorageEmulator) {
			connectStorageEmulator(storage, '127.0.0.1', 9199);
		}
		g.__ecotraceFirebaseEmu = true;
	}
}
