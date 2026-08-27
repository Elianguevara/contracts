import { describe, it, expect } from 'vitest';
import { canonicalHash, type ManifiestoPayload } from '../hashing';

// --- Test 1: Key ordering does not affect the hash ---

describe('canonicalHash – key ordering invariance', () => {
	it('produces identical hashes for objects with the same data in different property orders', () => {
		const a = { estado: 'FINALIZADA', requestId: 'SOL-001', timestamp: 1000 };
		const b = { timestamp: 1000, requestId: 'SOL-001', estado: 'FINALIZADA' };

		expect(canonicalHash(a)).toBe(canonicalHash(b));
	});

	it('produces identical hashes when nested object keys are in different orders', () => {
		const a = {
			requestId: 'SOL-001',
			residuo: { peso: 10, codigoY: 'Y12', unidad: 'kg' }
		};
		const b = {
			residuo: { unidad: 'kg', codigoY: 'Y12', peso: 10 },
			requestId: 'SOL-001'
		};

		expect(canonicalHash(a)).toBe(canonicalHash(b));
	});
});

// --- Test 2: Any mutation produces a different hash ---

describe('canonicalHash – mutation sensitivity', () => {
	const base: ManifiestoPayload = {
		requestId: 'SOL-2026-0001',
		estado: 'MANIFIESTO_GENERADO',
		manifestoNumero: 'M-001',
		timestamp: 1_700_000_000,
		residuos: [
			{
				codigoY: 'Y12',
				estado: 'SOLIDO',
				peso: 50,
				unidad: 'kg',
				cantidadBultos: 2,
				codigosDespacho: ['D1']
			}
		]
	};

	it('changes hash when a top-level value changes', () => {
		const mutated = { ...base, estado: 'FINALIZADA' };
		expect(canonicalHash(base)).not.toBe(canonicalHash(mutated));
	});

	it('changes hash when a top-level key is added', () => {
		const mutated = { ...base, extra: 'field' };
		expect(canonicalHash(base)).not.toBe(canonicalHash(mutated));
	});

	it('changes hash when a nested value changes', () => {
		const mutated = {
			...base,
			residuos: [{ ...base.residuos[0], peso: 99 }]
		};
		expect(canonicalHash(base)).not.toBe(canonicalHash(mutated));
	});

	it('changes hash when manifestoNumero changes', () => {
		const mutated = { ...base, manifestoNumero: 'M-002' };
		expect(canonicalHash(base)).not.toBe(canonicalHash(mutated));
	});
});

// --- Test 3: Nested objects and arrays ---

describe('canonicalHash – nested structures', () => {
	it('handles deeply nested objects deterministically', () => {
		const a = { outer: { inner: { value: 42, label: 'x' } } };
		const b = { outer: { inner: { label: 'x', value: 42 } } };

		expect(canonicalHash(a)).toBe(canonicalHash(b));
	});

	it('preserves array element order (different order → different hash)', () => {
		const a = { items: [1, 2, 3] };
		const b = { items: [3, 2, 1] };

		expect(canonicalHash(a)).not.toBe(canonicalHash(b));
	});

	it('handles arrays of objects by sorting their keys', () => {
		const a = {
			residuos: [
				{ peso: 10, codigoY: 'Y1' },
				{ peso: 20, codigoY: 'Y2' }
			]
		};
		const b = {
			residuos: [
				{ codigoY: 'Y1', peso: 10 },
				{ codigoY: 'Y2', peso: 20 }
			]
		};

		expect(canonicalHash(a)).toBe(canonicalHash(b));
	});

	it('returns a 0x-prefixed 64-character hex string', () => {
		const hash = canonicalHash({ requestId: 'test' });

		expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
	});

	it('handles primitive payloads (string, number, null)', () => {
		expect(canonicalHash('hello')).toBe(canonicalHash('hello'));
		expect(canonicalHash(42)).toBe(canonicalHash(42));
		expect(canonicalHash(null)).toBe(canonicalHash(null));
		expect(canonicalHash('hello')).not.toBe(canonicalHash('world'));
	});
});
