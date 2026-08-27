<script lang="ts">
	import { crearSolicitudesStore } from '$lib/stores/solicitudes.svelte';
	import { authState } from '$lib/stores/auth.svelte';
	import SolicitudesTable from '$components/solicitudes/SolicitudesTable.svelte';
	import type { SolicitudTraslado } from '$lib/types/firestore';

	let { data } = $props();
	const esAdmin = $derived(data.user.rol === 'ADMIN');

	const store = crearSolicitudesStore();

	$effect(() => {
		const uid = authState.uid;
		if (!uid) return;
		if (esAdmin) store.suscribirTodas();
		else store.suscribirPorActor('generadorId', uid);
		return () => store.detener();
	});

	function hrefFor(s: SolicitudTraslado): string {
		return `/dashboard/generador/solicitudes/${s.id}/manifiesto`;
	}
</script>

<svelte:head><title>Mis solicitudes · EcoTrace</title></svelte:head>

<div class="mb-6 flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-bold text-slate-900">{esAdmin ? 'Solicitudes' : 'Mis solicitudes'}</h1>
		<p class="text-sm text-slate-500">
			{esAdmin
				? 'Todas las solicitudes del sistema. Podés emitir el manifiesto de cualquiera.'
				: 'Trazabilidad en tiempo real de tus traslados.'}
		</p>
	</div>
	<a
		href="/dashboard/generador/solicitudes/nueva"
		class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
		>+ Nueva solicitud</a
	>
</div>

<SolicitudesTable solicitudes={store.items} cargando={store.cargando} {hrefFor} />
