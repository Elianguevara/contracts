/**
 * registry-client.ts — Ethers v6 wrapper around EcoTraceRegistry.
 *
 * CONCURRENCY MODEL
 * -----------------
 * Transaction submission is serialised through two complementary layers:
 *
 *  Layer 1 — in-process queue (enqueueInProcess from nonce-manager):
 *    Prevents concurrent invocations within the same warm instance from all
 *    racing to acquire the Firestore lock simultaneously.
 *
 *  Layer 2 — Firestore distributed lock (acquireLock / releaseLock):
 *    Prevents concurrent invocations across *different* instances from
 *    submitting transactions with the same nonce.
 *
 * RETRY STRATEGY
 * --------------
 * Two distinct retry buckets:
 *
 *  a) Nonce errors ("nonce too low", "replacement underpriced", etc.):
 *     The lock should prevent these, but as a safety net we retry immediately
 *     after re-reading the pending nonce from the chain.
 *
 *  b) Gas / network transient errors ("underpriced", "base fee exceeded",
 *     RPC timeouts, connection resets):
 *     Retried with exponential backoff (1 s → 2 s → 4 s) so we give the
 *     network time to stabilise between attempts.
 *
 * Hard limits: MAX_NONCE_RETRIES = 3, MAX_GAS_RETRIES = 3.
 * An error that does not match either category is propagated immediately.
 */

import { ethers } from 'ethers';
import { logger } from 'firebase-functions';
import { loadWeb3Config } from './config';
import { enqueueInProcess, acquireLock, releaseLock } from './nonce-manager';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_NONCE_RETRIES = 3;
const MAX_GAS_RETRIES = 3;

// Minimal ABI — only the functions and errors used by the relayer.
const ABI = [
	'function registerDocument(string requestId, bytes32 documentHash, string eventType) external',
	'function attestCertificate(string requestId, bytes32 documentHash) external',
	'error AlreadyRegistered(bytes32 documentHash)',
	'error EmptyRequestId()',
	'error ZeroHash()'
] as const;

// ---------------------------------------------------------------------------
// Error classifiers
// ---------------------------------------------------------------------------

function isNonceError(err: unknown): boolean {
	const msg = String(err).toLowerCase();
	return (
		msg.includes('nonce too low') ||
		msg.includes('replacement transaction underpriced') ||
		msg.includes('already known') ||
		msg.includes('nonce has already been used')
	);
}

