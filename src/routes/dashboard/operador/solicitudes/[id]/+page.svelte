<script lang="ts">
	import { enhance } from '$app/forms';
	import EstadoBadge from '$components/solicitudes/EstadoBadge.svelte';
	import BlockchainProof from '$components/web3/BlockchainProof.svelte';
	import Modal from '$components/ui/Modal.svelte';
	import Button from '$components/ui/Button.svelte';
	import Alert from '$components/ui/Alert.svelte';
	import { CODIGOS_OPERACION_FINAL, UNIDADES_PESO } from '$lib/utils/validators';

	let { data, form } = $props();

	const s = $derived(data.solicitud);
	const pesoDeclarado = $derived((s.residuos ?? []).reduce((a, r) => a + Number(r.peso || 0), 0));

	let enviando = $state(false);
	let rechazoOpen = $state(false);
	let observacion = $state('');

	// Estado del formulario de cierre
	let conforme = $state('true');
	let tipoCertificado = $state('TRATAMIENTO');
</script>

<svelte:head><title>Solicitud {s.id.slice(0, 8)} · EcoTrace</title></svelte:head>

<div class="mb-6">
	<a href="/dashboard/operador" class="text-sm text-slate-500 hover:text-slate-700"
		>← Volver al panel</a
	>
	<div class="mt-1 flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold text-slate-900">Solicitud #{s.id.slice(0, 8)}</h1>
		<EstadoBadge estado={s.estado} />
	</div>
</div>

