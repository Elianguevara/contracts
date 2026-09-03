import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DocumentReference } from 'firebase-admin/firestore';

vi.mock('firebase-functions', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

const registerDocument = vi.fn();
const attestCertificate = vi.fn();

vi.mock('../registry-client', () => ({
	RegistryClient: vi.fn().mockImplementation(() => ({
		relayerAddress: '0xRelayer',
		getRelayerBalance: vi.fn(),
		registerDocument: (...args: unknown[]) => registerDocument(...args),
		attestCertificate: (...args: unknown[]) => attestCertificate(...args)
	}))
}));

const checkRelayerBalance = vi.fn();

vi.mock('../monitoring', () => ({
	checkRelayerBalance: (...args: unknown[]) => checkRelayerBalance(...args)
}));

import { anchorManifiesto, anchorCertificado } from '../relayer';

function fakeRef() {
	return { update: vi.fn().mockResolvedValue(undefined) } as unknown as DocumentReference & {
		update: ReturnType<typeof vi.fn>;
	};
}

beforeEach(() => {
	registerDocument.mockReset();
	attestCertificate.mockReset();
	checkRelayerBalance.mockReset().mockResolvedValue({
		address: '0xRelayer',
		balanceEth: '1.0',
		belowThreshold: false,
		lowWarning: false
	});
});

describe('anchorManifiesto — happy path', () => {
	it('writes pending then confirmed with the tx result', async () => {
		registerDocument.mockResolvedValue({ txHash: '0xabc', blockNumber: 10 });
		const ref = fakeRef();

		await anchorManifiesto(ref, 'SOL-1', '0xhash');

		expect(ref.update).toHaveBeenNthCalledWith(1, {
			blockchainAnchor: {
				status: 'pending',
				documentHash: '0xhash',
				network: expect.any(String),
				timestamp: expect.any(Number)
			}
		});
		expect(ref.update).toHaveBeenNthCalledWith(2, {
			'blockchainAnchor.status': 'confirmed',
			'blockchainAnchor.txHash': '0xabc',
			'blockchainAnchor.blockNumber': 10
		});
		expect(registerDocument).toHaveBeenCalledWith('SOL-1', '0xhash', 'MANIFIESTO_GENERADO');
	});
});

describe('anchorManifiesto — balance guard', () => {
	it('aborts before calling the contract when the relayer balance is below threshold', async () => {
		checkRelayerBalance.mockResolvedValue({
			address: '0xRelayer',
			balanceEth: '0.001',
			belowThreshold: true,
			lowWarning: false
		});
		const ref = fakeRef();

		await anchorManifiesto(ref, 'SOL-2', '0xhash');

		expect(registerDocument).not.toHaveBeenCalled();
		expect(ref.update).toHaveBeenNthCalledWith(2, {
			'blockchainAnchor.status': 'failed',
			'blockchainAnchor.errorMessage': expect.stringContaining('insuficiente'),
			'blockchainAnchor.lastAttemptAt': expect.any(Number)
		});
	});

	it('proceeds with the anchor attempt when the balance check itself fails (e.g. RPC down)', async () => {
		checkRelayerBalance.mockRejectedValue(new Error('RPC unreachable'));
		registerDocument.mockResolvedValue({ txHash: '0xdef', blockNumber: 11 });
		const ref = fakeRef();

		await anchorManifiesto(ref, 'SOL-3', '0xhash');

		expect(registerDocument).toHaveBeenCalledTimes(1);
		expect(ref.update).toHaveBeenNthCalledWith(2, {
			'blockchainAnchor.status': 'confirmed',
			'blockchainAnchor.txHash': '0xdef',
			'blockchainAnchor.blockNumber': 11
		});
	});
});

describe('anchorManifiesto — error handling', () => {
	it('treats AlreadyRegistered as a successful (idempotent) confirmation', async () => {
		registerDocument.mockRejectedValue(new Error('execution reverted: AlreadyRegistered(0xhash)'));
		const ref = fakeRef();

		await anchorManifiesto(ref, 'SOL-4', '0xhash');

		expect(ref.update).toHaveBeenNthCalledWith(2, { 'blockchainAnchor.status': 'confirmed' });
	});

	it('writes a failed status with the error message on a permanent failure', async () => {
		registerDocument.mockRejectedValue(new Error('execution reverted: NotAuthorized'));
		const ref = fakeRef();

		await anchorManifiesto(ref, 'SOL-5', '0xhash');

		expect(ref.update).toHaveBeenNthCalledWith(2, {
			'blockchainAnchor.status': 'failed',
			'blockchainAnchor.errorMessage': expect.stringContaining('NotAuthorized'),
			'blockchainAnchor.lastAttemptAt': expect.any(Number)
		});
	});

	it('does not throw when both the anchor attempt and the failed-status write fail', async () => {
		registerDocument.mockRejectedValue(new Error('execution reverted: NotAuthorized'));
		const ref = fakeRef();
		ref.update.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Firestore down'));

		await expect(anchorManifiesto(ref, 'SOL-6', '0xhash')).resolves.toBeUndefined();
	});

	it('stringifies a non-Error rejection as the failure message', async () => {
		// Some libraries reject with a plain string/object instead of an Error.
		registerDocument.mockRejectedValue('raw string failure');
		const ref = fakeRef();

		await anchorManifiesto(ref, 'SOL-6b', '0xhash');

		expect(ref.update).toHaveBeenNthCalledWith(2, {
			'blockchainAnchor.status': 'failed',
			'blockchainAnchor.errorMessage': 'raw string failure',
			'blockchainAnchor.lastAttemptAt': expect.any(Number)
		});
	});

	it('returns early without attempting the anchor when the initial pending write fails', async () => {
		const ref = fakeRef();
		ref.update.mockRejectedValueOnce(new Error('Firestore down'));

		await anchorManifiesto(ref, 'SOL-7', '0xhash');

		expect(checkRelayerBalance).not.toHaveBeenCalled();
		expect(registerDocument).not.toHaveBeenCalled();
		expect(ref.update).toHaveBeenCalledTimes(1);
	});
});

describe('anchorCertificado', () => {
	it('happy path calls attestCertificate with the cert id and writes confirmed status', async () => {
		attestCertificate.mockResolvedValue({ txHash: '0xcert', blockNumber: 20 });
		const ref = fakeRef();

		await anchorCertificado(ref, 'SOL-8', 'CERT-1', '0xhash2');

		expect(attestCertificate).toHaveBeenCalledWith('CERT-1', '0xhash2');
		expect(ref.update).toHaveBeenNthCalledWith(2, {
			'blockchainAnchor.status': 'confirmed',
			'blockchainAnchor.txHash': '0xcert',
			'blockchainAnchor.blockNumber': 20
		});
	});

	it('aborts on insufficient balance without calling attestCertificate', async () => {
		checkRelayerBalance.mockResolvedValue({
			address: '0xRelayer',
			balanceEth: '0.001',
			belowThreshold: true,
			lowWarning: false
		});
		const ref = fakeRef();

		await anchorCertificado(ref, 'SOL-9', 'CERT-2', '0xhash2');

		expect(attestCertificate).not.toHaveBeenCalled();
		expect(ref.update).toHaveBeenNthCalledWith(2, {
			'blockchainAnchor.status': 'failed',
			'blockchainAnchor.errorMessage': expect.stringContaining('insuficiente'),
			'blockchainAnchor.lastAttemptAt': expect.any(Number)
		});
	});

	it('treats AlreadyRegistered as idempotent confirmation', async () => {
		attestCertificate.mockRejectedValue(new Error('execution reverted: AlreadyRegistered(0xhash2)'));
		const ref = fakeRef();

		await anchorCertificado(ref, 'SOL-10', 'CERT-3', '0xhash2');

		expect(ref.update).toHaveBeenNthCalledWith(2, { 'blockchainAnchor.status': 'confirmed' });
	});

	it('writes a failed status with the error message on a permanent failure', async () => {
		attestCertificate.mockRejectedValue(new Error('execution reverted: NotAuthorized'));
		const ref = fakeRef();

		await anchorCertificado(ref, 'SOL-11', 'CERT-4', '0xhash2');

		expect(ref.update).toHaveBeenNthCalledWith(2, {
			'blockchainAnchor.status': 'failed',
			'blockchainAnchor.errorMessage': expect.stringContaining('NotAuthorized'),
			'blockchainAnchor.lastAttemptAt': expect.any(Number)
		});
	});

	it('does not throw when both the anchor attempt and the failed-status write fail', async () => {
		attestCertificate.mockRejectedValue(new Error('execution reverted: NotAuthorized'));
		const ref = fakeRef();
		ref.update.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Firestore down'));

		await expect(anchorCertificado(ref, 'SOL-12', 'CERT-5', '0xhash2')).resolves.toBeUndefined();
	});

	it('returns early without attempting the anchor when the initial pending write fails', async () => {
		const ref = fakeRef();
		ref.update.mockRejectedValueOnce(new Error('Firestore down'));

		await anchorCertificado(ref, 'SOL-13', 'CERT-6', '0xhash2');

		expect(checkRelayerBalance).not.toHaveBeenCalled();
		expect(attestCertificate).not.toHaveBeenCalled();
		expect(ref.update).toHaveBeenCalledTimes(1);
	});
});
