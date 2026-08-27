<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		head,
		children,
		empty,
		isEmpty = false,
		caption
	}: {
		head: Snippet;
		children: Snippet;
		empty?: Snippet;
		isEmpty?: boolean;
		caption?: string;
	} = $props();
</script>

<div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
	<table class="min-w-full divide-y divide-slate-200 text-sm">
		{#if caption}<caption class="sr-only">{caption}</caption>{/if}
		<thead
			class="bg-paper-alt text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
		>
			<tr>{@render head()}</tr>
		</thead>
		<tbody class="divide-y divide-slate-100">
			{@render children()}
		</tbody>
	</table>
	{#if isEmpty}
		<div class="p-8 text-center text-sm text-slate-500">
			{#if empty}{@render empty()}{:else}Sin registros.{/if}
		</div>
	{/if}
</div>
