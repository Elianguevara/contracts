<script lang="ts">
	import { crearSolicitudesStore } from '$lib/stores/solicitudes.svelte';
	import { authState } from '$lib/stores/auth.svelte';
	import SolicitudesTable from '$components/solicitudes/SolicitudesTable.svelte';
	import type { SolicitudTraslado } from '$lib/types/firestore';

	let { data } = $props();
	const esAdmin = $derived(data.user.rol === 'ADMIN');

	// El almacenador transitorio genera solicitudes (como generador) y recibe (como depositario).
	const generadas = crearSolicitudesStore();
	const recibidas = crearSolicitudesStore();

	$effect(() => {
		const uid = authState.uid;
		if (!uid) return;
		if (esAdmin) {
			// ADMIN: consola global (una sola tabla con todas las solicitudes).
			generadas.suscribirTodas();
		} else {
			generadas.suscribirPorActor('generadorId', uid);
			recibidas.suscribirPorActor('almacenadorId', uid);
		}
		return () => {
			generadas.detener();
			recibidas.detener();
		};
	});

	function hrefFor(s: SolicitudTraslado): string {
		return `/dashboard/generador/solicitudes/${s.id}/manifiesto`;
	}
</script>

<svelte:head><title>Almacenador transitorio · EcoTrace</title></svelte:head>

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold text-slate-900">
			{esAdmin ? 'Almacenador (admin)' : 'Almacenador transitorio'}
		</h1>
		<p class="text-sm text-slate-500">
			{esAdmin
				? 'Consola global de solicitudes.'
				: 'Depositario intermedio: podés recibir y generar solicitudes.'}
		</p>
	</div>
	<a
		href="/dashboard/generador/solicitudes/nueva"
		class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
		>+ Nueva solicitud</a
	>
</div>

{#if esAdmin}
	<section>
		<h2 class="mb-3 text-base font-semibold text-slate-900">Todas las solicitudes del sistema</h2>
		<SolicitudesTable solicitudes={generadas.items} cargando={generadas.cargando} {hrefFor} />
	</section>
{:else}
	<section class="mb-10">
		<h2 class="mb-3 text-base font-semibold text-slate-900">Solicitudes generadas por mí</h2>
		<SolicitudesTable solicitudes={generadas.items} cargando={generadas.cargando} {hrefFor} />
	</section>

	<section>
		<h2 class="mb-3 text-base font-semibold text-slate-900">Solicitudes recibidas en depósito</h2>
		<SolicitudesTable solicitudes={recibidas.items} cargando={recibidas.cargando} />
	</section>
{/if}
