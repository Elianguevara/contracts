import { redirect } from '@sveltejs/kit';
import { homeForRole } from '$lib/auth/roles';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (!locals.user.habilitado) throw redirect(303, '/login?error=deshabilitado');

	// /dashboard (raíz) redirige al home del rol.
	const path = url.pathname.replace(/\/+$/, '');
	if (path === '/dashboard') throw redirect(303, homeForRole(locals.user.rol));

	return { user: locals.user };
};
