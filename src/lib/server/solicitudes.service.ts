import { error } from '@sveltejs/kit';
import { getAdminDb } from '$lib/firebase/admin.server';
import type {
	RecepcionInfo,
	ResiduoSolicitud,
	SessionUser,
	SolicitudTraslado,
	TipoCertificado,
	TipoOperacionFinal,
	UnidadPeso
} from '$lib/types/firestore';
import {
	generarCodigoDespacho,
	generarNumeroCertificado,
	generarNumeroManifiesto
} from '$lib/utils/despacho-code';
import { buildReporteDoc } from './reportes.service';
import { buildCertificadoDoc } from './certificados.service';

const solicitudesCol = () => getAdminDb().collection('solicitudes');
const nowIso = () => new Date().toISOString();

export async function obtenerSolicitud(id: string): Promise<SolicitudTraslado> {
	const snap = await solicitudesCol().doc(id).get();
	if (!snap.exists) throw error(404, 'Solicitud no encontrada.');
	return { id: snap.id, ...(snap.data() as Omit<SolicitudTraslado, 'id'>) };
}

/** OPERADOR (o ADMIN): INICIADA -> APROBADA */
export async function aprobarSolicitud(id: string, actor: SessionUser): Promise<void> {
	await getAdminDb().runTransaction(async (tx) => {
		const ref = solicitudesCol().doc(id);
		const snap = await tx.get(ref);
		if (!snap.exists) throw error(404, 'Solicitud no encontrada.');
		const data = snap.data() as SolicitudTraslado;

		if (actor.rol !== 'ADMIN' && data.operadorId !== actor.uid)
			throw error(403, 'No sos el operador destino de esta solicitud.');
		if (data.estado !== 'INICIADA')
			throw error(409, `No se puede aprobar una solicitud en estado ${data.estado}.`);

		tx.update(ref, { estado: 'APROBADA', fechaAprobacion: nowIso() });
	});
}

/** OPERADOR (o ADMIN): INICIADA -> RECHAZADA (exige observación técnica) */
export async function rechazarSolicitud(
	id: string,
	actor: SessionUser,
	observacion: string
): Promise<void> {
	const obs = observacion?.trim();
	if (!obs) throw error(400, 'La observación técnica es obligatoria para rechazar.');

	await getAdminDb().runTransaction(async (tx) => {
		const ref = solicitudesCol().doc(id);
		const snap = await tx.get(ref);
		if (!snap.exists) throw error(404, 'Solicitud no encontrada.');
		const data = snap.data() as SolicitudTraslado;

		if (actor.rol !== 'ADMIN' && data.operadorId !== actor.uid)
			throw error(403, 'No sos el operador destino de esta solicitud.');
		if (data.estado !== 'INICIADA')
			throw error(409, `No se puede rechazar una solicitud en estado ${data.estado}.`);

		tx.update(ref, { estado: 'RECHAZADA', observacionRechazo: obs, fechaAprobacion: nowIso() });
	});
}

/** GENERADOR: APROBADA -> MANIFIESTO_GENERADO (bloquea edición + códigos de despacho por bulto) */
export async function generarManifiesto(id: string, actor: SessionUser): Promise<string> {
	return getAdminDb().runTransaction(async (tx) => {
		const ref = solicitudesCol().doc(id);
		const snap = await tx.get(ref);
		if (!snap.exists) throw error(404, 'Solicitud no encontrada.');
		const data = snap.data() as SolicitudTraslado;

		if (actor.rol !== 'ADMIN' && data.generadorId !== actor.uid)
			throw error(403, 'Solo el generador puede emitir el manifiesto.');
		if (data.estado !== 'APROBADA')
			throw error(409, `El manifiesto solo se emite desde estado APROBADA (actual: ${data.estado}).`);

		const residuos: ResiduoSolicitud[] = data.residuos.map((r, ri) => ({
			...r,
			codigosDespacho: Array.from({ length: r.cantidadBultos }, (_, bi) =>
				generarCodigoDespacho(id, ri, bi)
			)
		}));
		const codigosDespacho = residuos.flatMap((r) => r.codigosDespacho ?? []);
		const numero = generarNumeroManifiesto(id);

		tx.update(ref, {
			estado: 'MANIFIESTO_GENERADO',
			residuos,
			manifiesto: { numero, codigosDespacho, generadoEn: nowIso() },
			fechaManifiesto: nowIso()
		});

		return numero;
	});
}

