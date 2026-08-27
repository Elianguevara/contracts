<script lang="ts">
	import { crearSolicitudesStore } from '$lib/stores/solicitudes.svelte';
	import { authState } from '$lib/stores/auth.svelte';
	import OperadorInbox from '$components/solicitudes/OperadorInbox.svelte';
	import SolicitudesTable from '$components/solicitudes/SolicitudesTable.svelte';

	let { data } = $props();
	const esAdmin = $derived(data.user.rol === 'ADMIN');

	const pendientes = crearSolicitudesStore();
	const todas = crearSolicitudesStore();

	$effect(() => {
		const uid = authState.uid;
		if (!uid) return;
		if (esAdmin) {
			// ADMIN: consola global, ve y opera sobre todas las solicitudes.
			todas.suscribirTodas();
		} else {
			pendientes.suscribirPorActor('operadorId', uid, 'INICIADA');
			todas.suscribirPorActor('operadorId', uid);
		}
		return () => {
			pendientes.detener();
			todas.detener();
		};
	});

	// El admin no filtra por operadorId: derivamos las pendientes desde el listado completo.
	const inboxItems = $derived(
		esAdmin ? todas.items.filter((s) => s.estado === 'INICIADA') : pendientes.items
	);
	const inboxCargando = $derived(esAdmin ? todas.cargando : pendientes.cargando);
</script>

<svelte:head><title>Operador · EcoTrace</title></svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-bold text-slate-900">
		{esAdmin ? 'Operación (admin)' : 'Panel del operador'}
	</h1>
	<p class="text-sm text-slate-500">
		{esAdmin
			? 'Consola global: aprobá, rechazá y finalizá cualquier solicitud.'
			: 'Planta de tratamiento / disposición final — trazabilidad en tiempo real.'}
	</p>
</div>

<div class="mb-10">
	<OperadorInbox solicitudes={inboxItems} cargando={inboxCargando} />
</div>

<div>
	<h2 class="mb-3 text-base font-semibold text-slate-900">
		{esAdmin ? 'Todas las solicitudes del sistema' : 'Todas las solicitudes dirigidas a mi planta'}
	</h2>
	<SolicitudesTable
		solicitudes={todas.items}
		cargando={todas.cargando}
		hrefBase="/dashboard/operador/solicitudes"
	/>
</div>
