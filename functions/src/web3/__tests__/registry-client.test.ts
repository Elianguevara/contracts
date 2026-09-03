import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('firebase-functions', () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

vi.mock('../config', () => ({
	loadWeb3Config: vi.fn(() => ({
		rpcUrl: 'http://127.0.0.1:8545',
		relayerPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
		contractAddress: '0x0000000000000000000000000000000000000001',
		chainId: 31337,
		minBalanceEth: 0.05
	}))
}));

const acquireLock = vi.fn(async () => 'lock-1');
const releaseLock = vi.fn(async (_lockId: string) => undefined);
// Runs the callback immediately — the in-process queueing itself is covered
// by nonce-manager.test.ts, this suite only needs it to be a pass-through.
const enqueueInProcess = vi.fn(async (fn: () => Promise<unknown>) => fn());

vi.mock('../nonce-manager', () => ({
	acquireLock: () => acquireLock(),
	releaseLock: (lockId: string) => releaseLock(lockId),
	enqueueInProcess: (fn: () => Promise<unknown>) => enqueueInProcess(fn)
}));

let getTransactionCount: ReturnType<typeof vi.fn>;
let getBalance: ReturnType<typeof vi.fn>;
let registerDocument: ReturnType<typeof vi.fn>;
let attestCertificate: ReturnType<typeof vi.fn>;

vi.mock('ethers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ethers')>();

	const JsonRpcProvider = vi.fn().mockImplementation(() => ({
		getTransactionCount: (...args: unknown[]) => getTransactionCount(...args),
		getBalance: (...args: unknown[]) => getBalance(...args)
	}));
	const Wallet = vi.fn().mockImplementation(() => ({
		address: '0xRelayerAddress'
	}));
	const Contract = vi.fn().mockImplementation(() => ({
		registerDocument: (...args: unknown[]) => registerDocument(...args),
		attestCertificate: (...args: unknown[]) => attestCertificate(...args)
	}));

	// registry-client.ts does `import { ethers } from 'ethers'` and then
	// `new ethers.Wallet(...)` — that reads off the nested `ethers` namespace
	// object, a separate export from the top-level named exports. Both must
	// be overridden for the mock to actually take effect.
	return {
		...actual,
		JsonRpcProvider,
		Wallet,
		Contract,
		ethers: {
			...actual.ethers,
			JsonRpcProvider,
			Wallet,
			Contract
		}
	};
});

// Imported after mocks so the mocked modules are wired up first.
import { RegistryClient } from '../registry-client';

function txResolving(hash: string, blockNumber: number) {
	return { wait: vi.fn().mockResolvedValue({ hash, blockNumber }) };
}

