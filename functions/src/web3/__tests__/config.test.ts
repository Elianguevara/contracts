import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadWeb3Config } from '../config';

const ENV_KEYS = [
	'CHAIN_ID',
	'RELAYER_MIN_BALANCE_ETH',
	'RELAYER_PRIVATE_KEY',
	'WEB3_RPC_URL',
	'CONTRACT_ADDRESS',
	'FUNCTIONS_EMULATOR'
] as const;

const ANVIL_DEFAULT_PRIVATE_KEY =
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ANVIL_DEFAULT_RPC_URL = 'http://127.0.0.1:8545';

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
	originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
	for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
	for (const k of ENV_KEYS) {
		if (originalEnv[k] === undefined) delete process.env[k];
		else process.env[k] = originalEnv[k];
	}
});

function setBaseValidEnv() {
	process.env['CHAIN_ID'] = '31337';
	process.env['CONTRACT_ADDRESS'] = '0x0000000000000000000000000000000000000001';
}

describe('loadWeb3Config — non-sensitive validation', () => {
	it('throws when CHAIN_ID is missing', () => {
		process.env['CONTRACT_ADDRESS'] = '0x01';
		expect(() => loadWeb3Config()).toThrow('Missing required environment variable: CHAIN_ID');
	});

	it('throws when CHAIN_ID is not a positive integer', () => {
		process.env['CONTRACT_ADDRESS'] = '0x01';
		process.env['CHAIN_ID'] = '0';
		expect(() => loadWeb3Config()).toThrow('CHAIN_ID must be a positive integer');
	});

	it('throws when CHAIN_ID is not numeric', () => {
		process.env['CONTRACT_ADDRESS'] = '0x01';
		process.env['CHAIN_ID'] = 'not-a-number';
		expect(() => loadWeb3Config()).toThrow('CHAIN_ID must be a positive integer');
	});

	it('throws when CONTRACT_ADDRESS is missing', () => {
		process.env['CHAIN_ID'] = '31337';
		process.env['FUNCTIONS_EMULATOR'] = 'true';
		expect(() => loadWeb3Config()).toThrow(
			'Missing required environment variable: CONTRACT_ADDRESS'
		);
	});

	it('defaults RELAYER_MIN_BALANCE_ETH to 0.05 when unset', () => {
		setBaseValidEnv();
		process.env['FUNCTIONS_EMULATOR'] = 'true';
		const cfg = loadWeb3Config();
		expect(cfg.minBalanceEth).toBe(0.05);
	});

	it('throws when RELAYER_MIN_BALANCE_ETH is negative', () => {
		setBaseValidEnv();
		process.env['RELAYER_MIN_BALANCE_ETH'] = '-1';
		expect(() => loadWeb3Config()).toThrow(
			'RELAYER_MIN_BALANCE_ETH must be a non-negative number'
		);
	});

	it('throws when RELAYER_MIN_BALANCE_ETH is not numeric', () => {
		setBaseValidEnv();
		process.env['RELAYER_MIN_BALANCE_ETH'] = 'lots';
		expect(() => loadWeb3Config()).toThrow(
			'RELAYER_MIN_BALANCE_ETH must be a non-negative number'
		);
	});
});

describe('loadWeb3Config — secret resolution in emulator mode', () => {
	it('falls back to the well-known Anvil test account when nothing is configured', () => {
		setBaseValidEnv();
		process.env['FUNCTIONS_EMULATOR'] = 'true';

		const cfg = loadWeb3Config();

		expect(cfg.relayerPrivateKey).toBe(ANVIL_DEFAULT_PRIVATE_KEY);
		expect(cfg.rpcUrl).toBe(ANVIL_DEFAULT_RPC_URL);
	});

	it('prefers explicit env vars over the Anvil defaults', () => {
		setBaseValidEnv();
		process.env['FUNCTIONS_EMULATOR'] = 'true';
		process.env['RELAYER_PRIVATE_KEY'] = '0xcustomkey';
		process.env['WEB3_RPC_URL'] = 'http://localhost:9999';

		const cfg = loadWeb3Config();

		expect(cfg.relayerPrivateKey).toBe('0xcustomkey');
		expect(cfg.rpcUrl).toBe('http://localhost:9999');
	});
});

describe('loadWeb3Config — secret resolution outside the emulator', () => {
	it('throws when RELAYER_PRIVATE_KEY is not configured (no Secret Manager value in this process)', () => {
		setBaseValidEnv();
		// FUNCTIONS_EMULATOR left unset — production-like path.
		expect(() => loadWeb3Config()).toThrow(/Secret 'RELAYER_PRIVATE_KEY' is not set/);
	});

	it('uses the configured secret value when present', () => {
		setBaseValidEnv();
		process.env['RELAYER_PRIVATE_KEY'] = '0xprodkey';
		process.env['WEB3_RPC_URL'] = 'https://sepolia.example.com';

		const cfg = loadWeb3Config();

		expect(cfg.relayerPrivateKey).toBe('0xprodkey');
		expect(cfg.rpcUrl).toBe('https://sepolia.example.com');
		expect(cfg.contractAddress).toBe('0x0000000000000000000000000000000000000001');
		expect(cfg.chainId).toBe(31337);
	});

	it('throws when WEB3_RPC_URL is not configured even if the private key is set', () => {
		setBaseValidEnv();
		process.env['RELAYER_PRIVATE_KEY'] = '0xprodkey';
		expect(() => loadWeb3Config()).toThrow(/Secret 'WEB3_RPC_URL' is not set/);
	});
});
