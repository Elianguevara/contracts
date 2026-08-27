<script lang="ts">
	import { goto } from '$app/navigation';
	import { addDoc, collection } from 'firebase/firestore';
	import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
	import { db, storage } from '$lib/firebase/client';
	import { authState } from '$lib/stores/auth.svelte';
	import type { EstadoResiduo, ResiduoSolicitud, UnidadPeso } from '$lib/types/firestore';
	import { CODIGOS_Y, ESTADOS_RESIDUO, UNIDADES_PESO, validarResiduo } from '$lib/utils/validators';
	import type { UsuarioRef } from '$server/usuarios.service';
	import FileUpload from '$components/ui/FileUpload.svelte';
	import Button from '$components/ui/Button.svelte';
	import Alert from '$components/ui/Alert.svelte';

	let {
		operadores,
		transportistas
	}: {
		operadores: UsuarioRef[];
		transportistas: UsuarioRef[];
	} = $props();

	type ResiduoForm = Omit<ResiduoSolicitud, 'codigosDespacho'>;

	function residuoVacio(): ResiduoForm {
		return {
			codigoY: 'Y1',
			descripcion: '',
			peso: 0,
			unidad: 'kg',
			estado: 'SOLIDO',
			embalaje: '',
			cantidadBultos: 1
		};
	}

	let residuos = $state<ResiduoForm[]>([residuoVacio()]);
	let vehiculo = $state({ patente: '', tipo: '', chofer: '', licencia: '' });
	let operadorId = $state('');
	let transportistaId = $state('');
	let planContingencia = $state<File | null>(null);
	let hojaRuta = $state<File | null>(null);

	// Selección por defecto cuando llegan las listas (evita capturar solo el valor inicial del prop).
	$effect(() => {
		if (!operadorId && operadores.length) operadorId = operadores[0].uid;
		if (!transportistaId && transportistas.length) transportistaId = transportistas[0].uid;
	});

	let enviando = $state(false);
	let errorMsg = $state('');

	const pesoTotal = $derived(residuos.reduce((a, r) => a + Number(r.peso || 0), 0));

	function agregarResiduo() {
		residuos = [...residuos, residuoVacio()];
	}
	function quitarResiduo(i: number) {
		residuos = residuos.filter((_, idx) => idx !== i);
	}

	function validar(): string | null {
		if (!authState.uid) return 'Tu sesión no está activa en el navegador. Reintentá el login.';
		if (!operadorId) return 'Seleccioná un operador destino.';
		if (!transportistaId) return 'Seleccioná un transportista.';
		if (!vehiculo.patente.trim() || !vehiculo.chofer.trim())
			return 'Completá patente y chofer del vehículo.';
		if (residuos.length === 0) return 'Agregá al menos un residuo.';
		for (const [i, r] of residuos.entries()) {
			const errs = validarResiduo(r);
			if (errs.length) return `Residuo #${i + 1}: ${errs[0]}`;
		}
		if (!planContingencia) return 'Adjuntá el PDF del Plan de Contingencia.';
		if (!hojaRuta) return 'Adjuntá el PDF de la Hoja de Ruta.';
		return null;
	}

	async function subir(file: File, carpeta: string): Promise<string> {
		const uid = authState.uid!;
		const path = `solicitudes/${uid}/${Date.now()}-${carpeta}-${file.name}`;
		const r = storageRef(storage, path);
		await uploadBytes(r, file);
		return getDownloadURL(r);
	}

	async function onsubmit(e: Event) {
		e.preventDefault();
		errorMsg = '';
		const err = validar();
		if (err) {
			errorMsg = err;
			return;
		}

		enviando = true;
		try {
			const [planContingenciaUrl, hojaRutaUrl] = await Promise.all([
				subir(planContingencia!, 'plan'),
				subir(hojaRuta!, 'ruta')
			]);

			await addDoc(collection(db, 'solicitudes'), {
				estado: 'INICIADA',
				generadorId: authState.uid,
				transportistaId,
				operadorId,
				almacenadorId: null,
				residuos: residuos.map((r) => ({
					...r,
					peso: Number(r.peso),
					cantidadBultos: Number(r.cantidadBultos)
				})),
				vehiculo,
				planContingenciaUrl,
				hojaRutaUrl,
				fechaCreacion: new Date().toISOString()
			});

			await goto('/dashboard/generador');
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : 'No se pudo crear la solicitud.';
		} finally {
			enviando = false;
		}
	}
</script>