{#if form?.ok && form?.numeroCertificado}
	<div class="mb-4">
		<Alert variant="success"
			>Solicitud finalizada. Certificado <strong>{form.numeroCertificado}</strong> emitido.</Alert
		>
	</div>
{:else if form?.ok}
	<div class="mb-4"><Alert variant="success">Acción registrada correctamente.</Alert></div>
{/if}
{#if form?.error}
	<div class="mb-4"><Alert variant="error">{form.error}</Alert></div>
{/if}

<!-- Detalle de residuos -->
<section class="mb-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-slate-200 text-sm">
		<thead class="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
			<tr>
				<th class="px-4 py-3">Cód. Y</th>
				<th class="px-4 py-3">Descripción</th>
				<th class="px-4 py-3">Peso</th>
				<th class="px-4 py-3">Estado</th>
				<th class="px-4 py-3">Embalaje</th>
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
				</tr>
			{/each}
		</tbody>
		<tfoot class="bg-slate-50 text-sm font-medium">
			<tr>
				<td class="px-4 py-2 text-slate-500" colspan="2">Peso total declarado</td>
				<td class="px-4 py-2" colspan="3">{pesoDeclarado.toLocaleString('es-AR')} kg</td>
			</tr>
		</tfoot>
	</table>
</section>

<!-- Panel de acción según estado -->
{#if s.estado === 'INICIADA'}
	<section class="rounded-xl border border-slate-200 bg-white p-5">
		<h3 class="text-sm font-semibold text-slate-800">Revisión</h3>
		<p class="mb-4 text-sm text-slate-500">
			Aprobá o rechazá la solicitud (el rechazo exige una observación técnica).
		</p>
		<div class="flex gap-3">
			<form
				method="POST"
				action="?/aprobar"
				use:enhance={() => {
					enviando = true;
					return async ({ update }) => {
						await update();
						enviando = false;
					};
				}}
			>
				<Button type="submit" loading={enviando}>Aprobar</Button>
			</form>
			<Button variant="danger" onclick={() => (rechazoOpen = true)}>Rechazar</Button>
		</div>
	</section>
{:else if s.estado === 'APROBADA'}
	<section class="rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-800">
		Solicitud <strong>aprobada</strong>. Esperando que el generador emita el manifiesto para
		habilitar la recepción.
	</section>
{:else if s.estado === 'MANIFIESTO_GENERADO'}
	<section class="rounded-xl border border-slate-200 bg-white p-5">
		<h3 class="mb-1 text-sm font-semibold text-slate-800">Cierre / recepción en planta</h3>
		<p class="mb-4 text-sm text-slate-500">
			Registrá el pesaje real. Si la carga difiere de lo declarado, marcá "Disconforme" para emitir
			un Reporte de Recepción. Luego seleccioná la operación final (R/D) para emitir el certificado.
		</p>

		<form
			method="POST"
			action="?/finalizar"
			use:enhance={() => {
				enviando = true;
				return async ({ update }) => {
					await update();
					enviando = false;
				};
			}}
			class="grid grid-cols-1 gap-4 sm:grid-cols-2"
		>
			<label class="text-sm">
				<span class="mb-1 block font-medium text-slate-700">Peso recibido total</span>
				<input
					name="pesoRecibidoTotal"
					type="number"
					min="0"
					step="any"
					required
					class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
				/>
			</label>
			<label class="text-sm">
				<span class="mb-1 block font-medium text-slate-700">Unidad</span>
				<select
					name="unidad"
					class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
				>
					{#each UNIDADES_PESO as u (u.value)}<option value={u.value}>{u.label}</option>{/each}
				</select>
			</label>

			<label class="text-sm">
				<span class="mb-1 block font-medium text-slate-700">Conformidad de la recepción</span>
				<select
					name="conforme"
					bind:value={conforme}
					class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
				>
					<option value="true">Conforme a lo declarado</option>
					<option value="false">Disconforme (genera reporte)</option>
				</select>
			</label>

			{#if conforme === 'false'}
				<label class="text-sm">
					<span class="mb-1 block font-medium text-slate-700">Patente recibida (si mutó)</span>
					<input
						name="patenteRecibida"
						placeholder={s.vehiculo.patente}
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					/>
				</label>
				<label class="text-sm sm:col-span-2">
					<span class="mb-1 block font-medium text-slate-700">Observaciones de disconformidad</span>
					<textarea
						name="observaciones"
						rows="2"
						placeholder="Diferencia de peso, vehículo mutado, embalaje dañado…"
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					></textarea>
				</label>
			{/if}

			<label class="text-sm">
				<span class="mb-1 block font-medium text-slate-700">Operación final (R/D)</span>
				<select
					name="codigoOperacion"
					required
					class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
				>
					{#each CODIGOS_OPERACION_FINAL as c (c)}<option value={c}>{c}</option>{/each}
				</select>
			</label>
			<label class="text-sm">
				<span class="mb-1 block font-medium text-slate-700">Tipo de certificado</span>
				<select
					name="tipoCertificado"
					bind:value={tipoCertificado}
					class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
				>
					<option value="TRATAMIENTO">Tratamiento</option>
					<option value="DESTRUCCION">Destrucción</option>
					<option value="DISPOSICION_FINAL">Disposición final</option>
				</select>
			</label>

			<label class="text-sm sm:col-span-2">
				<span class="mb-1 block font-medium text-slate-700">Resumen del proceso ejecutado</span>
				<textarea
					name="resumenProceso"
					rows="3"
					required
					placeholder="Descripción del tratamiento físico/químico aplicado…"
					class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
				></textarea>
			</label>

			<div class="sm:col-span-2 flex justify-end">
				<Button type="submit" loading={enviando}>
					{enviando ? 'Procesando…' : 'Finalizar y emitir certificado'}
				</Button>
			</div>
		</form>
	</section>
{:else if s.estado === 'FINALIZADA'}
	<section class="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
		<h3 class="mb-2 text-sm font-semibold">Solicitud finalizada</h3>
		<dl class="grid grid-cols-2 gap-2">
			<dt class="text-emerald-700">Peso recibido</dt>
			<dd>{s.recepcion?.pesoRecibidoTotal} {s.recepcion?.unidad}</dd>
			<dt class="text-emerald-700">Conformidad</dt>
			<dd>{s.recepcion?.conforme ? 'Conforme' : 'Disconforme (con reporte)'}</dd>
			<dt class="text-emerald-700">Operación final</dt>
			<dd class="font-mono">{s.recepcion?.operacionFinal} ({s.recepcion?.tipoOperacion})</dd>
			<dt class="text-emerald-700">Certificado</dt>
			<dd class="font-mono">{s.certificadoId}</dd>
		</dl>
	</section>
{:else if s.estado === 'RECHAZADA'}
	<section class="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
		<strong>Rechazada.</strong>
		{s.observacionRechazo}
	</section>
{/if}

<!-- Evidencia blockchain -->
{#if s.blockchainAnchor}
	<div class="mt-4">
		<BlockchainProof blockchainAnchor={s.blockchainAnchor} />
	</div>
{/if}

<!-- Modal de rechazo -->
<Modal bind:open={rechazoOpen} title="Rechazar solicitud">
	<form
		id="form-rechazo-detalle"
		method="POST"
		action="?/rechazar"
		use:enhance={() => {
			enviando = true;
			return async ({ update, result }) => {
				await update();
				enviando = false;
				if (result.type === 'success') rechazoOpen = false;
			};
		}}
	>
		<label class="block text-sm">
			<span class="mb-1 block font-medium text-slate-700">Observación técnica (obligatoria)</span>
			<textarea
				name="observacion"
				bind:value={observacion}
				required
				rows="4"
				class="w-full rounded-lg border border-slate-300 text-sm focus:border-red-500 focus:ring-red-500"
			></textarea>
		</label>
	</form>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (rechazoOpen = false)}>Cancelar</Button>
		<Button
			variant="danger"
			type="submit"
			form="form-rechazo-detalle"
			disabled={!observacion.trim()}
			loading={enviando}
		>
			Confirmar rechazo
		</Button>
	{/snippet}
</Modal>
