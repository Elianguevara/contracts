import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

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

let standaloneGetBalance: ReturnType<typeof vi.fn>;

vi.mock('ethers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ethers')>();

	const Wallet = vi.fn().mockImplementation(() => ({ address: '0xStandaloneAddress' }));
	const JsonRpcProvider = vi.fn().mockImplementation(() => ({
		getBalance: (...args: unknown[]) => standaloneGetBalance(...args)
	}));

	return {
		...actual,
		Wallet,
		JsonRpcProvider,
		ethers: { ...actual.ethers, Wallet, JsonRpcProvider }
	};
});

import { checkRelayerBalance } from '../monitoring';
import type { RegistryClient } from '../registry-client';

function fakeClient(address: string, balance: bigint): RegistryClient {
	return {
		relayerAddress: address,
		getRelayerBalance: vi.fn().mockResolvedValue(balance)
	} as unknown as RegistryClient;
}

beforeEach(() => {
	standaloneGetBalance = vi.fn();
});

describe('checkRelayerBalance — with an existing RegistryClient', () => {
	it('reports a healthy balance (>= 2x threshold)', async () => {
		const client = fakeClient('0xAbc', ethers.parseEther('1'));

		const status = await checkRelayerBalance(client);

		expect(status).toEqual({
			address: '0xAbc',
			balanceEth: '1.0',
			belowThreshold: false,
			lowWarning: false
		});
	});

	it('reports lowWarning when balance is between the threshold and 2x threshold', async () => {
		// threshold = 0.05 ETH, so 0.06 is >= threshold but < 2x threshold (0.1).
		const client = fakeClient('0xAbc', ethers.parseEther('0.06'));

		const status = await checkRelayerBalance(client);

		expect(status.belowThreshold).toBe(false);
		expect(status.lowWarning).toBe(true);
	});

	it('reports belowThreshold when balance is under the minimum', async () => {
		const client = fakeClient('0xAbc', ethers.parseEther('0.01'));

		const status = await checkRelayerBalance(client);

		expect(status.belowThreshold).toBe(true);
		expect(status.lowWarning).toBe(false);
	});

	it('treats a balance exactly at the threshold as healthy, not below', async () => {
		const client = fakeClient('0xAbc', ethers.parseEther('0.05'));

		const status = await checkRelayerBalance(client);

		expect(status.belowThreshold).toBe(false);
		expect(status.lowWarning).toBe(true);
	});
});

describe('checkRelayerBalance — standalone (no client)', () => {
	it('derives the address from the private key and queries balance via its own provider', async () => {
		standaloneGetBalance.mockResolvedValue(ethers.parseEther('2'));

		const status = await checkRelayerBalance();

		expect(status.address).toBe('0xStandaloneAddress');
		expect(status.balanceEth).toBe('2.0');
		expect(status.belowThreshold).toBe(false);
	});
});
