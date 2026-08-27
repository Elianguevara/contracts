import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serviceAccount = JSON.parse(readFileSync(resolve(root, 'serviceAccountKey.json'), 'utf8'));

initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });

// Instancia Storage subyacente (@google-cloud/storage) a partir de una ref de bucket.
const storage = getStorage().bucket('placeholder').storage;

const [buckets] = await storage.getBuckets();
console.log(`Buckets en el proyecto ${serviceAccount.project_id}:`);
for (const b of buckets) console.log(' -', b.name);
if (!buckets.length) console.log(' (ninguno — Storage no está aprovisionado)');
