import type { ReporteRecepcion, UnidadPeso } from '$lib/types/firestore';

export interface ReporteInput {
	solicitudId: string;
	operadorId: string;
	pesoDeclarado: number;
	pesoRecibido: number;
	unidad: UnidadPeso;
	patenteDeclarada: string;
	patenteRecibida: string;
	observaciones: string;
}

/**
 * Construye el documento de reporte de recepción (sin id).
 * Se persiste dentro de la transacción de cierre del operador cuando la carga
 * recibida difiere de la declarada (peso, patente/vehículo mutado, etc.).
 */
export function buildReporteDoc(input: ReporteInput): Omit<ReporteRecepcion, 'id'> {
	return {
		solicitudId: input.solicitudId,
		operadorId: input.operadorId,
		pesoDeclarado: input.pesoDeclarado,
		pesoRecibido: input.pesoRecibido,
		unidad: input.unidad,
		patenteDeclarada: input.patenteDeclarada,
		patenteRecibida: input.patenteRecibida,
		observaciones: input.observaciones,
		createdAt: new Date().toISOString()
	};
}
