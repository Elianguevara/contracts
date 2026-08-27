<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { signInWithEmailAndPassword } from 'firebase/auth';
	import { auth } from '$lib/firebase/client';
	import Button from '$lib/components/ui/Button.svelte';
	import Alert from '$lib/components/ui/Alert.svelte';

	let email = $state('');
	let password = $state('');
	let cargando = $state(false);
	let errorMsg = $state('');

	const paramError = $derived(page.url.searchParams.get('error'));

	async function onsubmit(e: Event) {
		e.preventDefault();
		errorMsg = '';
		cargando = true;
		try {
			const cred = await signInWithEmailAndPassword(auth, email, password);
			const idToken = await cred.user.getIdToken();
			const res = await fetch('/api/session', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ idToken })
			});
			if (!res.ok) throw new Error('server');
			await invalidateAll();
			await goto('/dashboard');
		} catch {
			errorMsg = 'Credenciales inválidas o cuenta deshabilitada.';
		} finally {
			cargando = false;
		}
	}
</script>

<svelte:head><title>Ingresar · EcoTrace</title></svelte:head>

<div
	class="flex min-h-screen items-center justify-center bg-gradient-to-br from-paper to-brand-50 p-4"
>
	<div class="w-full max-w-md">
		<div class="mb-6 text-center">
			<div
				class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 text-xl font-bold text-white shadow-sm"
			>
				♻
			</div>
			<h1 class="text-2xl font-bold text-slate-900">EcoTrace</h1>
			<p class="text-sm text-slate-500">Gestión y Manifiestos de Residuos Peligrosos</p>
		</div>

		<form {onsubmit} class="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			{#if paramError === 'deshabilitado'}
				<Alert variant="warning">Tu cuenta está deshabilitada. Contactá al administrador.</Alert>
			{/if}
			{#if errorMsg}
				<Alert variant="error">{errorMsg}</Alert>
			{/if}

			<label class="block text-sm">
				<span class="mb-1 block font-medium text-slate-700">Email</span>
				<input
					type="email"
					bind:value={email}
					required
					autocomplete="username"
					class="w-full rounded-lg border border-slate-300 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
				/>
			</label>
			<label class="block text-sm">
				<span class="mb-1 block font-medium text-slate-700">Contraseña</span>
				<input
					type="password"
					bind:value={password}
					required
					autocomplete="current-password"
					class="w-full rounded-lg border border-slate-300 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
				/>
			</label>

			<Button type="submit" loading={cargando} fullWidth>
				{cargando ? 'Ingresando…' : 'Ingresar'}
			</Button>
		</form>

		<p class="mt-4 text-center text-xs text-slate-400">
			Los usuarios se dan de alta desde Firebase Auth + colección <code>usuarios</code>.
		</p>
		<p class="mt-2 text-center text-xs">
			<a href="/verificar" class="font-medium text-chain-600 hover:text-chain-700"
				>¿Necesitás verificar un documento? Consultá la blockchain sin iniciar sesión →</a
			>
		</p>
	</div>
</div>
