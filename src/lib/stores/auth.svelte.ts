import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth } from '$lib/firebase/client';

/**
 * Estado de autenticación del cliente con Runes (Svelte 5).
 * Mantiene sincronizado el `User` del SDK de Firebase para las lecturas en tiempo real.
 *
 * Nota: la sesión SSR (guards por rol) vive en la cookie httpOnly; este store es solo
 * para el cliente (onSnapshot, subida a Storage, UI reactiva).
 */
class AuthState {
	user = $state<User | null>(null);
	cargando = $state(true);

	constructor() {
		if (typeof window !== 'undefined') {
			onAuthStateChanged(auth, (u) => {
				this.user = u;
				this.cargando = false;
			});
		}
	}

	get uid(): string | null {
		return this.user?.uid ?? null;
	}

	async logout(): Promise<void> {
		await signOut(auth);
		await fetch('/api/session', { method: 'DELETE' });
	}
}

export const authState = new AuthState();
