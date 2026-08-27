import type { EstadoSolicitud } from '$lib/types/firestore';

/**
 * Mapa de estado -> presentación (badge de color) según la traza del residuo.
 * Clases Tailwind con anillo interior para contraste sobre fondos claros.
 */
export const ESTADO_BADGE: Record<EstadoSolicitud, { label: string; classes: string; dot: string }> =
	{
		INICIADA: {
			label: 'Iniciada',
			classes: 'bg-slate-100 text-slate-700 ring-slate-500/20',
			dot: 'bg-slate-500'
		},
		APROBADA: {
			label: 'Aprobada',
			classes: 'bg-blue-100 text-blue-700 ring-blue-600/20',
			dot: 'bg-blue-600'
		},
		RECHAZADA: {
			label: 'Rechazada',
			classes: 'bg-red-100 text-red-700 ring-red-600/20',
			dot: 'bg-red-600'
		},
		MANIFIESTO_GENERADO: {
			label: 'Manifiesto generado',
			classes: 'bg-amber-100 text-amber-800 ring-amber-600/20',
			dot: 'bg-amber-500'
		},
		FINALIZADA: {
			label: 'Finalizada',
			classes: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20',
			dot: 'bg-emerald-600'
		}
	};

export const ESTADOS_FILTRO: { value: EstadoSolicitud | 'TODOS'; label: string }[] = [
	{ value: 'TODOS', label: 'Todos los estados' },
	{ value: 'INICIADA', label: 'Iniciada' },
	{ value: 'APROBADA', label: 'Aprobada' },
	{ value: 'RECHAZADA', label: 'Rechazada' },
	{ value: 'MANIFIESTO_GENERADO', label: 'Manifiesto generado' },
	{ value: 'FINALIZADA', label: 'Finalizada' }
];
