import { error } from '@sveltejs/kit';
import { requireRole } from '$lib/auth/guards.server';
import { generarManifiesto, obtenerSolicitud } from '$server/solicitudes.service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireRole(locals.user, ['GENERADOR', 'ALMACENADOR_TRANSITORIO']);
	const solicitud = await obtenerSolicitud(params.id);
	if (solicitud.generadorId !== user.uid && user.rol !== 'ADMIN') {
		throw error(403, 'Esta solicitud no te pertenece.');
	}
	return { solicitud };
};

export const actions: Actions = {
	generar: async ({ locals, params }) => {
		const user = requireRole(locals.user, ['GENERADOR', 'ALMACENADOR_TRANSITORIO']);
		const numero = await generarManifiesto(params.id, user);
		return { ok: true, numero };
	}
};
