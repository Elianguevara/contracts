import { keccak256 } from 'js-sha3';

// --- Types (non-PII traceability payload) ---

export interface ResiduoPayload {
	codigoY: string;
	estado: string;
	peso: number;
	unidad: string;
	cantidadBultos: number;
	codigosDespacho: string[];
}

export interface ManifiestoPayload {
	requestId: string;
	estado: string;
	manifestoNumero: string;
	residuos: ResiduoPayload[];
	timestamp: number;
}

export interface CertificadoPayload {
	requestId: string;
	solicitudId: string;
	tipoCertificado: string;
	codigoOperacion: string;
	numeroCertificado: string;
	timestamp: number;
}

export type TraceabilityPayload = ManifiestoPayload | CertificadoPayload;

// --- Canonical serialization ---

/**
 * Recursively sorts object keys alphabetically, leaving arrays and
 * primitives untouched, so that JSON.stringify produces a stable string
 * regardless of insertion order.
 */
function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	if (value !== null && typeof value === 'object') {
		return Object.keys(value as Record<string, unknown>)
			.sort()
			.reduce<Record<string, unknown>>((acc, key) => {
				acc[key] = canonicalize((value as Record<string, unknown>)[key]);
				return acc;
			}, {});
	}
	return value;
}

/**
 * Returns the keccak256 hash (0x-prefixed hex) of the canonical JSON
 * representation of `payload`. Key ordering in objects is normalised so
 * that two semantically identical payloads always produce the same hash.
 */
export function canonicalHash(payload: unknown): string {
	const json = JSON.stringify(canonicalize(payload));
	return '0x' + keccak256(json);
}
