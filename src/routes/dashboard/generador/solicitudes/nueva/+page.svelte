<script lang="ts">
	import SolicitudForm from '$components/solicitudes/SolicitudForm.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Nueva solicitud · EcoTrace</title></svelte:head>

<div class="mb-6">
	<a href="/dashboard/generador" class="text-sm text-slate-500 hover:text-slate-700">← Volver</a>
	<h1 class="mt-1 text-2xl font-bold text-slate-900">Nueva solicitud de traslado</h1>
	<p class="text-sm text-slate-500">
		Se crea en estado <span class="font-medium">INICIADA</span> y queda pendiente de aprobación del operador.
	</p>
</div>

{#if data.operadores.length === 0 || data.transportistas.length === 0}
	<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
		Necesitás al menos un operador y un transportista habilitados en la colección
		<code>usuarios</code> para crear solicitudes.
	</div>
{:else}
	<SolicitudForm operadores={data.operadores} transportistas={data.transportistas} />
{/if}