function isGasOrNetworkError(err: unknown): boolean {
	const msg = String(err).toLowerCase();
	return (
		msg.includes('max fee per gas less than block base fee') ||
		msg.includes('transaction underpriced') ||
		msg.includes('gas price too low') ||
		msg.includes('intrinsic gas too low') ||
		msg.includes('timeout') ||
		msg.includes('econnreset') ||
		msg.includes('econnrefused') ||
		msg.includes('network error') ||
		msg.includes('server error') ||
		msg.includes('etimedout')
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AnchorResult {
	txHash: string;
	blockNumber: number;
}

// ---------------------------------------------------------------------------
// RegistryClient
// ---------------------------------------------------------------------------

export class RegistryClient {
	readonly provider: ethers.JsonRpcProvider;
	readonly wallet: ethers.Wallet;
	private readonly contract: ethers.Contract;

	constructor() {
		const cfg = loadWeb3Config();
		this.provider = new ethers.JsonRpcProvider(cfg.rpcUrl);
		this.wallet = new ethers.Wallet(cfg.relayerPrivateKey, this.provider);
		this.contract = new ethers.Contract(cfg.contractAddress, ABI, this.wallet);
	}

	/** Returns the relayer wallet address (checksummed). */
	get relayerAddress(): string {
		return this.wallet.address;
	}

	/** Returns the relayer's current ETH balance in wei. */
	async getRelayerBalance(): Promise<bigint> {
		return this.provider.getBalance(this.wallet.address);
	}

	// -------------------------------------------------------------------------
	// Core send logic
	// -------------------------------------------------------------------------

	/**
	 * Submits a single contract transaction with full serialisation and retry.
	 *
	 * Execution order:
	 *  1. Enqueue in the in-process queue (Layer 1).
	 *  2. Acquire the Firestore distributed lock (Layer 2).
	 *  3. Read the pending nonce from the chain.
	 *  4. Build and submit the transaction with the explicit nonce.
	 *  5. Wait for 1 confirmation.
	 *  6. Release the lock.
	 *
	 * On nonce collision → re-read nonce, retry immediately (up to MAX_NONCE_RETRIES).
	 * On gas/network error → wait with exponential backoff, retry (up to MAX_GAS_RETRIES).
	 * On any other error → release lock and propagate immediately.
	 */
	private sendTx(
		buildTx: (nonce: number) => Promise<ethers.ContractTransactionResponse>
	): Promise<AnchorResult> {
		return enqueueInProcess(async () => {
			// ---- Outer loop: gas / network transient retries ----
			for (let gasAttempt = 0; gasAttempt <= MAX_GAS_RETRIES; gasAttempt++) {
				if (gasAttempt > 0) {
					const backoffMs = 1_000 * Math.pow(2, gasAttempt - 1); // 1 s, 2 s, 4 s
					const jitter = Math.random() * 300;
					logger.warn('[RegistryClient] Reintentando por error de gas/red', {
						gasAttempt,
						backoffMs: Math.round(backoffMs + jitter)
					});
					await sleep(backoffMs + jitter);
				}

				let lockId: string | null = null;
				try {
					// Acquire distributed lock before reading the nonce.
					lockId = await acquireLock();

					// ---- Inner loop: nonce collision retries ----
					for (let nonceAttempt = 0; nonceAttempt <= MAX_NONCE_RETRIES; nonceAttempt++) {
						const nonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');

						try {
							const tx = await buildTx(nonce);
							// Release the lock as soon as the tx is in the mempool,
							// so the next waiter can proceed without holding the lock
							// for the entire confirmation window.
							// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
							await releaseLock(lockId!);
							lockId = null;

							const receipt = await tx.wait(1);
							if (!receipt) throw new Error('Transaction receipt is null after wait()');
							return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
						} catch (err: unknown) {
							if (isNonceError(err) && nonceAttempt < MAX_NONCE_RETRIES) {
								logger.warn('[RegistryClient] Colisión de nonce detectada, reintentando', {
									nonceAttempt: nonceAttempt + 1,
									nonce,
									err: String(err)
								});
								// Stay within the lock — re-read nonce on next inner iteration.
								continue;
							}
							// Not a nonce error, or retries exhausted: release lock and re-throw
							// so the outer loop or the caller can handle it.
							throw err;
						}
					}
					throw new Error('[RegistryClient] Max nonce retries exceeded');
				} catch (err: unknown) {
					// Ensure lock is released even if an unexpected error occurs.
					if (lockId) {
						await releaseLock(lockId);
						lockId = null;
					}

					// If it's a transient gas/network error and we have retries left,
					// continue the outer loop.
					if (isGasOrNetworkError(err) && gasAttempt < MAX_GAS_RETRIES) {
						logger.warn('[RegistryClient] Error transitorio de gas/red', {
							gasAttempt,
							maxGasRetries: MAX_GAS_RETRIES,
							err: String(err)
						});
						continue; // outer loop will back off
					}

					// Permanent error (contract revert, auth error, etc.) — propagate.
					throw err;
				}
			}

			// Unreachable — TypeScript requires a return path.
			throw new Error('[RegistryClient] sendTx: estado inalcanzable');
		});
	}

	// -------------------------------------------------------------------------
	// Contract methods
	// -------------------------------------------------------------------------

	/**
	 * Calls `registerDocument` on EcoTraceRegistry and waits for 1 confirmation.
	 *
	 * @param requestId    Firestore document ID (on-chain requestId).
	 * @param documentHash 0x-prefixed keccak256 canonical hash (bytes32).
	 * @param eventType    Event label stored in the on-chain event.
	 */
	async registerDocument(
		requestId: string,
		documentHash: string,
		eventType: string
	): Promise<AnchorResult> {
		return this.sendTx((nonce) =>
			this.contract.registerDocument(requestId, documentHash, eventType, { nonce })
		);
	}

	/**
	 * Calls `attestCertificate` on EcoTraceRegistry and waits for 1 confirmation.
	 *
	 * @param requestId    Certificate identifier (on-chain requestId).
	 * @param documentHash 0x-prefixed keccak256 canonical hash (bytes32).
	 */
	async attestCertificate(requestId: string, documentHash: string): Promise<AnchorResult> {
		return this.sendTx((nonce) =>
			this.contract.attestCertificate(requestId, documentHash, { nonce })
		);
	}
}
