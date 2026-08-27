/**
 * nonce-manager.ts — Distributed Firestore lock for the relayer wallet.
 *
 * PROBLEM
 * -------
 * Cloud Functions v2 can run on multiple instances simultaneously. Each instance
 * has its own Node.js process, so an in-process NonceMutex is invisible to other
 * instances. Two instances that both read nonce N from the RPC and submit a tx
 * simultaneously will collide: one succeeds, the other gets "nonce too low" or
 * "replacement transaction underpriced".
 *
 * SOLUTION
 * --------
 * Use a single Firestore document (`_system/relayer_state`) as a distributed
 * mutex. Before reading the nonce from the chain and submitting a tx, a Cloud
 * Function instance must atomically:
 *   1. Read the lock document inside a Firestore transaction.
 *   2. Assert the lock is free (or stale/expired).
 *   3. Write its own lockId + expiry timestamp.
 *
 * After the tx is confirmed (or definitively fails), the instance releases the
 * lock by clearing the lockId. If an instance crashes mid-flight, the lock TTL
 * ensures it becomes stale after LOCK_TTL_MS and can be stolen by the next
 * waiter.
 *
 * INTRA-INSTANCE FAST PATH
 * ------------------------
 * Within a single warm instance, multiple concurrent invocations (Cloud Functions
 * v2 supports up to 80 concurrent requests per instance by default) are
 * additionally serialised by the in-process `promiseQueue` exported below, which
 * avoids hammering Firestore with lock-acquire retries from goroutines that will
 * immediately lose.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Firestore path for the distributed lock document. */
const LOCK_DOC = '_system/relayer_state';

/**
 * Lock TTL in milliseconds. If a lock is not released within this window,
 * it is considered stale (crashed instance) and may be stolen.
 * Must be longer than the maximum expected tx confirmation time.
 */
const LOCK_TTL_MS = 60_000; // 60 seconds

/** Max attempts to acquire the lock before giving up. */
const MAX_ACQUIRE_ATTEMPTS = 12;

/** Base delay for lock-acquire retries (doubles each attempt, capped at 8 s). */
const LOCK_RETRY_BASE_MS = 400;

// ---------------------------------------------------------------------------
// Firestore document shape
// ---------------------------------------------------------------------------

interface RelayerLockDoc {
	lockId: string | null;
	lockedAt: number | null;
	lockExpiresAt: number | null;
}

// ---------------------------------------------------------------------------
// In-process serialisation (fast path for intra-instance concurrency)
// ---------------------------------------------------------------------------

let _inProcessTail: Promise<void> = Promise.resolve();

/**
 * Wraps `fn` in the in-process promise queue so that concurrent invocations
 * within the same instance do not all race to acquire the Firestore lock at
 * once. Only the first one proceeds; others wait their turn in memory.
 */
export function enqueueInProcess<T>(fn: () => Promise<T>): Promise<T> {
	const next: Promise<T> = _inProcessTail.then(() => fn());
	_inProcessTail = next.then(
		() => undefined,
		() => undefined
	);
	return next;
}

// ---------------------------------------------------------------------------
// Firestore distributed lock
// ---------------------------------------------------------------------------

function lockRef() {
	return getFirestore().doc(LOCK_DOC);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Clamps a value between min and max. */
function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/**
 * Atomically acquires the distributed Firestore lock.
 *
 * Algorithm:
 *  - Run a Firestore transaction that reads the lock doc and:
 *    a) If the lock is free (null lockId) or stale (past lockExpiresAt): write
 *       our lockId and return successfully.
 *    b) If the lock is held by another instance: throw LOCK_HELD so the outer
 *       retry loop can back off and try again.
 *
 * Returns the acquired lockId string.
 * Throws after MAX_ACQUIRE_ATTEMPTS if the lock is never obtained.
 */
export async function acquireLock(): Promise<string> {
	const lockId = crypto.randomUUID();

	for (let attempt = 0; attempt < MAX_ACQUIRE_ATTEMPTS; attempt++) {
		try {
			await getFirestore().runTransaction(async (tx) => {
				const snap = await tx.get(lockRef());
				const state = snap.exists ? (snap.data() as RelayerLockDoc) : null;

				const isHeld =
					state?.lockId != null && state.lockExpiresAt != null && Date.now() < state.lockExpiresAt;

				if (isHeld) {
					// Signal to the outer loop that we need to wait.
					throw new Error('LOCK_HELD');
				}

				const now = Date.now();
				const lockData = {
					lockId,
					lockedAt: now,
					lockExpiresAt: now + LOCK_TTL_MS
				};

				if (snap.exists) {
					tx.update(lockRef(), lockData);
				} else {
					tx.set(lockRef(), lockData);
				}
			});

			// Lock acquired.
			logger.debug('[NonceManager] Lock distribuido adquirido', { lockId, attempt });
			return lockId;
		} catch (err: unknown) {
			if (!String(err).includes('LOCK_HELD')) {
				// Firestore error — propagate immediately.
				throw err;
			}

			if (attempt === MAX_ACQUIRE_ATTEMPTS - 1) {
				throw new Error(
					`[NonceManager] No se pudo adquirir el lock del relayer tras ${MAX_ACQUIRE_ATTEMPTS} intentos`
				);
			}

			const jitter = Math.random() * 200;
			const delay = clamp(LOCK_RETRY_BASE_MS * Math.pow(2, attempt) + jitter, 0, 8_000);
			logger.debug('[NonceManager] Lock ocupado, reintentando', {
				attempt,
				delayMs: Math.round(delay)
			});
			await sleep(delay);
		}
	}

	// Unreachable — TypeScript needs a return path.
	throw new Error('[NonceManager] acquireLock: estado inalcanzable');
}

/**
 * Releases the distributed Firestore lock.
 *
 * Only clears the lock if our lockId still matches (another instance may have
 * stolen a stale lock — in that case, we silently do nothing).
 *
 * This function is intentionally forgiving: a release failure should never
 * crash the caller. The TTL will eventually expire the lock.
 */
export async function releaseLock(lockId: string): Promise<void> {
	try {
		await getFirestore().runTransaction(async (tx) => {
			const snap = await tx.get(lockRef());
			if (!snap.exists) return;
			const state = snap.data() as RelayerLockDoc;
			if (state.lockId !== lockId) {
				// Lock was stolen (our TTL expired) — do not overwrite.
				logger.warn(
					'[NonceManager] releaseLock: lockId no coincide, el lock fue robado o ya expiró',
					{
						expected: lockId,
						found: state.lockId
					}
				);
				return;
			}
			tx.update(lockRef(), {
				lockId: null,
				lockedAt: null,
				lockExpiresAt: null
			});
		});
		logger.debug('[NonceManager] Lock distribuido liberado', { lockId });
	} catch (err: unknown) {
		// Non-fatal: TTL will clean up the lock.
		logger.warn('[NonceManager] Error al liberar el lock (no fatal, TTL limpiará)', {
			lockId,
			err: String(err)
		});
	}
}
