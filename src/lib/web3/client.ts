import { createPublicClient, http } from 'viem';
import { anvil, sepolia, arbitrumSepolia } from 'viem/chains';
import type { Abi } from 'viem';

// ---------------------------------------------------------------------------
// Chain configuration
//
// VITE_PUBLIC_CHAIN_ID controls which chain is used:
//   31337   → Anvil (local development, default)
//   11155111 → Ethereum Sepolia testnet
//   421614  → Arbitrum Sepolia testnet
// ---------------------------------------------------------------------------

const SUPPORTED_CHAINS = {
	'31337': anvil,
	'11155111': sepolia,
	'421614': arbitrumSepolia
} as const satisfies Record<string, { id: number }>;

type SupportedChainId = keyof typeof SUPPORTED_CHAINS;

const chainId = (import.meta.env.VITE_PUBLIC_CHAIN_ID ?? '31337') as string;

/** The active chain (Anvil / Sepolia / Arbitrum Sepolia) — exported for UI network indicators. */
export const chain = SUPPORTED_CHAINS[chainId as SupportedChainId] ?? anvil;

// Optional: override the chain's default public RPC with a dedicated endpoint.
const rpcUrl: string | undefined = import.meta.env.VITE_PUBLIC_RPC_URL || undefined;

// ---------------------------------------------------------------------------
// Viem public client — read-only, safe to instantiate in the browser.
// ---------------------------------------------------------------------------

export const publicClient = createPublicClient({
	chain,
	transport: http(rpcUrl)
});

// ---------------------------------------------------------------------------
// Contract address
//
// Set VITE_PUBLIC_CONTRACT_ADDRESS to the deployed EcoTraceRegistry address.
// Falls back to an empty string so TypeScript is happy; the verification
// component checks for a missing value before making any RPC calls.
// ---------------------------------------------------------------------------

export const contractAddress = (
	import.meta.env.VITE_PUBLIC_CONTRACT_ADDRESS ?? ''
) as `0x${string}`;

// ---------------------------------------------------------------------------
// Minimal ABI — only the view function used by the public verification UI.
// ---------------------------------------------------------------------------

export const REGISTRY_ABI = [
	{
		name: 'registered',
		type: 'function',
		stateMutability: 'view',
		inputs: [{ name: '', type: 'bytes32' }],
		outputs: [{ name: '', type: 'bool' }]
	}
] as const satisfies Abi;

// ---------------------------------------------------------------------------
// Block-explorer URL helper
//
// Returns the full transaction URL for the given network and txHash,
// or null when running against a local network with no explorer.
// ---------------------------------------------------------------------------

const BLOCK_EXPLORERS: Record<string, string> = {
	'1': 'https://etherscan.io/tx/',
	'11155111': 'https://sepolia.etherscan.io/tx/',
	'137': 'https://polygonscan.com/tx/',
	'80002': 'https://amoy.polygonscan.com/tx/',
	'42161': 'https://arbiscan.io/tx/',
	'421614': 'https://sepolia.arbiscan.io/tx/'
};

export function getExplorerUrl(network: string, txHash: string): string | null {
	const base = BLOCK_EXPLORERS[network];
	return base ? base + txHash : null;
}
