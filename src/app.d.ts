import type { SessionUser } from '$lib/types/firestore';

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** Usuario autenticado resuelto en hooks.server.ts a partir de la cookie de sesión Firebase. */
			user: SessionUser | null;
		}
		interface PageData {
			user?: SessionUser | null;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
