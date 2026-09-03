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

interface FakeLockDoc {
	lockId: string | null;
	lockedAt: number | null;
	lockExpiresAt: number | null;
}

/**
 * Minimal in-memory stand-in for the single Firestore document the
 * distributed lock reads/writes. `runTransaction` executes the callback
 * synchronously against the current in-memory state, mirroring the
 * single-document transaction the real implementation performs.
 */
function createFakeDb(initialData?: FakeLockDoc) {
	let docData: FakeLockDoc | undefined = initialData;
	const ref = { id: '_system/relayer_state' };

	const db = {
		doc: vi.fn(() => ref),
		runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<void>) => {
			const tx = {
				get: vi.fn(async () => ({
					exists: docData !== undefined,
					data: () => docData
				})),
				set: vi.fn((_ref: unknown, data: FakeLockDoc) => {
					docData = data;
				}),
				update: vi.fn((_ref: unknown, data: Partial<FakeLockDoc>) => {
					docData = { ...(docData as FakeLockDoc), ...data };
				})
			};
			return fn(tx);
		})
	};

	return { db, getDocData: () => docData };
}

let fakeDb: ReturnType<typeof createFakeDb>;

vi.mock('firebase-admin/firestore', () => ({
	getFirestore: vi.fn(() => fakeDb.db)
}));

import { acquireLock, releaseLock, enqueueInProcess } from '../nonce-manager';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// acquireLock
// ---------------------------------------------------------------------------

describe('acquireLock', () => {
	it('acquires immediately when no lock document exists yet (tx.set path)', async () => {
		fakeDb = createFakeDb(undefined);

		const lockId = await acquireLock();

		expect(typeof lockId).toBe('string');
		expect(lockId.length).toBeGreaterThan(0);
		expect(fakeDb.getDocData()).toEqual({
			lockId,
			lockedAt: expect.any(Number),
			lockExpiresAt: expect.any(Number)
		});
	});

	it('acquires immediately when the lock document exists but is free (tx.update path)', async () => {
		fakeDb = createFakeDb({ lockId: null, lockedAt: null, lockExpiresAt: null });

		const lockId = await acquireLock();

		expect(fakeDb.getDocData()?.lockId).toBe(lockId);
	});

	it('retries with backoff while the lock is held, then acquires once it goes stale', async () => {
		const now = Date.now();
		fakeDb = createFakeDb({ lockId: 'other-instance', lockedAt: now, lockExpiresAt: now + 300 });

		const promise = acquireLock();
		// Advance past the held window plus at least one backoff retry.
		await vi.advanceTimersByTimeAsync(2_000);
		const lockId = await promise;

		expect(lockId).not.toBe('other-instance');
		expect(fakeDb.getDocData()?.lockId).toBe(lockId);
	});

	it('throws after exhausting all acquire attempts when the lock never frees up', async () => {
		const now = Date.now();
		fakeDb = createFakeDb({
			lockId: 'stuck-instance',
			lockedAt: now,
			lockExpiresAt: now + 10_000_000
		});

		const promise = acquireLock();
		promise.catch(() => {
			/* swallow to avoid unhandled rejection during timer flush */
		});
		await vi.advanceTimersByTimeAsync(120_000);

		await expect(promise).rejects.toThrow(/No se pudo adquirir el lock/);
	});

	it('propagates a non-contention Firestore error immediately without retrying', async () => {
		fakeDb = createFakeDb(undefined);
		fakeDb.db.runTransaction.mockRejectedValueOnce(new Error('FIRESTORE_UNAVAILABLE'));

		await expect(acquireLock()).rejects.toThrow('FIRESTORE_UNAVAILABLE');
		expect(fakeDb.db.runTransaction).toHaveBeenCalledTimes(1);
	});
});

// ---------------------------------------------------------------------------
// releaseLock
// ---------------------------------------------------------------------------

describe('releaseLock', () => {
	it('clears the lock fields when the lockId matches', async () => {
		const now = Date.now();
		fakeDb = createFakeDb({ lockId: 'mine', lockedAt: now, lockExpiresAt: now + 60_000 });

		await releaseLock('mine');

		expect(fakeDb.getDocData()).toEqual({ lockId: null, lockedAt: null, lockExpiresAt: null });
	});

	it('does nothing when the lock was already stolen (lockId mismatch)', async () => {
		const now = Date.now();
		const held = { lockId: 'someone-else', lockedAt: now, lockExpiresAt: now + 60_000 };
		fakeDb = createFakeDb(held);

		await releaseLock('mine');

		expect(fakeDb.getDocData()).toEqual(held);
	});

	it('does nothing when the lock document does not exist', async () => {
		fakeDb = createFakeDb(undefined);

		await expect(releaseLock('mine')).resolves.toBeUndefined();
	});

	it('swallows Firestore errors instead of throwing (TTL will clean up)', async () => {
		fakeDb = createFakeDb({ lockId: 'mine', lockedAt: Date.now(), lockExpiresAt: Date.now() + 1000 });
		fakeDb.db.runTransaction.mockRejectedValueOnce(new Error('FIRESTORE_DOWN'));

		await expect(releaseLock('mine')).resolves.toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// enqueueInProcess
// ---------------------------------------------------------------------------

describe('enqueueInProcess', () => {
	it('runs queued functions strictly in order, one at a time', async () => {
		const order: number[] = [];

		const task = (id: number, delayMs: number) =>
			enqueueInProcess(async () => {
				order.push(id);
				await new Promise((resolve) => setTimeout(resolve, delayMs));
				order.push(-id);
				return id;
			});

		const p1 = task(1, 30);
		const p2 = task(2, 10);
		const p3 = task(3, 0);

		await vi.advanceTimersByTimeAsync(200);
		const results = await Promise.all([p1, p2, p3]);

		expect(results).toEqual([1, 2, 3]);
		// Each task must fully finish (start, then its own completion marker)
		// before the next one starts.
		expect(order).toEqual([1, -1, 2, -2, 3, -3]);
	});

	it('continues processing the queue after an earlier task rejects', async () => {
		const seen: string[] = [];

		const p1 = enqueueInProcess(async () => {
			seen.push('first');
			throw new Error('boom');
		});
		const p2 = enqueueInProcess(async () => {
			seen.push('second');
			return 'ok';
		});

		await expect(p1).rejects.toThrow('boom');
		await expect(p2).resolves.toBe('ok');
		expect(seen).toEqual(['first', 'second']);
	});
});
