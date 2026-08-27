<script lang="ts">
	let { variant = 'light' }: { variant?: 'light' | 'dark' } = $props();
</script>

<span
	class="inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-t-transparent {variant ===
	'light'
		? 'border-white/40 border-t-white'
		: 'border-slate-300 border-t-slate-600'}"
	aria-hidden="true"
></span>
