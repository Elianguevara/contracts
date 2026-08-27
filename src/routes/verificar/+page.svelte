<script lang="ts">
	import PublicVerification from '$lib/components/web3/PublicVerification.svelte';
</script>

<svelte:head><title>Verificación pública · EcoTrace</title></svelte:head>

<div class="min-h-screen bg-paper">
	<header class="border-b border-slate-200 bg-white">
		<div class="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
			<a href="/" class="flex items-center gap-2">
				<span
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white"
					>♻</span
				>
				<span class="text-lg font-bold text-slate-900">EcoTrace</span>
			</a>
			<a href="/login" class="text-sm font-medium text-slate-500 hover:text-slate-800">Ingresar</a>
		</div>
	</header>

	<main class="mx-auto max-w-3xl px-4 py-10">
		<div class="mb-6">
			<h1 class="text-2xl font-bold text-slate-900">Verificación pública de evidencias</h1>
			<p class="mt-1 text-sm text-slate-500">
				Cualquier persona puede confirmar acá si un manifiesto o certificado emitido por EcoTrace
				está efectivamente anclado en la blockchain de Ethereum Sepolia — sin necesitar una cuenta.
			</p>
		</div>

		<PublicVerification />
	</main>
</div>
