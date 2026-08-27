import {
	collection,
	onSnapshot,
	query,
	where,
	orderBy,
	type QueryConstraint,
	type Unsubscribe
} from 'firebase/firestore';
import { db } from '$lib/firebase/client';
import type { EstadoSolicitud, SolicitudTraslado } from '$lib/types/firestore';

/**
 * Store reactivo (Runes) de solicitudes en tiempo real con `onSnapshot`.
 * Se instancia por página y se filtra por actor (generadorId / operadorId / ...).
 *
 * Uso:
 *   const store = crearSolicitudesStore();
 *   $effect(() => { store.suscribirPorActor('generadorId', uid); return () => store.detener(); });
 */
export function crearSolicitudesStore() {
	let items = $state<SolicitudTraslado[]>([]);
	let cargando = $state(true);
	let error = $state<string | null>(null);
	let unsub: Unsubscribe | null = null;

	function suscribir(constraints: QueryConstraint[]) {
		detener();
		cargando = true;
		error = null;
		const q = query(collection(db, 'solicitudes'), ...constraints);
		unsub = onSnapshot(
			q,
			(snap) => {
				items = snap.docs.map((d) => ({
					id: d.id,
					...(d.data() as Omit<SolicitudTraslado, 'id'>)
				}));
				cargando = false;
			},
			(err) => {
				error = err.message;
				cargando = false;
			}
		);
	}

	/** Suscribe filtrando por el campo de actor (p. ej. 'operadorId') igual al uid. */
	function suscribirPorActor(
		campo: 'generadorId' | 'operadorId' | 'transportistaId' | 'almacenadorId',
		uid: string,
		estado?: EstadoSolicitud
	) {
		const constraints: QueryConstraint[] = [where(campo, '==', uid)];
		if (estado) constraints.push(where('estado', '==', estado));
		constraints.push(orderBy('fechaCreacion', 'desc'));
		suscribir(constraints);
	}

	/** Suscribe a TODAS las solicitudes (consola ADMIN), sin filtrar por actor. */
	function suscribirTodas() {
		suscribir([orderBy('fechaCreacion', 'desc')]);
	}

	function detener() {
		unsub?.();
		unsub = null;
	}

	return {
		get items() {
			return items;
		},
		get cargando() {
			return cargando;
		},
		get error() {
			return error;
		},
		suscribir,
		suscribirPorActor,
		suscribirTodas,
		detener
	};
}
