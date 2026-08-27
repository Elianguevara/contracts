/**
 * Aplica la configuración CORS de `cors.json` al bucket de Firebase Storage.
 *
 * Uso:
 *   node scripts/set-cors.mjs
 *
 * Requiere `serviceAccountKey.json` en la raíz del proyecto (cuenta de servicio
 * con permiso `storage.buckets.update`, p. ej. rol Editor o Storage Admin).
 * El nombre del bucket se toma de PUBLIC_FIREBASE_STORAGE_BUCKET (.env) o del
 * `storageBucket` de la clave de servicio.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const serviceAccount = JSON.parse(readFileSync(resolve(root, 'serviceAccountKey.json'), 'utf8'));
const cors = JSON.parse(readFileSync(resolve(root, 'cors.json'), 'utf8'));

function readBucketFromEnv() {
	try {
		const env = readFileSync(resolve(root, '.env'), 'utf8');
		const match = env.match(/^\s*PUBLIC_FIREBASE_STORAGE_BUCKET\s*=\s*["']?([^"'\r\n]+)/m);
		return match?.[1];
	} catch {
		return undefined;
	}
}

const bucketName =
	process.env.PUBLIC_FIREBASE_STORAGE_BUCKET ||
	readBucketFromEnv() ||
	`${serviceAccount.project_id}.firebasestorage.app`;

initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName });

const bucket = getStorage().bucket(bucketName);
await bucket.setCorsConfiguration(cors);

const [metadata] = await bucket.getMetadata();
console.log(`CORS aplicado a gs://${bucketName}`);
console.log(JSON.stringify(metadata.cors, null, 2));
