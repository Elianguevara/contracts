import { requireRole } from '$lib/auth/guards.server';
import { listarUsuariosPorRol } from '$server/usuarios.service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	requireRole(locals.user, ['GENERADOR', 'ALMACENADOR_TRANSITORIO']);

	const [operadores, transportistas] = await Promise.all([
		listarUsuariosPorRol('OPERADOR'),
		listarUsuariosPorRol('TRANSPORTISTA')
	]);

	return { operadores, transportistas };
};
