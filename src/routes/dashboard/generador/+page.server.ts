import { requireRole } from '$lib/auth/guards.server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireRole(locals.user, ['GENERADOR', 'ALMACENADOR_TRANSITORIO']);
	return { user };
};
