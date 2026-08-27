/**
 * config.ts — Web3 configuration with Firebase Secret Manager integration.
 *
 * SECRET MANAGEMENT STRATEGY
 * --------------------------
 * Sensitive values (private key, RPC URL) are declared as Firebase Secrets via
 * `defineSecret`. In production (Google Cloud Run / Cloud Functions), Secret
 * Manager injects the values into the function's environment at startup.
 * Each function that needs them must declare them in its `secrets` array.
 *
 * EMULATOR FALLBACK
 * -----------------
 * When FUNCTIONS_EMULATOR === 'true', the Firebase emulator does not integrate
 * with Secret Manager. We fall back to plain environment variables, which can
 * be set in `functions/.env.local` or exported in the shell. If those are also
 * absent in emulator mode, we use the well-known Anvil default test account so
 * local development works out of the box with zero configuration.
 *
 * NON-SENSITIVE VALUES
 * --------------------
 * CONTRACT_ADDRESS, CHAIN_ID, and RELAYER_MIN_BALANCE_ETH are not secrets and
 * are read directly from process.env (set via `firebase functions:config:set`
 * or environment variables in the deployment environment).
 */

import { defineSecret } from 'firebase-functions/params';

// ---------------------------------------------------------------------------
// Secret declarations — exported so index.ts can pass them to function options.
// ---------------------------------------------------------------------------

/**
 * Private key of the relayer wallet (0x-prefixed, 64 hex chars).
 * Stored in Google Cloud Secret Manager under the name RELAYER_PRIVATE_KEY.
 */
export const relayerPrivateKeySecret = defineSecret('RELAYER_PRIVATE_KEY');

/**
 * JSON-RPC endpoint URL for the target EVM network.
 * Stored in Google Cloud Secret Manager under the name WEB3_RPC_URL.
 */
export const web3RpcUrlSecret = defineSecret('WEB3_RPC_URL');

// ---------------------------------------------------------------------------
// Anvil default test account (first account, well-known, no real funds)
// ---------------------------------------------------------------------------

const ANVIL_DEFAULT_PRIVATE_KEY =
	'0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ANVIL_DEFAULT_RPC_URL = 'http://127.0.0.1:8545';

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

export interface Web3Config {
	rpcUrl: string;
	relayerPrivateKey: string;
	contractAddress: string;
	chainId: number;
	/** Minimum relayer balance in ETH before alerts are raised. Default: 0.05. */
	minBalanceEth: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
	const value = process.env[key];
	if (!value) throw new Error(`Missing required environment variable: ${key}`);
	return value;
}

const isEmulator = (): boolean => process.env['FUNCTIONS_EMULATOR'] === 'true';

/**
 * Reads a value that may come from either a Firebase Secret (production) or a
 * plain environment variable (emulator fallback), with an optional hardcoded
 * default for local development.
 *
 * Resolution order:
 *  1. Firebase Secret value (`.value()`) — always attempted first.
 *     In production this is always populated; in emulator it throws or is empty.
 *  2. Plain env var (`process.env[envKey]`) — used when the secret is empty.
 *  3. `devDefault` — only used when running in the emulator and neither 1 nor 2
 *     is available. Never used in production (would throw instead).
 */
function resolveSecret(secretValue: string, envKey: string, devDefault?: string): string {
	// Secret Manager injected a value — always prefer it.
	if (secretValue) return secretValue;

	// Emulator: fall back to env var, then hardcoded dev default.
	if (isEmulator()) {
		return process.env[envKey] ?? devDefault ?? '';
	}

	// Production with missing secret — hard fail.
	throw new Error(
		`Secret '${envKey}' is not set. ` +
			`Ensure the secret exists in Google Cloud Secret Manager and the function ` +
			`declares it in its 'secrets' option array.`
	);
}

// ---------------------------------------------------------------------------
// Public loader
// ---------------------------------------------------------------------------

/**
 * Reads and validates all Web3 configuration values at Cloud Function runtime.
 *
 * MUST be called inside a Cloud Function handler (not at module load time)
 * because `SecretParam.value()` throws during deployment/build if called outside
 * a running function context.
 *
 * Non-sensitive env vars (read directly from process.env):
 *   CONTRACT_ADDRESS        — deployed EcoTraceRegistry address (0x-prefixed)
 *   CHAIN_ID                — EVM chain ID as decimal integer string
 *   RELAYER_MIN_BALANCE_ETH — alert threshold in ETH (default: "0.05")
 *
 * Sensitive values (via Secret Manager, with emulator fallback):
 *   RELAYER_PRIVATE_KEY     → relayerPrivateKeySecret
 *   WEB3_RPC_URL            → web3RpcUrlSecret
 */
export function loadWeb3Config(): Web3Config {
	const chainId = parseInt(requireEnv('CHAIN_ID'), 10);
	if (isNaN(chainId) || chainId <= 0) {
		throw new Error('CHAIN_ID must be a positive integer');
	}

	const rawMinBalance = process.env['RELAYER_MIN_BALANCE_ETH'] ?? '0.05';
	const minBalanceEth = parseFloat(rawMinBalance);
	if (isNaN(minBalanceEth) || minBalanceEth < 0) {
		throw new Error('RELAYER_MIN_BALANCE_ETH must be a non-negative number');
	}

	const relayerPrivateKey = resolveSecret(
		relayerPrivateKeySecret.value(),
		'RELAYER_PRIVATE_KEY',
		ANVIL_DEFAULT_PRIVATE_KEY
	);

	const rpcUrl = resolveSecret(web3RpcUrlSecret.value(), 'WEB3_RPC_URL', ANVIL_DEFAULT_RPC_URL);

	if (!relayerPrivateKey) {
		throw new Error('RELAYER_PRIVATE_KEY is not configured');
	}
	if (!rpcUrl) {
		throw new Error('WEB3_RPC_URL is not configured');
	}

	return {
		rpcUrl,
		relayerPrivateKey,
		contractAddress: requireEnv('CONTRACT_ADDRESS'),
		chainId,
		minBalanceEth
	};
}
