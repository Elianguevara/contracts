import { logger } from 'firebase-functions';
import type { DocumentReference } from 'firebase-admin/firestore';
import { RegistryClient } from './registry-client';
import { checkRelayerBalance } from './monitoring';

// ---------------------------------------------------------------------------
// Singleton client — reused across warm Cloud Function invocations.
//
// The client is created lazily on first use so that the constructor
// (which calls loadWeb3Config) only runs when env vars are available.
// In emulator mode the client may not be initialised at all if anchoring
// is disabled via FUNCTIONS_EMULATOR — see config.ts.
// ---------------------------------------------------------------------------

let _client: RegistryClient | null = null;

function getClient(): RegistryClient {
	if (!_client) _client = new RegistryClient();
	return _client;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when the contract reverted with AlreadyRegistered. */
function isAlreadyRegistered(err: unknown): boolean {
	return String(err).includes('AlreadyRegistered');
}

/** Extracts a human-readable error message from any thrown value. */
function toErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return String(err);
}

/**
 * Builds the Firestore update payload for a failed anchor attempt.
 * Written as a flat dotted-path object so partial updates don't clobber
 * already-present fields (e.g. documentHash written in the pending step).
 */
function failedAnchorFields(err: unknown) {
	return {
		'blockchainAnchor.status': 'failed',
		'blockchainAnchor.errorMessage': toErrorMessage(err),
		'blockchainAnchor.lastAttemptAt': Date.now()
	} as const;
}

// ---------------------------------------------------------------------------
// Pre-flight balance check
// ---------------------------------------------------------------------------

/**
 * Checks the relayer wallet balance before submitting a transaction.
 * Returns `false` and writes FAILED to Firestore when the balance is critical,
 * preventing a doomed transaction from wasting gas or blocking the queue.
 */
async function passesBalanceCheck(ref: DocumentReference, label: string): Promise<boolean> {
	try {
		const status = await checkRelayerBalance(getClient());
		if (status.belowThreshold) {
			const errMsg = `Saldo del relayer insuficiente: ${status.balanceEth} ETH (mínimo requerido configurado)`;
			logger.error(`[Relayer] ${label} abortado — ${errMsg}`);
			await ref.update({
				...failedAnchorFields(new Error(errMsg))
			});
			return false;
		}
	} catch (monitorErr: unknown) {
		// If monitoring itself fails (e.g. RPC unreachable), log and proceed:
		// the actual tx attempt will surface the real error.
		logger.warn('[Relayer] No se pudo verificar el saldo del relayer', {
			err: toErrorMessage(monitorErr)
		});
	}
	return true;
}

// ---------------------------------------------------------------------------
// Public anchoring functions
// ---------------------------------------------------------------------------

/**
 * Anchors a manifiesto payload on-chain via `registerDocument`.
 *
 * Execution guarantees:
 * - Never throws: all errors are caught, written to Firestore, and logged.
 * - Idempotent on-chain: `AlreadyRegistered` reverts are treated as success.
 * - Nonce-safe: the underlying `RegistryClient` serialises sends through a
 *   NonceMutex and retries on nonce collisions.
 * - Balance-guarded: pre-flight check aborts the call if the wallet is dry.
 *
 * Firestore status transitions:
 *   (absent / failed) → pending → confirmed
 *                     → pending → failed  (with errorMessage + lastAttemptAt)
 *
 * @param ref          Reference to the solicitud Firestore document.
 * @param solicitudId  Firestore document ID used as the on-chain requestId.
 * @param documentHash Precomputed keccak256 canonical hash (already printed on the generated
 *                      PDF by `generarManifiestoPdf` — this function anchors that same value,
 *                      it never recomputes it, so what's on paper and on-chain always match).
 */
