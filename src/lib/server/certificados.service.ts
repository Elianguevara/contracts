import type { CertificadoTratamiento, TipoCertificado } from '$lib/types/firestore';

export interface CertificadoInput {
	solicitudId: string;
	operadorId: string;
	/** Código de operación final ejecutada (R/D), p. ej. R8, D15. */
	codigoOperacion: string;
	tipoCertificado: TipoCertificado;
	resumenProceso: string;
}

/**
 * Construye el documento de certificado (sin id) con el folio ya reservado.
 * `pdfUrl`/`hashDocumento` se completan cuando la Cloud Function genera el PDF oficial.
 */
export function buildCertificadoDoc(
	input: CertificadoInput,
	numeroCertificado: string
): Omit<CertificadoTratamiento, 'id'> {
	return {
		solicitudId: input.solicitudId,
		operadorId: input.operadorId,
		codigoOperacion: input.codigoOperacion,
		tipoCertificado: input.tipoCertificado,
		resumenProceso: input.resumenProceso,
		numeroCertificado,
		firmadoPor: input.operadorId,
		pdfUrl: '',
		createdAt: new Date().toISOString()
	};
}