export interface FinalizarInput {
	pesoRecibidoTotal: number;
	unidad: UnidadPeso;
	conforme: boolean;
	codigoOperacion: string;
	tipoCertificado: TipoCertificado;
	resumenProceso: string;
	patenteRecibida?: string;
	observaciones?: string;
}

/**
 * OPERADOR: MANIFIESTO_GENERADO -> FINALIZADA
 * Registra pesaje real; si hay disconformidad crea reporte de recepción; emite certificado.
 * Todo dentro de una única transacción (lecturas antes que escrituras).
 */
export async function finalizarSolicitud(
	id: string,
	actor: SessionUser,
	input: FinalizarInput
): Promise<{ numeroCertificado: string }> {
	if (!input.codigoOperacion?.trim()) throw error(400, 'El código de operación (R/D) es obligatorio.');
	if (!input.resumenProceso?.trim()) throw error(400, 'El resumen del proceso es obligatorio.');
	if (!(input.pesoRecibidoTotal > 0)) throw error(400, 'El peso recibido debe ser mayor a 0.');

	const codigoOperacion = input.codigoOperacion.trim().toUpperCase();
	const tipoOperacion: TipoOperacionFinal = codigoOperacion.startsWith('D') ? 'D' : 'R';

	return getAdminDb().runTransaction(async (tx) => {
		const ref = solicitudesCol().doc(id);
		const counterRef = getAdminDb().collection('contadores').doc('certificados');

		// --- LECTURAS ---
		const snap = await tx.get(ref);
		if (!snap.exists) throw error(404, 'Solicitud no encontrada.');
		const data = snap.data() as SolicitudTraslado;
		if (actor.rol !== 'ADMIN' && data.operadorId !== actor.uid)
			throw error(403, 'No sos el operador destino de esta solicitud.');
		if (data.estado !== 'MANIFIESTO_GENERADO')
			throw error(409, `Solo se finaliza desde MANIFIESTO_GENERADO (actual: ${data.estado}).`);

		// El operador destino real de la solicitud (el certificado/reporte se emiten a su nombre,
		// aunque quien ejecute la acción sea un ADMIN).
		const operadorId = data.operadorId;

		const counterSnap = await tx.get(counterRef);
		const seq = (counterSnap.exists ? Number(counterSnap.data()?.valor ?? 0) : 0) + 1;
		const numeroCertificado = generarNumeroCertificado(seq);

		// --- ESCRITURAS ---
		let reporteId: string | undefined;
		if (!input.conforme) {
			const reporteRef = ref.collection('reportes_recepcion').doc();
			reporteId = reporteRef.id;
			const pesoDeclarado = data.residuos.reduce((acc, r) => acc + Number(r.peso || 0), 0);
			tx.set(
				reporteRef,
				buildReporteDoc({
					solicitudId: id,
					operadorId,
					pesoDeclarado,
					pesoRecibido: input.pesoRecibidoTotal,
					unidad: input.unidad,
					patenteDeclarada: data.vehiculo.patente,
					patenteRecibida: input.patenteRecibida?.trim() || data.vehiculo.patente,
					observaciones: input.observaciones?.trim() || 'Disconformidad registrada en recepción.'
				})
			);
		}

		const certRef = ref.collection('certificados').doc();
		tx.set(
			certRef,
			buildCertificadoDoc(
				{
					solicitudId: id,
					operadorId,
					codigoOperacion,
					tipoCertificado: input.tipoCertificado,
					resumenProceso: input.resumenProceso.trim()
				},
				numeroCertificado
			)
		);
		tx.set(counterRef, { valor: seq }, { merge: true });

		const recepcion: RecepcionInfo = {
			pesoRecibidoTotal: input.pesoRecibidoTotal,
			unidad: input.unidad,
			conforme: input.conforme,
			operacionFinal: codigoOperacion,
			tipoOperacion,
			registradoEn: nowIso()
		};
		if (reporteId) recepcion.reporteId = reporteId;

		tx.update(ref, {
			estado: 'FINALIZADA',
			recepcion,
			certificadoId: certRef.id,
			fechaFinalizacion: nowIso()
		});

		return { numeroCertificado };
	});
}
