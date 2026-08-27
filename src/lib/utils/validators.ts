import type { EstadoResiduo, ResiduoSolicitud, UnidadPeso } from '$lib/types/firestore';

/**
 * Catálogos normativos (Convenio de Basilea / normativa de residuos peligrosos).
 *  - Códigos Y: categorías/constituyentes del residuo (Anexo I/II).
 *  - Códigos R: operaciones de recuperación/valorización (Anexo IV.B).
 *  - Códigos D: operaciones de eliminación/disposición final (Anexo IV.A).
 */
export const CODIGOS_Y: string[] = Array.from({ length: 47 }, (_, i) => `Y${i + 1}`);
export const CODIGOS_R: string[] = Array.from({ length: 13 }, (_, i) => `R${i + 1}`);
export const CODIGOS_D: string[] = Array.from({ length: 15 }, (_, i) => `D${i + 1}`);

export const CODIGOS_OPERACION_FINAL: string[] = [...CODIGOS_R, ...CODIGOS_D];

export const ESTADOS_RESIDUO: { value: EstadoResiduo; label: string }[] = [
	{ value: 'SOLIDO', label: 'Sólido' },
	{ value: 'LIQUIDO', label: 'Líquido' },
	{ value: 'SEMISOLIDO', label: 'Semisólido' },
	{ value: 'GASEOSO', label: 'Gaseoso' }
];

export const UNIDADES_PESO: { value: UnidadPeso; label: string }[] = [
	{ value: 'kg', label: 'Kilogramos (kg)' },
	{ value: 'tn', label: 'Toneladas (tn)' }
];

export function esCodigoYValido(codigo: string): boolean {
	return CODIGOS_Y.includes(codigo.trim().toUpperCase());
}

export function esCodigoOperacionValido(codigo: string): boolean {
	return CODIGOS_OPERACION_FINAL.includes(codigo.trim().toUpperCase());
}

const CUIT_RE = /^\d{2}-?\d{8}-?\d$/;
export function esCuitValido(cuit: string): boolean {
	return CUIT_RE.test(cuit.trim());
}

/** Valida un residuo del formulario. Devuelve la lista de errores (vacía = válido). */
export function validarResiduo(r: Partial<ResiduoSolicitud>): string[] {
	const errores: string[] = [];
	if (!r.codigoY || !esCodigoYValido(r.codigoY)) errores.push('Código Y inválido.');
	if (!r.descripcion?.trim()) errores.push('La descripción es obligatoria.');
	if (!r.peso || r.peso <= 0) errores.push('El peso debe ser mayor a 0.');
	if (!r.cantidadBultos || r.cantidadBultos < 1) errores.push('Debe haber al menos 1 bulto.');
	if (!r.embalaje?.trim()) errores.push('El embalaje es obligatorio.');
	return errores;
}
