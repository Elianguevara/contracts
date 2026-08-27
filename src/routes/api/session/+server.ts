import { json, type RequestHandler } from '@sveltejs/kit';
import { getAdminAuth } from '$lib/firebase/admin.server';
import { env } from '$env/dynamic/private';

const COOKIE = env.SESSION_COOKIE_NAME || '__session';
const DAYS = Number(env.SESSION_COOKIE_DAYS || '5');

/**
 * Intercambia el idToken de Firebase Auth (obtenido en el cliente tras el login)
 * por una cookie de sesión httpOnly firmada por firebase-admin.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const { idToken } = await request.json().catch(() => ({}));
	if (!idToken || typeof idToken !== 'string') {
		return json({ error: 'idToken requerido' }, { status: 400 });
	}

	const expiresIn = DAYS * 24 * 60 * 60 * 1000;
	try {
		const sessionCookie = await getAdminAuth().createSessionCookie(idToken, { expiresIn });
		cookies.set(COOKIE, sessionCookie, {
			path: '/',
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			maxAge: Math.floor(expiresIn / 1000)
		});
		return json({ ok: true });
	} catch {
		return json({ error: 'No se pudo crear la sesión' }, { status: 401 });
	}
};

/** Logout: elimina la cookie de sesión. */
export const DELETE: RequestHandler = async ({ cookies }) => {
	cookies.delete(COOKIE, { path: '/' });
	return json({ ok: true });
};