export async function anchorManifiesto(
	ref: DocumentReference,
	solicitudId: string,
	documentHash: string
): Promise<void> {
	const network = process.env['CHAIN_ID'] ?? 'unknown';

	// --- 1. Write pending status ---
	try {
		await ref.update({
			blockchainAnchor: {
				status: 'pending',
				documentHash,
				network,
				timestamp: Date.now()
			}
		});
	} catch (fsErr: unknown) {
		logger.error('[Relayer] No se pudo escribir estado pending en Firestore', {
			solicitudId,
			err: toErrorMessage(fsErr)
		});
		return;
	}

	// --- 2. Balance pre-flight ---
	const canProceed = await passesBalanceCheck(ref, `anchorManifiesto(${solicitudId})`);
	if (!canProceed) return;

	// --- 3. Submit transaction ---
	try {
		const client = getClient();
		const result = await client.registerDocument(solicitudId, documentHash, 'MANIFIESTO_GENERADO');
		await ref.update({
			'blockchainAnchor.status': 'confirmed',
			'blockchainAnchor.txHash': result.txHash,
			'blockchainAnchor.blockNumber': result.blockNumber
		});
		logger.info('[Relayer] Manifiesto anclado exitosamente', {
			solicitudId,
			txHash: result.txHash,
			blockNumber: result.blockNumber
		});
	} catch (err: unknown) {
		if (isAlreadyRegistered(err)) {
			logger.warn('[Relayer] Hash de manifiesto ya registrado on-chain (idempotente)', {
				solicitudId
			});
			await ref.update({ 'blockchainAnchor.status': 'confirmed' });
			return;
		}
		logger.error('[Relayer] Error anclando manifiesto', { solicitudId, err: toErrorMessage(err) });
		try {
			await ref.update(failedAnchorFields(err));
		} catch (fsErr: unknown) {
			logger.error('[Relayer] Fallo al escribir estado failed en Firestore', {
				solicitudId,
				err: toErrorMessage(fsErr)
			});
		}
	}
}

/**
 * Anchors a certificado payload on-chain via `attestCertificate`.
 *
 * Same execution guarantees as `anchorManifiesto`.
 *
 * @param ref          Reference to the certificado Firestore document.
 * @param solicitudId  Parent solicitud ID (for logging only).
 * @param certId       Firestore cert document ID used as the on-chain requestId.
 * @param documentHash Precomputed keccak256 canonical hash (already printed on the generated
 *                      PDF by `emitirCertificadoPdf` — this function anchors that same value,
 *                      it never recomputes it, so what's on paper and on-chain always match).
 */
export async function anchorCertificado(
	ref: DocumentReference,
	solicitudId: string,
	certId: string,
	documentHash: string
): Promise<void> {
	const network = process.env['CHAIN_ID'] ?? 'unknown';

	// --- 1. Write pending status ---
	try {
		await ref.update({
			blockchainAnchor: {
				status: 'pending',
				documentHash,
				network,
				timestamp: Date.now()
			}
		});
	} catch (fsErr: unknown) {
		logger.error('[Relayer] No se pudo escribir estado pending en Firestore', {
			certId,
			err: toErrorMessage(fsErr)
		});
		return;
	}

	// --- 2. Balance pre-flight ---
	const canProceed = await passesBalanceCheck(ref, `anchorCertificado(${certId})`);
	if (!canProceed) return;

	// --- 3. Submit transaction ---
	try {
		const client = getClient();
		const result = await client.attestCertificate(certId, documentHash);
		await ref.update({
			'blockchainAnchor.status': 'confirmed',
			'blockchainAnchor.txHash': result.txHash,
			'blockchainAnchor.blockNumber': result.blockNumber
		});
		logger.info('[Relayer] Certificado anclado exitosamente', {
			solicitudId,
			certId,
			txHash: result.txHash,
			blockNumber: result.blockNumber
		});
	} catch (err: unknown) {
		if (isAlreadyRegistered(err)) {
			logger.warn('[Relayer] Hash de certificado ya registrado on-chain (idempotente)', { certId });
			await ref.update({ 'blockchainAnchor.status': 'confirmed' });
			return;
		}
		logger.error('[Relayer] Error anclando certificado', { certId, err: toErrorMessage(err) });
		try {
			await ref.update(failedAnchorFields(err));
		} catch (fsErr: unknown) {
			logger.error('[Relayer] Fallo al escribir estado failed en Firestore', {
				certId,
				err: toErrorMessage(fsErr)
			});
		}
	}
}
