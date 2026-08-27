import type { RolUsuario } from '$lib/types/firestore';

/** Ruta home del dashboard según el rol del usuario autenticado. */
export const DASHBOARD_HOME: Record<RolUsuario, string> = {
	GENERADOR: '/dashboard/generador',
	ALMACENADOR_TRANSITORIO: '/dashboard/almacenador',
	OPERADOR: '/dashboard/operador',
	TRANSPORTISTA: '/dashboard/operador',
	ADMIN: '/dashboard/operador'
};

export function homeForRole(rol: RolUsuario): string {
	return DASHBOARD_HOME[rol] ?? '/dashboard';
}

/** Etiqueta legible del rol para la interfaz. */
export const ROL_LABEL: Record<RolUsuario, string> = {
	GENERADOR: 'Generador',
	ALMACENADOR_TRANSITORIO: 'Almacenador transitorio',
	OPERADOR: 'Operador',
	TRANSPORTISTA: 'Transportista',
	ADMIN: 'Administrador'
};
