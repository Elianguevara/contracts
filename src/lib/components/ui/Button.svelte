<script lang="ts">
	import type { Snippet } from 'svelte';
	import Spinner from './Spinner.svelte';

	let {
		variant = 'primary',
		type = 'button',
		loading = false,
		disabled = false,
		fullWidth = false,
		class: className = '',
		form,
		onclick,
		children
	}: {
		variant?: 'primary' | 'chain' | 'secondary' | 'danger' | 'ghost';
		type?: 'button' | 'submit';
		loading?: boolean;
		disabled?: boolean;
		fullWidth?: boolean;
		class?: string;
		/** Asocia el botón a un <form> externo por id (ej. cuando vive en un Modal footer). */
		form?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	} = $props();

	// Variant → estilo. "chain" es el acento reservado para acciones que tocan
	// el contrato (verificar hash, etc.) — ver DISENO-UX.md.
	const VARIANT_CLASSES: Record<string, string> = {
		primary:
			'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:outline-brand-600',
		chain: 'bg-chain-600 text-white shadow-sm hover:bg-chain-700 focus-visible:outline-chain-600',
		secondary:
			'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-slate-400',
		danger:
			'bg-status-failed-bg text-status-failed hover:bg-red-100 focus-visible:outline-status-failed',
		ghost: 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-slate-400'
	};

	const spinnerVariant = $derived(variant === 'secondary' || variant === 'ghost' ? 'dark' : 'light');
</script>

<button
	{type}
	{form}
	disabled={disabled || loading}
	{onclick}
	class="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold
	       transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
	       disabled:cursor-not-allowed disabled:opacity-60
	       {fullWidth ? 'w-full' : ''} {VARIANT_CLASSES[variant]} {className}"
>
	{#if loading}
		<Spinner variant={spinnerVariant} />
	{/if}
	{@render children()}
</button>
