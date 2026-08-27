import { fail } from '@sveltejs/kit';
import { requireRole } from '$lib/auth/guards.server';
import { aprobarSolicitud, rechazarSolicitud } from '$server/solicitudes.service';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireRole(locals.user, ['OPERADOR']);
	return { user };
};

function toMessage(e: unknown): { status: number; message: string } {
	const err = e as { status?: number; body?: { message?: string }; message?: string };
	return {
		status: typeof err?.status === 'number' ? err.status : 400,
		message: err?.body?.message ?? err?.message ?? 'No se pudo procesar la acción.'
	};
}

export const actions: Actions = {
	aprobar: async ({ locals, request }) => {
		const user = requireRole(locals.user, ['OPERADOR']);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { error: 'Falta el identificador de la solicitud.' });
		try {
			await aprobarSolicitud(id, user);
			return { ok: true };
		} catch (e) {
			const { status, message } = toMessage(e);
			return fail(status, { error: message });
		}
	},

	rechazar: async ({ locals, request }) => {
		const user = requireRole(locals.user, ['OPERADOR']);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const observacion = String(form.get('observacion') ?? '');
		if (!id) return fail(400, { error: 'Falta el identificador de la solicitud.' });
		if (!observacion.trim()) return fail(400, { error: 'La observación técnica es obligatoria.' });
		try {
			await rechazarSolicitud(id, user, observacion);
			return { ok: true };
		} catch (e) {
			const { status, message } = toMessage(e);
			return fail(status, { error: message });
		}
	}
};
