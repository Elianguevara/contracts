<script lang="ts">
	import { publicClient, contractAddress, REGISTRY_ABI } from '$lib/web3/client';
	import Button from '$lib/components/ui/Button.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------

	/** The hex hash being verified (0x-prefixed, 66 chars). */
	let hashInput = $state('');
	let verifying = $state(false);
	let result = $state<boolean | null>(null);
	let errorMsg = $state<string | null>(null);
	let extractingHash = $state(false);
	let dragActive = $state(false);

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------

	const isValidHash = $derived(/^0x[0-9a-fA-F]{64}$/.test(hashInput.trim()));

	const contractConfigured = $derived(contractAddress.length === 42);

	// ---------------------------------------------------------------------------
	// Handlers
	// ---------------------------------------------------------------------------

	const HASH_PATTERN = /0x[0-9a-fA-F]{64}/;

	/**
	 * Reads a PDF entirely in-browser (pdf.js, dynamically imported so it never runs during SSR)
	 * and extracts the Keccak-256 hash printed on it by `generarManifiestoPdf`/`emitirCertificadoPdf`.
	 * No upload, no server round-trip, no wallet — the extracted text is only used to pre-fill the
	 * same on-chain lookup the manual "paste hash" flow already does.
	 */
	async function extractHashFromPdf(file: File) {
		extractingHash = true;
		result = null;
		errorMsg = null;

		try {
			const pdfjsLib = await import('pdfjs-dist');
			if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
				pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
					'pdfjs-dist/build/pdf.worker.mjs',
					import.meta.url
				).toString();
			}

			const buffer = await file.arrayBuffer();
			const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

			let fullText = '';
			for (let i = 1; i <= pdf.numPages; i++) {
				const page = await pdf.getPage(i);
				const content = await page.getTextContent();
				for (const item of content.items) {
					if ('str' in item) fullText += item.str + ' ';
				}
				if (HASH_PATTERN.test(fullText)) break;
			}

			const match = fullText.match(HASH_PATTERN);
			if (match) {
				hashInput = match[0];
				await verify();
			} else {
				errorMsg =
					'No se encontró un hash Keccak-256 impreso en este PDF. Verificá que sea un manifiesto o certificado emitido por EcoTrace, o pegá el hash manualmente.';
			}
		} catch (err) {
			errorMsg = `No se pudo leer el PDF: ${err instanceof Error ? err.message : String(err)}`;
		} finally {
			extractingHash = false;
		}
	}

	function handleFileChange(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) void extractHashFromPdf(file);
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragActive = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) void extractHashFromPdf(file);
	}

	async function verify() {
		if (!isValidHash) return;

		verifying = true;
		result = null;
		errorMsg = null;

		try {
			const registered = await publicClient.readContract({
				address: contractAddress,
				abi: REGISTRY_ABI,
				functionName: 'registered',
				args: [hashInput.trim() as `0x${string}`]
			});
			result = registered as boolean;
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : String(err);
		} finally {
			verifying = false;
		}
	}
</script>

<div class="rounded-xl border border-slate-200 bg-white p-5">
	<h2 class="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
		Verificación pública de evidencias
		<span
			class="rounded-full border border-chain-100 bg-chain-50 px-2 py-0.5 font-mono text-[10px] font-medium text-chain-700"
			>on-chain</span
		>
	</h2>
	<p class="mb-5 text-sm text-slate-500">
		Arrastrá el PDF del manifiesto o certificado — se lee el hash Keccak-256 impreso en el documento y
		se consulta automáticamente contra el contrato, sin subir el archivo a ningún servidor. También
		podés pegar el hash directamente.
	</p>

	{#if !contractConfigured}
		<Alert variant="warning">
			La variable de entorno <code class="font-mono">VITE_PUBLIC_CONTRACT_ADDRESS</code> no está
			configurada. La verificación on-chain no está disponible en este entorno.
		</Alert>
	{:else}
		<!-- Dropzone -->
		<div class="mb-4">
			<span class="mb-1.5 block text-sm font-medium text-slate-700">
				Cargar PDF para leer su hash de verificación
			</span>
			<label
				ondragover={(e) => {
					e.preventDefault();
					dragActive = true;
				}}
				ondragleave={() => (dragActive = false)}
				ondrop={handleDrop}
				class="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors {dragActive
					? 'border-chain-400 bg-chain-50'
					: 'border-slate-300 bg-slate-50/60 hover:border-chain-300 hover:bg-chain-50/60'}"
			>
				<svg
					class="h-6 w-6 text-chain-500"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14"
					/>
				</svg>
				<span class="text-slate-500">
					{extractingHash ? 'Leyendo PDF…' : 'Arrastrá el PDF acá, o hacé click para elegirlo'}
				</span>
				<input
					type="file"
					accept="application/pdf"
					disabled={extractingHash}
					onchange={handleFileChange}
					class="sr-only"
				/>
			</label>
		</div>

		<!-- Hash input -->
		<div class="mb-4">
			<label for="hash-input" class="block text-sm font-medium text-slate-700">
				Hash canónico (Keccak-256)
			</label>
			<p class="mb-1.5 text-xs text-slate-400">
				Formato: <code class="font-mono">0x</code> seguido de 64 caracteres hexadecimales.
			</p>
			<input
				id="hash-input"
				type="text"
				bind:value={hashInput}
				placeholder="0xabc123…"
				spellcheck="false"
				class="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs text-slate-700
				       placeholder-slate-300 focus:border-chain-500 focus:outline-none focus:ring-1 focus:ring-chain-500"
			/>
			{#if hashInput && !isValidHash}
				<p class="mt-1 text-xs text-red-500">
					El hash debe comenzar con <code class="font-mono">0x</code> y tener exactamente 64 caracteres
					hexadecimales.
				</p>
			{/if}
		</div>

		<Button variant="chain" loading={verifying} disabled={!isValidHash} onclick={verify}>
			{verifying ? 'Consultando contrato…' : 'Verificar en blockchain'}
		</Button>

		<!-- Result -->
		{#if result === true}
			<div class="mt-4">
				<Alert variant="success">
					<p class="font-semibold">Evidencia verificada correctamente</p>
					<p class="mt-0.5">
						El hash <span class="break-all font-mono text-xs">{hashInput}</span> está registrado en
						el contrato inteligente de EcoTrace.
					</p>
				</Alert>
			</div>
		{:else if result === false}
			<div class="mt-4">
				<Alert variant="error">
					<p class="font-semibold">Hash no encontrado en el contrato</p>
					<p class="mt-0.5">
						El hash consultado no está registrado en el contrato inteligente de EcoTrace. El
						documento podría no haber sido anclado aún o el hash es incorrecto.
					</p>
				</Alert>
			</div>
		{/if}

		{#if errorMsg}
			<div class="mt-4">
				<Alert variant="error"><strong>Error al verificar:</strong> {errorMsg}</Alert>
			</div>
		{/if}
	{/if}
</div>
