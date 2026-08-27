/**
 * Generación de códigos/folios unívocos para la trazabilidad del residuo.
 * En producción, el folio "oficial" con carácter de declaración jurada lo emite
 * una Cloud Function (ver functions/src/index.ts) que además calcula el hash SHA-256.
 */

/**
 * Código de despacho unívoco por bulto/embalaje.
 * Formato: DSP-<solicitud6>-R<residuo>-B<bulto>-<random4>
 */
export function generarCodigoDespacho(
	solicitudId: string,
	residuoIndex: number,
	bultoIndex: number
): string {
	const base = solicitudId.slice(0, 6).toUpperCase();
	const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
	const r = String(residuoIndex + 1).padStart(2, '0');
	const b = String(bultoIndex + 1).padStart(3, '0');
	return `DSP-${base}-R${r}-B${b}-${rnd}`;
}

/** Número de manifiesto. Formato: MAN-<año>-<solicitud8>. */
export function generarNumeroManifiesto(solicitudId: string): string {
	const year = new Date().getFullYear();
	const base = solicitudId.slice(0, 8).toUpperCase();
	return `MAN-${year}-${base}`;
}

/** Número correlativo de certificado. Formato: CERT-<año>-00001. */
export function generarNumeroCertificado(secuencia: number): string {
	const year = new Date().getFullYear();
	return `CERT-${year}-${String(secuencia).padStart(5, '0')}`;
}
