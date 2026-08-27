import { redirect } from '@sveltejs/kit';
import { homeForRole } from '$lib/auth/roles';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(303, homeForRole(locals.user.rol));
	return {};
};
