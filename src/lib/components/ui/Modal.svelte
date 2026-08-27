<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		children,
		footer,
		onclose
	}: {
		open?: boolean;
		title: string;
		children: Snippet;
		footer?: Snippet;
		onclose?: () => void;
	} = $props();

	function close() {
		open = false;
		onclose?.();
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button class="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" aria-label="Cerrar" onclick={close}
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label={title}
			class="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
		>
			<div class="mb-4 flex items-start justify-between gap-4">
				<h2 class="text-lg font-semibold text-slate-900">{title}</h2>
				<button
					onclick={close}
					class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
					aria-label="Cerrar">✕</button
				>
			</div>
			<div class="space-y-4">{@render children()}</div>
			{#if footer}
				<div class="mt-6 flex justify-end gap-3">{@render footer()}</div>
			{/if}
		</div>
	</div>
{/if}
