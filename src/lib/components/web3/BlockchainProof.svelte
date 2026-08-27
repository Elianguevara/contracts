<script lang="ts">
	import type { BlockchainAnchor } from '$lib/types/firestore';
	import { getExplorerUrl } from '$lib/web3/client';

	let { blockchainAnchor }: { blockchainAnchor: BlockchainAnchor | undefined } = $props();

	const explorerUrl = $derived(
		blockchainAnchor?.txHash && blockchainAnchor?.network
			? getExplorerUrl(blockchainAnchor.network, blockchainAnchor.txHash)
			: null
	);

	const anchorDate = $derived(
		blockchainAnchor?.timestamp ? new Date(blockchainAnchor.timestamp).toLocaleString('es-AR') : null
	);

	// "idle" no es un status de BlockchainAnchor — es la ausencia total del campo
	// (el trigger de anclaje todavía no corrió).
	const status = $derived(blockchainAnchor?.status ?? 'idle');

	const STATUS_LABEL: Record<string, string> = {
		idle: 'Sin iniciar',
		pending: 'Anclando…',
		confirmed: 'Confirmado',
		failed: 'Fallido'
	};

	const STATUS_CHIP_CLASSES: Record<string, string> = {
		idle: 'border-slate-500/25 bg-slate-500/10 text-slate-400',
		pending: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
		confirmed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
		failed: 'border-red-500/30 bg-red-500/10 text-red-300'
	};

	const STATUS_DOT_CLASSES: Record<string, string> = {
		idle: 'bg-slate-500',
		pending: 'bg-amber-400',
		confirmed: 'bg-emerald-400',
		failed: 'bg-red-400'
	};

	// Feedback de "copiado" — vuelve a null solo si nadie copió otro campo mientras tanto.
	let copiedField = $state<string | null>(null);

	async function copy(value: string, field: string) {
		try {
			await navigator.clipboard.writeText(value);
			copiedField = field;
			setTimeout(() => {
				if (copiedField === field) copiedField = null;
			}, 1500);
		} catch {
			// Clipboard API no disponible (contexto no seguro, permiso denegado, etc.) — no rompe la UI.
		}
	}
</script>

<section
	class="overflow-hidden rounded-xl border border-ink-800 bg-gradient-to-br from-ink-900 to-ink-950 p-5 text-slate-300 shadow-lg"
>
	<div class="mb-4 flex items-center justify-between gap-3">
		<h3 class="flex items-center gap-2 text-sm font-semibold text-slate-100">
			<svg
				class="h-4 w-4 text-chain-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
				/>
			</svg>
			Evidencia blockchain
		</h3>

		<span
			class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium {STATUS_CHIP_CLASSES[
				status
			]}"
		>
			<span class="relative flex h-1.5 w-1.5">
				{#if status === 'pending'}
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"
					></span>
				{/if}
				<span class="relative inline-flex h-1.5 w-1.5 rounded-full {STATUS_DOT_CLASSES[status]}"
				></span>
			</span>
			{STATUS_LABEL[status]}
		</span>
	</div>

	{#if status === 'idle'}
		<p class="text-xs text-slate-400">Se ancla automáticamente en cuanto se genere el documento.</p>
	{:else if status === 'pending'}
		<dl class="space-y-2.5 text-xs">
			{#if blockchainAnchor?.documentHash}
				<div>
					<dt class="mb-0.5 font-medium text-slate-400">Hash canónico (Keccak-256)</dt>
					<dd class="flex items-center gap-2 break-all font-mono text-slate-300">
						{blockchainAnchor.documentHash}
						<button
							type="button"
							onclick={() => copy(blockchainAnchor!.documentHash, 'hash')}
							class="shrink-0 rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300"
							aria-label="Copiar hash canónico"
						>
							{copiedField === 'hash' ? '✓' : '⧉'}
						</button>
					</dd>
				</div>
			{/if}
			<div>
				<dt class="mb-0.5 font-medium text-slate-400">Tx hash</dt>
				<dd class="h-3 w-2/3 animate-pulse rounded bg-white/10"></dd>
			</div>
		</dl>
	{:else if status === 'confirmed'}
		<dl class="space-y-3 text-xs">
			<div>
				<dt class="mb-0.5 font-medium text-slate-400">Hash canónico (Keccak-256)</dt>
				<dd class="flex items-center gap-2 break-all font-mono text-slate-300">
					{blockchainAnchor?.documentHash}
					{#if blockchainAnchor?.documentHash}
						<button
							type="button"
							onclick={() => copy(blockchainAnchor!.documentHash, 'hash')}
							class="shrink-0 rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300"
							aria-label="Copiar hash canónico"
						>
							{copiedField === 'hash' ? '✓' : '⧉'}
						</button>
					{/if}
				</dd>
			</div>
			{#if blockchainAnchor?.txHash}
				<div>
					<dt class="mb-0.5 font-medium text-slate-400">Hash de transacción</dt>
					<dd class="flex items-center gap-2 break-all font-mono">
						{#if explorerUrl}
							<a
								href={explorerUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="text-chain-300 underline hover:text-chain-200"
							>
								{blockchainAnchor.txHash}
							</a>
						{:else}
							<span class="text-slate-300">{blockchainAnchor.txHash}</span>
							<span class="text-slate-500">(red local)</span>
						{/if}
						<button
							type="button"
							onclick={() => copy(blockchainAnchor!.txHash!, 'tx')}
							class="shrink-0 rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-300"
							aria-label="Copiar hash de transacción"
						>
							{copiedField === 'tx' ? '✓' : '⧉'}
						</button>
					</dd>
				</div>
			{/if}
			{#if blockchainAnchor?.blockNumber || blockchainAnchor?.network || anchorDate}
				<div class="flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-3">
					{#if blockchainAnchor?.blockNumber}
						<div>
							<dt class="font-medium text-slate-400">Bloque</dt>
							<dd class="font-mono text-slate-300">
								#{blockchainAnchor.blockNumber.toLocaleString('es-AR')}
							</dd>
						</div>
					{/if}
					{#if blockchainAnchor?.network}
						<div>
							<dt class="font-medium text-slate-400">Red (chain ID)</dt>
							<dd class="font-mono text-slate-300">{blockchainAnchor.network}</dd>
						</div>
					{/if}
					{#if anchorDate}
						<div>
							<dt class="font-medium text-slate-400">Anclado</dt>
							<dd class="text-slate-300">{anchorDate}</dd>
						</div>
					{/if}
				</div>
			{/if}
		</dl>
	{:else if status === 'failed'}
		{#if blockchainAnchor?.errorMessage}
			<p class="mb-2.5 text-xs text-red-300">{blockchainAnchor.errorMessage}</p>
		{/if}
		<dl class="space-y-2 text-xs">
			{#if blockchainAnchor?.documentHash}
				<div>
					<dt class="mb-0.5 font-medium text-slate-400">Hash canónico calculado</dt>
					<dd class="break-all font-mono text-slate-400">{blockchainAnchor.documentHash}</dd>
				</div>
			{/if}
			{#if blockchainAnchor?.lastAttemptAt}
				<p class="text-slate-500">
					Último intento: {new Date(blockchainAnchor.lastAttemptAt).toLocaleString('es-AR')}
				</p>
			{/if}
		</dl>
	{/if}
</section>
