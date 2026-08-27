<script lang="ts">
	import type { SolicitudTraslado } from '$lib/types/firestore';
	import { enhance } from '$app/forms';
	import Modal from '$components/ui/Modal.svelte';
	import Button from '$components/ui/Button.svelte';

	let {
		solicitudes,
		cargando = false
	}: {
		/** Solicitudes en estado INICIADA dirigidas a este operador. */
		solicitudes: SolicitudTraslado[];
		cargando?: boolean;
	} = $props();

	let rechazoOpen = $state(false);
	let rechazoId = $state('');
	let observacion = $state('');
	let enviando = $state('');

	function abrirRechazo(id: string) {
		rechazoId = id;
		observacion = '';
		rechazoOpen = true;
	}

	function pesoTotal(s: SolicitudTraslado): number {
		return (s.residuos ?? []).reduce((a, r) => a + Number(r.peso || 0), 0);
	}
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h2 class="text-base font-semibold text-slate-900">Bandeja de entrada</h2>
		<span
			class="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700"
		>
			{solicitudes.length} pendiente{solicitudes.length === 1 ? '' : 's'}
		</span>
	</div>

	{#if cargando}
		<p class="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
			Cargando solicitudes en tiempo real…
		</p>
	{:else if solicitudes.length === 0}
		<p class="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
			No hay solicitudes pendientes de aprobación. 🎉
		</p>
	{:else}
		<ul class="space-y-3">
			{#each solicitudes as s (s.id)}
				<li class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
					<div class="flex flex-wrap items-start justify-between gap-3">
						<div>
							<p class="font-mono text-xs text-slate-500">#{s.id.slice(0, 8)}</p>
							<p class="mt-1 text-sm font-medium text-slate-800">
								{(s.residuos ?? []).length} residuo(s) · {pesoTotal(s).toLocaleString('es-AR')} kg
							</p>
							<p class="text-xs text-slate-500">
								Códigos Y: {(s.residuos ?? []).map((r) => r.codigoY).join(', ')} · Vehículo
								{s.vehiculo?.patente ?? '—'}
							</p>
						</div>
						<div class="flex items-center gap-2">
							<a
								href={`/dashboard/operador/solicitudes/${s.id}`}
								class="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
								>Revisar</a
							>
							<!-- APROBAR: post a la acción ?/aprobar de la ruta del operador -->
							<form
								method="POST"
								action="?/aprobar"
								use:enhance={() => {
									enviando = s.id;
									return async ({ update }) => {
										await update({ reset: false });
										enviando = '';
									};
								}}
							>
								<input type="hidden" name="id" value={s.id} />
								<Button type="submit" loading={enviando === s.id}>Aprobar</Button>
							</form>
							<Button variant="danger" onclick={() => abrirRechazo(s.id)}>Rechazar</Button>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<!-- Modal de rechazo: observación técnica obligatoria -->
<Modal bind:open={rechazoOpen} title="Rechazar solicitud">
	<form
		id="form-rechazo"
		method="POST"
		action="?/rechazar"
		use:enhance={() => {
			enviando = rechazoId;
			return async ({ update, result }) => {
				await update({ reset: false });
				enviando = '';
				if (result.type === 'success') rechazoOpen = false;
			};
		}}
	>
		<input type="hidden" name="id" value={rechazoId} />
		<label class="block text-sm">
			<span class="mb-1 block font-medium text-slate-700">Observación técnica (obligatoria)</span>
			<textarea
				name="observacion"
				bind:value={observacion}
				required
				rows="4"
				placeholder="Motivo técnico del rechazo (p. ej. incompatibilidad de residuos, documentación incompleta…)"
				class="w-full rounded-lg border border-slate-300 text-sm shadow-sm focus:border-red-500 focus:ring-red-500"
			></textarea>
		</label>
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (rechazoOpen = false)}>Cancelar</Button>
		<Button
			variant="danger"
			type="submit"
			form="form-rechazo"
			disabled={!observacion.trim()}
			loading={enviando === rechazoId}
		>
			Confirmar rechazo
		</Button>
	{/snippet}
</Modal>
