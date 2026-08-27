<script lang="ts">
	import type { EstadoSolicitud, SolicitudTraslado } from '$lib/types/firestore';
	import { ESTADOS_FILTRO } from '$lib/utils/badges';
	import DataTable from '$components/ui/DataTable.svelte';
	import EstadoBadge from './EstadoBadge.svelte';

	let {
		solicitudes,
		hrefBase = '',
		hrefFor,
		cargando = false
	}: {
		solicitudes: SolicitudTraslado[];
		/** Base para el enlace "Ver" (p. ej. '/dashboard/operador/solicitudes'). */
		hrefBase?: string;
		/** Constructor de enlace por fila (tiene prioridad sobre hrefBase). */
		hrefFor?: (s: SolicitudTraslado) => string;
		cargando?: boolean;
	} = $props();

	let filtroEstado = $state<EstadoSolicitud | 'TODOS'>('TODOS');
	let busqueda = $state('');

	const filtradas = $derived(
		solicitudes.filter((s) => {
			const okEstado = filtroEstado === 'TODOS' || s.estado === filtroEstado;
			const q = busqueda.trim().toLowerCase();
			const okBusqueda =
				!q ||
				s.id.toLowerCase().includes(q) ||
				(s.vehiculo?.patente ?? '').toLowerCase().includes(q) ||
				(s.residuos ?? []).some((r) => r.codigoY.toLowerCase().includes(q));
			return okEstado && okBusqueda;
		})
	);

	function pesoTotal(s: SolicitudTraslado): number {
		return (s.residuos ?? []).reduce((a, r) => a + Number(r.peso || 0), 0);
	}
	function fmtFecha(iso?: string): string {
		return iso ? new Date(iso).toLocaleDateString('es-AR') : '—';
	}
</script>

<div class="space-y-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
		<div class="flex flex-wrap gap-3">
			<label class="text-sm">
				<span class="mb-1 block font-medium text-slate-600">Estado</span>
				<select
					bind:value={filtroEstado}
					class="rounded-lg border border-slate-300 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
				>
					{#each ESTADOS_FILTRO as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
			<label class="text-sm">
				<span class="mb-1 block font-medium text-slate-600">Buscar</span>
				<input
					bind:value={busqueda}
					placeholder="ID, patente o código Y"
					class="rounded-lg border border-slate-300 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
				/>
			</label>
		</div>
		<p class="text-sm text-slate-500">
			{filtradas.length} de {solicitudes.length} solicitudes
		</p>
	</div>

	<DataTable isEmpty={!cargando && filtradas.length === 0} caption="Solicitudes de traslado">
		{#snippet head()}
			<th class="px-4 py-3">ID</th>
			<th class="px-4 py-3">Estado</th>
			<th class="px-4 py-3">Residuos</th>
			<th class="px-4 py-3">Peso total</th>
			<th class="hidden px-4 py-3 md:table-cell">Vehículo</th>
			<th class="hidden px-4 py-3 lg:table-cell">Creada</th>
			<th class="px-4 py-3"><span class="sr-only">Acciones</span></th>
		{/snippet}
		{#snippet children()}
			{#each filtradas as s (s.id)}
				<tr class="hover:bg-paper-alt">
					<td class="px-4 py-3 font-mono text-xs text-slate-500">{s.id.slice(0, 8)}…</td>
					<td class="px-4 py-3"><EstadoBadge estado={s.estado} /></td>
					<td class="px-4 py-3">
						<span class="font-medium text-slate-700">{s.residuos?.length ?? 0}</span>
						<span class="text-slate-400"> · {(s.residuos ?? []).map((r) => r.codigoY).join(', ')}</span>
					</td>
					<td class="px-4 py-3 whitespace-nowrap">{pesoTotal(s).toLocaleString('es-AR')} kg</td>
					<td class="hidden px-4 py-3 font-mono text-xs md:table-cell">{s.vehiculo?.patente ?? '—'}</td>
					<td class="hidden px-4 py-3 text-slate-500 lg:table-cell">{fmtFecha(s.fechaCreacion)}</td>
					<td class="px-4 py-3 text-right">
						{#if hrefFor}
							<a
								href={hrefFor(s)}
								class="text-sm font-medium text-brand-600 hover:text-brand-700">Ver →</a
							>
						{:else if hrefBase}
							<a
								href={`${hrefBase}/${s.id}`}
								class="text-sm font-medium text-brand-600 hover:text-brand-700">Ver →</a
							>
						{/if}
					</td>
				</tr>
			{/each}
		{/snippet}
		{#snippet empty()}No hay solicitudes que coincidan con el filtro.{/snippet}
	</DataTable>
</div>
