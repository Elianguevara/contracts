import type { Handle } from '@sveltejs/kit';
import { getAdminAuth, getAdminDb } from '$lib/firebase/admin.server';
import { env } from '$env/dynamic/private';
import type { SessionUser, Usuario } from '$lib/types/firestore';

const COOKIE = env.SESSION_COOKIE_NAME || '__session';

/**
 * Hook de servidor: en CADA request resuelve el usuario a partir de la cookie de sesión
 * Firebase (creada en /api/session con firebase-admin) y lo deja en `event.locals.user`.
 *
 * Esto habilita los guards por rol en los `+layout.server.ts` / `+page.server.ts`.
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	const sessionCookie = event.cookies.get(COOKIE);
	if (sessionCookie) {
		try {
			// checkRevoked = true: invalida sesiones revocadas (logout global, cambio de contraseña).
			const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
			const snap = await getAdminDb().collection('usuarios').doc(decoded.uid).get();

			if (snap.exists) {
				const data = snap.data() as Usuario;
				event.locals.user = {
					uid: decoded.uid,
					email: decoded.email ?? '',
					rol: data.rol,
					razonSocial: data.razonSocial,
					habilitado: data.habilitado
				} satisfies SessionUser;
			}
		} catch {
			// Cookie inválida/expirada: la limpiamos silenciosamente.
			event.cookies.delete(COOKIE, { path: '/' });
		}
	}

	return resolve(event);
};
