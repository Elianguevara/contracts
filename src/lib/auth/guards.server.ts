import { error, redirect } from '@sveltejs/kit';
import type { RolUsuario, SessionUser } from '$lib/types/firestore';

/**
 * Guardas reutilizables para `+layout.server.ts` / `+page.server.ts` / acciones.
 * Lanzan redirect (303) a /login o error (403) si no se cumplen las condiciones.
 */
export function requireAuth(user: SessionUser | null): SessionUser {
	if (!user) throw redirect(303, '/login');
	if (!user.habilitado) throw redirect(303, '/login?error=deshabilitado');
	return user;
}

export function requireRole(user: SessionUser | null, roles: RolUsuario[]): SessionUser {
	const u = requireAuth(user);
	// ADMIN tiene acceso transversal.
	if (u.rol !== 'ADMIN' && !roles.includes(u.rol)) {
		throw error(403, 'No estás autorizado para acceder a esta sección.');
	}
	return u;
}
