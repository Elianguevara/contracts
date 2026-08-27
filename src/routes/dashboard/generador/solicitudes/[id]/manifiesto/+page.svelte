<script lang="ts">
	import { enhance } from '$app/forms';
	import EstadoBadge from '$components/solicitudes/EstadoBadge.svelte';
	import BlockchainProof from '$components/web3/BlockchainProof.svelte';
	import Button from '$components/ui/Button.svelte';
	import Alert from '$components/ui/Alert.svelte';
	import { abrirVistaImpresionManifiesto } from '$lib/utils/pdf';

	let { data, form } = $props();

	const s = $derived(data.solicitud);
	const bloqueada = $derived(s.estado === 'MANIFIESTO_GENERADO' || s.estado === 'FINALIZADA');
	let generando = $state(false);
</script>

<svelte:head><title>Manifiesto · EcoTrace</title></svelte:head>

<div class="mb-6">
	<a href="/dashboard/generador" class="text-sm text-slate-500 hover:text-slate-700">← Volver</a>
	<div class="mt-1 flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold text-slate-900">Solicitud #{s.id.slice(0, 8)}</h1>
		<EstadoBadge estado={s.estado} />
	</div>
</div>

{#if form?.ok}
	<div class="mb-4">
		<Alert variant="success"
			>Manifiesto <strong>{form.numero}</strong> generado. Los datos quedaron bloqueados.</Alert
		>
	</div>
{/if}

{#if s.estado === 'RECHAZADA'}
	<div class="mb-4">
		<Alert variant="error"><strong>Rechazada por el operador.</strong> {s.observacionRechazo}</Alert
		>
	</div>
{/if}

<!-- Residuos -->
<section class="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-slate-200 text-sm">
		<thead class="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
			<tr>
				<th class="px-4 py-3">Cód. Y</th>
				<th class="px-4 py-3">Descripción</th>
				<th class="px-4 py-3">Peso</th>
				<th class="px-4 py-3">Estado</th>
				<th class="px-4 py-3">Embalaje</th>
				<th class="px-4 py-3">Códigos de despacho</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-slate-100">
			{#each s.residuos as r (r.codigoY + r.descripcion)}
				<tr>
					<td class="px-4 py-3 font-mono">{r.codigoY}</td>
					<td class="px-4 py-3">{r.descripcion}</td>
					<td class="px-4 py-3 whitespace-nowrap">{r.peso} {r.unidad}</td>
					<td class="px-4 py-3">{r.estado}</td>
					<td class="px-4 py-3">{r.embalaje} · {r.cantidadBultos} bulto(s)</td>
					<td class="px-4 py-3">
						{#if r.codigosDespacho?.length}
							<div class="flex flex-wrap gap-1">
								{#each r.codigosDespacho as c (c)}
									<span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600"
										>{c}</span
									>
								{/each}
							</div>
						{:else}
							<span class="text-slate-400">—</span>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>

<!-- Vehículo + documentos -->
<section class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
	<div class="rounded-xl border border-slate-200 bg-white p-4">
		<h3 class="mb-2 text-sm font-semibold text-slate-700">Vehículo / transporte</h3>
		<dl class="space-y-1 text-sm text-slate-600">
			<div class="flex justify-between">
				<dt>Patente</dt>
				<dd class="font-mono">{s.vehiculo.patente}</dd>
			</div>
			<div class="flex justify-between">
				<dt>Tipo</dt>
				<dd>{s.vehiculo.tipo}</dd>
			</div>
			<div class="flex justify-between">
				<dt>Chofer</dt>
				<dd>{s.vehiculo.chofer}</dd>
			</div>
			<div class="flex justify-between">
				<dt>Licencia</dt>
				<dd>{s.vehiculo.licencia}</dd>
			</div>
		</dl>
	</div>
	<div class="rounded-xl border border-slate-200 bg-white p-4">
		<h3 class="mb-2 text-sm font-semibold text-slate-700">Documentación adjunta</h3>
		<ul class="space-y-2 text-sm">
			<li>
				<a
					href={s.planContingenciaUrl}
					target="_blank"
					rel="noopener"
					class="text-brand-600 hover:text-brand-700">📄 Plan de Contingencia</a
				>
			</li>
			<li>
				<a
					href={s.hojaRutaUrl}
					target="_blank"
					rel="noopener"
					class="text-brand-600 hover:text-brand-700">📄 Hoja de Ruta</a
				>
			</li>
		</ul>
	</div>
</section>

<!-- Acción: generar manifiesto -->
<section class="rounded-xl border border-slate-200 bg-white p-5">
	{#if s.estado === 'INICIADA'}
		<p class="text-sm text-slate-500">
			La solicitud está <strong>pendiente de aprobación</strong> del operador. Podrás emitir el manifiesto
			una vez aprobada.
		</p>
	{:else if s.estado === 'APROBADA'}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h3 class="text-sm font-semibold text-slate-800">Emitir manifiesto</h3>
				<p class="text-sm text-slate-500">
					Al generar el manifiesto se <strong>bloquean los datos</strong> y se asigna un código de despacho
					unívoco por cada bulto.
				</p>
			</div>
			<form
				method="POST"
				action="?/generar"
				use:enhance={() => {
					generando = true;
					return async ({ update }) => {
						await update();
						generando = false;
					};
				}}
			>
				<Button type="submit" loading={generando}>
					{generando ? 'Generando…' : 'Generar manifiesto'}
				</Button>
			</form>
		</div>
	{:else if bloqueada}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<h3 class="text-sm font-semibold text-slate-800">
					Manifiesto {s.manifiesto?.numero}
				</h3>
				<p class="text-sm text-slate-500">
					Emitido el {s.manifiesto ? new Date(s.manifiesto.generadoEn).toLocaleString('es-AR') : ''}
					· {s.manifiesto?.codigosDespacho.length} bulto(s).
				</p>
			</div>
			<Button variant="secondary" onclick={() => abrirVistaImpresionManifiesto(s)}>
				🖨 Vista de impresión
			</Button>
		</div>
	{/if}
</section>

<!-- Evidencia blockchain (visible cuando el manifiesto ya fue generado) -->
{#if bloqueada}
	<div class="mt-4">
		<BlockchainProof blockchainAnchor={s.blockchainAnchor} />
	</div>
{/if}
