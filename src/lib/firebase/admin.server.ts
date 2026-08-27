import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import {
	FIREBASE_PROJECT_ID,
	FIREBASE_CLIENT_EMAIL,
	FIREBASE_PRIVATE_KEY
} from '$env/static/private';

const useFirebaseEmulators =
	privateEnv.USE_FIREBASE_EMULATORS === 'true' ||
	publicEnv.PUBLIC_USE_FIREBASE_EMULATORS === 'true';

if (useFirebaseEmulators) {
	process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
	process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}

/**
 * Firebase Admin SDK (solo servidor). NUNCA debe importarse en código de cliente.
 * El sufijo `.server.ts` garantiza que SvelteKit no lo empaquete para el navegador.
 *
 * Inicialización PEREZOSA: el `initializeApp`/`cert()` se ejecuta la primera vez que
 * se pide `getAdminAuth()`/`getAdminDb()`, no al importar el módulo. Esto evita que
 * el paso de análisis del build (que importa los módulos de servidor) intente parsear
 * credenciales inexistentes.
 */
let appInstance: App | null = null;

function adminApp(): App {
	if (appInstance) return appInstance;
	appInstance = getApps().length
		? getApps()[0]
		: initializeApp({
				credential: cert({
					projectId: FIREBASE_PROJECT_ID,
					clientEmail: FIREBASE_CLIENT_EMAIL,
					// La clave privada viene con \n escapados en el .env
					privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
				})
			});
	return appInstance;
}

export function getAdminAuth(): Auth {
	return getAuth(adminApp());
}

export function getAdminDb(): Firestore {
	return getFirestore(adminApp());
}
