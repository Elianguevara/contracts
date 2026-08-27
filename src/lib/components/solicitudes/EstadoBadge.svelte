<script lang="ts">
	import type { EstadoSolicitud } from '$lib/types/firestore';
	import { ESTADO_BADGE } from '$lib/utils/badges';

	let { estado }: { estado: EstadoSolicitud } = $props();
	const badge = $derived(ESTADO_BADGE[estado]);
</script>

<span
	class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset {badge.classes}"
>
	<span class="h-1.5 w-1.5 rounded-full {badge.dot}"></span>
	{badge.label}
</span>
