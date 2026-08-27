<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authState } from '$lib/stores/auth.svelte';
	import { ROL_LABEL } from '$lib/auth/roles';
	import { chain } from '$lib/web3/client';
	import type { RolUsuario } from '$lib/types/firestore';

	let { data, children } = $props();

	type NavItem = { href: string; label: string };
	const NAV: Partial<Record<RolUsuario, NavItem[]>> = {
		GENERADOR: [
			{ href: '/dashboard/generador', label: 'Mis solicitudes' },
			{ href: '/dashboard/generador/solicitudes/nueva', label: 'Nueva solicitud' }
		],
		ALMACENADOR_TRANSITORIO: [
			{ href: '/dashboard/almacenador', label: 'Panel' },
			{ href: '/dashboard/generador/solicitudes/nueva', label: 'Nueva solicitud' }
		],
		OPERADOR: [{ href: '/dashboard/operador', label: 'Bandeja / Solicitudes' }],
		ADMIN: [
			{ href: '/dashboard/generador', label: 'Solicitudes' },
			{ href: '/dashboard/generador/solicitudes/nueva', label: 'Nueva solicitud' },
			{ href: '/dashboard/operador', label: 'Operación' },
			{ href: '/dashboard/almacenador', label: 'Almacenador' }
		]
	};

	const items = $derived(NAV[data.user.rol] ?? []);

	async function logout() {
		await authState.logout();
		await goto('/login');
	}

	function activo(href: string): boolean {
		return page.url.pathname === href;
	}
</script>

<div class="min-h-screen">
	<header class="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
		<div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
			<div class="flex items-center gap-3">
				<a href="/dashboard" class="flex items-center gap-2">
					<span
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white"
						>♻</span
					>
					<span class="text-lg font-bold text-slate-900">EcoTrace</span>
				</a>
				<span
					class="hidden items-center gap-1.5 rounded-full border border-chain-100 bg-chain-50 px-2.5 py-1 font-mono text-[11px] font-medium text-chain-700 sm:inline-flex"
					title="Red donde se ancla la evidencia blockchain"
				>
					<span class="relative flex h-1.5 w-1.5">
						<span class="absolute inline-flex h-full w-full rounded-full bg-chain-500 opacity-40"
						></span>
						<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-chain-500"></span>
					</span>
					{chain.name}
				</span>
			</div>
			<div class="flex items-center gap-3">
				<div class="hidden text-right sm:block">
					<p class="text-sm font-medium text-slate-800">{data.user.razonSocial}</p>
					<p class="text-xs text-slate-500">{ROL_LABEL[data.user.rol]}</p>
				</div>
				<button
					onclick={logout}
					class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
					>Salir</button
				>
			</div>
		</div>
		<nav class="mx-auto flex max-w-6xl gap-1 px-2">
			{#each items as item (item.href)}
				<a
					href={item.href}
					class="border-b-2 px-3 py-2 text-sm font-medium transition-colors {activo(item.href)
						? 'border-brand-600 text-brand-700'
						: 'border-transparent text-slate-500 hover:text-slate-800'}"
				>
					{item.label}
				</a>
			{/each}
		</nav>
	</header>

	<main class="mx-auto max-w-6xl px-4 py-8">
		{@render children()}
	</main>
</div>
