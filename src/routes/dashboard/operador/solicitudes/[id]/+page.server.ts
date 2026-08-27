import { error, fail } from '@sveltejs/kit';
import { requireRole } from '$lib/auth/guards.server';
import {
	aprobarSolicitud,
	finalizarSolicitud,
	obtenerSolicitud,
	rechazarSolicitud,
	type FinalizarInput
} from '$server/solicitudes.service';
import type { TipoCertificado, UnidadPeso } from '$lib/types/firestore';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireRole(locals.user, ['OPERADOR']);
	const solicitud = await obtenerSolicitud(params.id);
	if (solicitud.operadorId !== user.uid && user.rol !== 'ADMIN') {
		throw error(403, 'No sos el operador destino de esta solicitud.');
	}
	return { solicitud };
};

function toMessage(e: unknown): { status: number; message: string } {
	const err = e as { status?: number; body?: { message?: string }; message?: string };
	return {
		status: typeof err?.status === 'number' ? err.status : 400,
		message: err?.body?.message ?? err?.message ?? 'No se pudo procesar la acción.'
	};
}

export const actions: Actions = {
	aprobar: async ({ locals, params }) => {
		const user = requireRole(locals.user, ['OPERADOR']);
		try {
			await aprobarSolicitud(params.id, user);
			return { ok: true };
		} catch (e) {
			const { status, message } = toMessage(e);
			return fail(status, { error: message });
		}
	},

	rechazar: async ({ locals, params, request }) => {
		const user = requireRole(locals.user, ['OPERADOR']);
		const form = await request.formData();
		const observacion = String(form.get('observacion') ?? '');
		if (!observacion.trim()) return fail(400, { error: 'La observación técnica es obligatoria.' });
		try {
			await rechazarSolicitud(params.id, user, observacion);
			return { ok: true };
		} catch (e) {
			const { status, message } = toMessage(e);
			return fail(status, { error: message });
		}
	},

	finalizar: async ({ locals, params, request }) => {
		const user = requireRole(locals.user, ['OPERADOR']);
		const form = await request.formData();

		const input: FinalizarInput = {
			pesoRecibidoTotal: Number(form.get('pesoRecibidoTotal') ?? 0),
			unidad: (String(form.get('unidad') ?? 'kg') as UnidadPeso) || 'kg',
			conforme: String(form.get('conforme') ?? 'true') === 'true',
			codigoOperacion: String(form.get('codigoOperacion') ?? ''),
			tipoCertificado: String(form.get('tipoCertificado') ?? 'TRATAMIENTO') as TipoCertificado,
			resumenProceso: String(form.get('resumenProceso') ?? ''),
			patenteRecibida: String(form.get('patenteRecibida') ?? ''),
			observaciones: String(form.get('observaciones') ?? '')
		};

		try {
			const { numeroCertificado } = await finalizarSolicitud(params.id, user, input);
			return { ok: true, numeroCertificado };
		} catch (e) {
			const { status, message } = toMessage(e);
			return fail(status, { error: message });
		}
	}
};