beforeEach(() => {
	vi.useFakeTimers();
	getTransactionCount = vi.fn().mockResolvedValue(5);
	getBalance = vi.fn().mockResolvedValue(1_000_000_000_000_000_000n);
	registerDocument = vi.fn();
	attestCertificate = vi.fn();
	acquireLock.mockClear();
	releaseLock.mockClear();
	enqueueInProcess.mockClear();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('RegistryClient — basic accessors', () => {
	it('exposes the relayer address and balance', async () => {
		const client = new RegistryClient();

		expect(client.relayerAddress).toBe('0xRelayerAddress');
		await expect(client.getRelayerBalance()).resolves.toBe(1_000_000_000_000_000_000n);
	});
});

describe('RegistryClient.registerDocument — happy path', () => {
	it('acquires the lock, submits with the pending nonce, waits for confirmation, and releases the lock', async () => {
		registerDocument.mockResolvedValue(txResolving('0xhash1', 42));
		const client = new RegistryClient();

		const result = await client.registerDocument('SOL-1', '0xdeadbeef', 'MANIFIESTO_GENERADO');

		expect(result).toEqual({ txHash: '0xhash1', blockNumber: 42 });
		expect(acquireLock).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledWith('lock-1');
		expect(getTransactionCount).toHaveBeenCalledWith('0xRelayerAddress', 'pending');
		expect(registerDocument).toHaveBeenCalledWith('SOL-1', '0xdeadbeef', 'MANIFIESTO_GENERADO', {
			nonce: 5
		});
	});
});

describe('RegistryClient.attestCertificate — happy path', () => {
	it('calls the attestCertificate contract method with the pending nonce', async () => {
		attestCertificate.mockResolvedValue(txResolving('0xhash2', 43));
		const client = new RegistryClient();

		const result = await client.attestCertificate('CERT-1', '0xcafebabe');

		expect(result).toEqual({ txHash: '0xhash2', blockNumber: 43 });
		expect(attestCertificate).toHaveBeenCalledWith('CERT-1', '0xcafebabe', { nonce: 5 });
	});
});

describe('RegistryClient — nonce collision retries', () => {
	it('re-reads the nonce and retries within the same lock on a nonce collision', async () => {
		registerDocument
			.mockRejectedValueOnce(new Error('nonce too low'))
			.mockResolvedValueOnce(txResolving('0xhash3', 44));
		getTransactionCount.mockResolvedValueOnce(5).mockResolvedValueOnce(6);
		const client = new RegistryClient();

		const result = await client.registerDocument('SOL-2', '0xdead', 'MANIFIESTO_GENERADO');

		expect(result).toEqual({ txHash: '0xhash3', blockNumber: 44 });
		expect(registerDocument).toHaveBeenCalledTimes(2);
		// Lock is acquired once and held across the nonce retry.
		expect(acquireLock).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it('propagates the nonce error once retries are exhausted', async () => {
		registerDocument.mockRejectedValue(new Error('nonce too low'));
		const client = new RegistryClient();

		const promise = client.registerDocument('SOL-3', '0xdead', 'MANIFIESTO_GENERADO');
		promise.catch(() => {});

		await expect(promise).rejects.toThrow('nonce too low');
		// 1 initial attempt + MAX_NONCE_RETRIES(3) retries = 4 calls, all inside one lock.
		expect(registerDocument).toHaveBeenCalledTimes(4);
		expect(acquireLock).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});
});

describe('RegistryClient — gas/network transient retries', () => {
	it('retries with backoff on a transient network error and eventually succeeds', async () => {
		registerDocument
			.mockRejectedValueOnce(new Error('ETIMEDOUT'))
			.mockResolvedValueOnce(txResolving('0xhash4', 45));
		const client = new RegistryClient();

		const promise = client.registerDocument('SOL-4', '0xdead', 'MANIFIESTO_GENERADO');
		await vi.advanceTimersByTimeAsync(5_000);
		const result = await promise;

		expect(result).toEqual({ txHash: '0xhash4', blockNumber: 45 });
		expect(registerDocument).toHaveBeenCalledTimes(2);
		// Each outer (gas-retry) attempt re-acquires the lock.
		expect(acquireLock).toHaveBeenCalledTimes(2);
		expect(releaseLock).toHaveBeenCalledTimes(2);
	});

	it('propagates the transient error once MAX_GAS_RETRIES is exhausted', async () => {
		registerDocument.mockRejectedValue(new Error('ECONNRESET'));
		const client = new RegistryClient();

		const promise = client.registerDocument('SOL-5', '0xdead', 'MANIFIESTO_GENERADO');
		promise.catch(() => {});
		await vi.advanceTimersByTimeAsync(20_000);

		await expect(promise).rejects.toThrow('ECONNRESET');
		// 1 initial attempt + MAX_GAS_RETRIES(3) retries = 4 outer attempts.
		expect(registerDocument).toHaveBeenCalledTimes(4);
		expect(acquireLock).toHaveBeenCalledTimes(4);
		expect(releaseLock).toHaveBeenCalledTimes(4);
	});
});

describe('RegistryClient — permanent errors', () => {
	it('propagates a contract revert immediately without retrying', async () => {
		registerDocument.mockRejectedValue(new Error('execution reverted: AlreadyRegistered'));
		const client = new RegistryClient();

		await expect(
			client.registerDocument('SOL-6', '0xdead', 'MANIFIESTO_GENERADO')
		).rejects.toThrow('AlreadyRegistered');

		expect(registerDocument).toHaveBeenCalledTimes(1);
		expect(acquireLock).toHaveBeenCalledTimes(1);
		expect(releaseLock).toHaveBeenCalledTimes(1);
	});

	it('throws when the transaction receipt resolves to null', async () => {
		registerDocument.mockResolvedValue({ wait: vi.fn().mockResolvedValue(null) });
		const client = new RegistryClient();

		await expect(
			client.registerDocument('SOL-7', '0xdead', 'MANIFIESTO_GENERADO')
		).rejects.toThrow('Transaction receipt is null after wait()');
	});
});
