import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import admin from 'firebase-admin';

function parseEnvFile(filePath) {
	const content = readFileSync(filePath, 'utf8');
	return content
		.split(/\r?\n/)
		.filter(Boolean)
		.reduce((env, line) => {
			const match = line.match(/^([^#=\s]+)=(.*)$/);
			if (!match) return env;
			const [, key, rawValue] = match;
			let value = rawValue.trim();
			if (value.startsWith('"') && value.endsWith('"')) {
				value = value.slice(1, -1);
			}
			env[key] = value;
			return env;
		}, {});
}

const envPath = join(process.cwd(), '.env');
const env = parseEnvFile(envPath);

const projectId = env.FIREBASE_PROJECT_ID || env.PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = env.FIREBASE_CLIENT_EMAIL;
const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const authEmulatorHost = env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreEmulatorHost = env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';

if (!projectId) {
	throw new Error('FIREBASE_PROJECT_ID no definido en .env');
}

if (!clientEmail || !privateKey) {
	console.warn(
		'Advertencia: usando Firebase Admin SDK sin credenciales completas. Si usás emulador, esto puede estar bien.'
	);
}

process.env.FIREBASE_AUTH_EMULATOR_HOST = authEmulatorHost;
process.env.FIRESTORE_EMULATOR_HOST = firestoreEmulatorHost;

const args = Object.fromEntries(
	process.argv.slice(2).map((arg) => {
		const [key, ...rest] = arg.split('=');
		return [key.replace(/^--/, ''), rest.join('=')];
	})
);

const users = [
	{
		name: 'Administrador',
		email: args.adminEmail || 'admin@ecotrace.test',
		password: args.adminPassword || 'Admin123!',
		rol: 'ADMIN',
		razonSocial: 'Administrador',
		cuit: '00000000000',
		nroRegistro: '000000',
		domicilioReal: 'Oficina central'
	},
	{
		name: 'Generador de prueba',
		email: args.generadorEmail || 'generador@ecotrace.test',
		password: args.generadorPassword || 'Generador123!',
		rol: 'GENERADOR',
		razonSocial: 'Generador Test',
		cuit: '11111111111',
		nroRegistro: 'GEN-001',
		domicilioReal: 'Planta generadora'
	},
	{
		name: 'Operador de prueba',
		email: args.operadorEmail || 'operador@ecotrace.test',
		password: args.operadorPassword || 'Operador123!',
		rol: 'OPERADOR',
		razonSocial: 'Operador Test',
		cuit: '22222222222',
		nroRegistro: 'OPR-001',
		domicilioReal: 'Planta operadora'
	},
	{
		name: 'Almacenador de prueba',
		email: args.almacenadorEmail || 'almacenador@ecotrace.test',
		password: args.almacenadorPassword || 'Almacenador123!',
		rol: 'ALMACENADOR_TRANSITORIO',
		razonSocial: 'Almacenador Test',
		cuit: '33333333333',
		nroRegistro: 'ALM-001',
		domicilioReal: 'Deposito transitorio'
	},
	{
		name: 'Transportista de prueba',
		email: args.transportistaEmail || 'transportista@ecotrace.test',
		password: args.transportistaPassword || 'Transportista123!',
		rol: 'TRANSPORTISTA',
		razonSocial: 'Transportista Test',
		cuit: '44444444444',
		nroRegistro: 'TRA-001',
		domicilioReal: 'Base de transporte'
	}
];

const adminApp = admin.initializeApp({
	credential:
		clientEmail && privateKey
			? admin.credential.cert({ projectId, clientEmail, privateKey })
			: admin.credential.applicationDefault(),
	projectId
});

const auth = admin.auth(adminApp);
const db = admin.firestore(adminApp);

async function createUser(user) {
	let record;
	try {
		record = await auth.createUser({
			email: user.email,
			password: user.password,
			displayName: user.name,
			emailVerified: true,
			disabled: false
		});
		console.log(`✔ Usuario creado en Auth: ${user.email} (${record.uid})`);
	} catch (error) {
		if (error.code === 'auth/email-already-exists' || error.code === 'auth/user-already-exists') {
			record = await auth.getUserByEmail(user.email);
			console.log(`ℹ Usuario ya existe en Auth: ${user.email} (${record.uid})`);
		} else {
			throw error;
		}
	}

	await db.collection('usuarios').doc(record.uid).set(
		{
			uid: record.uid,
			razonSocial: user.razonSocial,
			cuit: user.cuit,
			nroRegistro: user.nroRegistro,
			domicilioReal: user.domicilioReal,
			rol: user.rol,
			habilitado: true,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		},
		{ merge: true }
	);

	console.log(`✔ Documento Firestore guardado: usuarios/${record.uid}`);
}

async function main() {
	console.log('Usando proyecto:', projectId);
	console.log('Auth emulator:', process.env.FIREBASE_AUTH_EMULATOR_HOST);
	console.log('Firestore emulator:', process.env.FIRESTORE_EMULATOR_HOST);

	for (const user of users) {
		await createUser(user);
	}

	console.log('\nUsuarios de prueba creados/actualizados.');
	console.log('Admin:', users[0].email, users[0].password);
	console.log('Generador:', users[1].email, users[1].password);
	console.log('Operador:', users[2].email, users[2].password);
	console.log('Almacenador:', users[3].email, users[3].password);
	console.log('Transportista:', users[4].email, users[4].password);
}

main().catch((error) => {
	console.error('Error:', error);
	process.exit(1);
});