<form {onsubmit} class="space-y-8">
	{#if errorMsg}
		<Alert variant="error">{errorMsg}</Alert>
	{/if}

	<!-- Residuos -->
	<section class="space-y-4">
		<div class="flex items-center justify-between">
			<h2 class="text-base font-semibold text-slate-900">Residuos a trasladar</h2>
			<button
				type="button"
				onclick={agregarResiduo}
				class="rounded-lg border border-brand-200 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
				>+ Agregar residuo</button
			>
		</div>

		{#each residuos as residuo, i (i)}
			<fieldset class="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
				<legend class="px-1 text-xs font-semibold uppercase text-slate-400">Residuo #{i + 1}</legend>

				<label class="text-sm">
					<span class="mb-1 block font-medium text-slate-700">Código Y</span>
					<select
						bind:value={residuo.codigoY}
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					>
						{#each CODIGOS_Y as y (y)}<option value={y}>{y}</option>{/each}
					</select>
				</label>

				<label class="text-sm lg:col-span-3">
					<span class="mb-1 block font-medium text-slate-700">Descripción</span>
					<input
						bind:value={residuo.descripcion}
						placeholder="p. ej. Aceites minerales usados"
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					/>
				</label>

				<label class="text-sm">
					<span class="mb-1 block font-medium text-slate-700">Peso</span>
					<input
						type="number"
						min="0"
						step="any"
						bind:value={residuo.peso}
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					/>
				</label>

				<label class="text-sm">
					<span class="mb-1 block font-medium text-slate-700">Unidad</span>
					<select
						bind:value={residuo.unidad}
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					>
						{#each UNIDADES_PESO as u (u.value)}<option value={u.value}>{u.label}</option>{/each}
					</select>
				</label>

				<label class="text-sm">
					<span class="mb-1 block font-medium text-slate-700">Estado físico</span>
					<select
						bind:value={residuo.estado}
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					>
						{#each ESTADOS_RESIDUO as est (est.value)}<option value={est.value}>{est.label}</option>{/each}
					</select>
				</label>

				<label class="text-sm">
					<span class="mb-1 block font-medium text-slate-700">Bultos</span>
					<input
						type="number"
						min="1"
						step="1"
						bind:value={residuo.cantidadBultos}
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					/>
				</label>

				<label class="text-sm sm:col-span-2 lg:col-span-3">
					<span class="mb-1 block font-medium text-slate-700">Embalaje</span>
					<input
						bind:value={residuo.embalaje}
						placeholder="p. ej. Tambor 200L"
						class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
					/>
				</label>

				<div class="flex items-end">
					{#if residuos.length > 1}
						<Button variant="danger" onclick={() => quitarResiduo(i)}>Quitar</Button>
					{/if}
				</div>
			</fieldset>
		{/each}

		<p class="text-right text-sm text-slate-500">
			Peso total declarado: <span class="font-semibold text-slate-800">{pesoTotal.toLocaleString('es-AR')}</span>
		</p>
	</section>

	<!-- Actores y vehículo -->
	<section class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<label class="text-sm">
			<span class="mb-1 block font-medium text-slate-700">Transportista</span>
			<select
				bind:value={transportistaId}
				class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
			>
				{#each transportistas as t (t.uid)}
					<option value={t.uid}>{t.razonSocial} ({t.nroRegistro})</option>
				{/each}
			</select>
		</label>
		<label class="text-sm">
			<span class="mb-1 block font-medium text-slate-700">Operador destino</span>
			<select
				bind:value={operadorId}
				class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
			>
				{#each operadores as o (o.uid)}
					<option value={o.uid}>{o.razonSocial} ({o.nroRegistro})</option>
				{/each}
			</select>
		</label>

		<label class="text-sm">
			<span class="mb-1 block font-medium text-slate-700">Patente</span>
			<input
				bind:value={vehiculo.patente}
				placeholder="AA123BB"
				class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
			/>
		</label>
		<label class="text-sm">
			<span class="mb-1 block font-medium text-slate-700">Tipo de vehículo</span>
			<input
				bind:value={vehiculo.tipo}
				placeholder="Camión cisterna"
				class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
			/>
		</label>
		<label class="text-sm">
			<span class="mb-1 block font-medium text-slate-700">Chofer</span>
			<input
				bind:value={vehiculo.chofer}
				placeholder="Juan Pérez"
				class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
			/>
		</label>
		<label class="text-sm">
			<span class="mb-1 block font-medium text-slate-700">Licencia</span>
			<input
				bind:value={vehiculo.licencia}
				placeholder="LIC-9988"
				class="w-full rounded-lg border border-slate-300 text-sm focus:border-brand-500 focus:ring-brand-500"
			/>
		</label>
	</section>

	<!-- Documentación (Storage) -->
	<section class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<FileUpload label="Plan de Contingencia (PDF)" required bind:file={planContingencia} />
		<FileUpload label="Hoja de Ruta (PDF)" required bind:file={hojaRuta} />
	</section>

	<div class="flex items-center justify-end gap-3 border-t border-slate-200 pt-6">
		<a
			href="/dashboard/generador"
			class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancelar</a
		>
		<Button type="submit" loading={enviando}>
			{enviando ? 'Creando…' : 'Crear solicitud (INICIADA)'}
		</Button>
	</div>
</form>
