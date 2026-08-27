<script lang="ts">
	let {
		label,
		accept = 'application/pdf',
		required = false,
		file = $bindable<File | null>(null)
	}: {
		label: string;
		accept?: string;
		required?: boolean;
		file?: File | null;
	} = $props();

	let dragActive = $state(false);

	function onchange(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		file = input.files?.[0] ?? null;
	}

	function ondrop(e: DragEvent) {
		e.preventDefault();
		dragActive = false;
		file = e.dataTransfer?.files?.[0] ?? file;
	}
</script>

<div>
	<span class="mb-1.5 block text-sm font-medium text-slate-700">
		{label}{#if required}<span class="text-red-500"> *</span>{/if}
	</span>
	<label
		ondragover={(e) => {
			e.preventDefault();
			dragActive = true;
		}}
		ondragleave={() => (dragActive = false)}
		{ondrop}
		class="flex cursor-pointer items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3.5 text-sm transition-colors {dragActive
			? 'border-chain-400 bg-chain-50'
			: file
				? 'border-brand-200 bg-brand-50/50'
				: 'border-slate-300 bg-slate-50/60 hover:border-brand-300 hover:bg-brand-50/40'}"
	>
		<svg
			class="h-5 w-5 shrink-0 {file ? 'text-brand-600' : 'text-slate-400'}"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.6"
			aria-hidden="true"
		>
			{#if file}
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.5l2 2 4-4.5M12 3a9 9 0 100 18 9 9 0 000-18z" />
			{:else}
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" />
			{/if}
		</svg>
		<span class="min-w-0 flex-1 truncate {file ? 'text-brand-800' : 'text-slate-500'}">
			{file ? file.name : 'Arrastrá el PDF acá, o hacé click para elegirlo'}
		</span>
		<input type="file" {accept} {required} {onchange} class="sr-only" />
	</label>
</div>
