<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		variant = 'info',
		children
	}: {
		variant?: 'success' | 'error' | 'warning' | 'info';
		children: Snippet;
	} = $props();

	const ICON_PATH: Record<string, string> = {
		success: 'M5 10l3 3 7-7',
		error: 'M10 6v5m0 3h.01M4 10a6 6 0 1112 0 6 6 0 01-12 0z',
		warning:
			'M10 7v4m0 3h.01M8.5 3.5l-6 10.5A1 1 0 003.36 16h13.28a1 1 0 00.86-1.5l-6-10.5a1 1 0 00-1.72 0z',
		info: 'M10 13.5v-3M10 7h.01M17 10a7 7 0 11-14 0 7 7 0 0114 0z'
	};

	const VARIANT_CLASSES: Record<string, string> = {
		success: 'border-emerald-200 bg-status-confirmed-bg text-emerald-800',
		error: 'border-red-200 bg-status-failed-bg text-red-700',
		warning: 'border-amber-200 bg-status-pending-bg text-amber-800',
		info: 'border-chain-100 bg-chain-50 text-chain-700'
	};
</script>

<div
	role="alert"
	class="flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm {VARIANT_CLASSES[variant]}"
>
	<svg
		class="mt-0.5 h-4 w-4 shrink-0"
		viewBox="0 0 20 20"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		aria-hidden="true"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d={ICON_PATH[variant]} />
	</svg>
	<div>{@render children()}</div>
</div>
