import { getAdminDb } from '$lib/firebase/admin.server';
import type { RolUsuario } from '$lib/types/firestore';

export interface UsuarioRef {
	uid: string;
	razonSocial: string;
	nroRegistro: string;
	cuit: string;
}

/**
 * Lista usuarios habilitados de un rol (para poblar selects del formulario del generador).
 * Se ejecuta en el servidor con admin porque las reglas impiden a un usuario leer los
 * documentos de otros usuarios desde el cliente.
 */
export async function listarUsuariosPorRol(rol: RolUsuario): Promise<UsuarioRef[]> {
	const snap = await getAdminDb()
		.collection('usuarios')
		.where('rol', '==', rol)
		.where('habilitado', '==', true)
		.get();

	return snap.docs.map((d) => {
		const data = d.data();
		return {
			uid: d.id,
			razonSocial: String(data.razonSocial ?? ''),
			nroRegistro: String(data.nroRegistro ?? ''),
			cuit: String(data.cuit ?? '')
		};
	});
}
