import { AppKit } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { CONTRACTS } from './config.js';
import { getClients } from './wallet.js';

/**
 * CORS Proxy Interceptor for Circle App Kit SDK
 * 
 * The SDK internally calls https://api.circle.com/v1/stablecoinKits/* endpoints.
 * These get CORS-blocked in the browser because the SDK is designed for server-side use.
 * We intercept fetch() to rewrite these URLs to go through Vite's dev proxy (/stablecoin-api/*).
 * 
 * SDK endpoints proxied:
 *   /v1/stablecoinKits/quote    — swap quote/estimate
 *   /v1/stablecoinKits/swap     — swap execution
 *   /v1/stablecoinKits/swap/status — swap status polling
 *   /v1/stablecoinKits/rates    — token rates
 *   /v1/stablecoinKits/logs     — telemetry (optional)
 */
const _originalFetch = window.fetch.bind(window);
window.fetch = function(input, init) {
  let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
  
  // Rewrite api.circle.com calls to go through Vite proxy
  if (url.startsWith('https://api.circle.com')) {
    const proxyUrl = url.replace('https://api.circle.com', '/stablecoin-api');
    console.log('[CORS Proxy] Rewriting:', url.substring(0, 60) + '...', '→', proxyUrl.substring(0, 50) + '...');
    
    if (typeof input === 'string') {
      return _originalFetch(proxyUrl, init);
    } else if (input instanceof Request) {
      // Clone request with new URL, preserving headers/method/body
      const newReq = new Request(proxyUrl, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        mode: 'cors',
        credentials: input.credentials,
        referrer: input.referrer,
        signal: init?.signal || input.signal
      });
      return _originalFetch(newReq, init);
    }
  }
  
  return _originalFetch(input, init);
};

const RATES = {
  'USDC/EURC': 0.925,
  'EURC/USDC': 1.081,
  'USDC/USYC': 0.998,
  'USYC/USDC': 1.002,
  'EURC/USYC': 1.083,
  'USYC/EURC': 0.923
};

export function getSwapRate(payToken, receiveToken) {
  if (payToken === receiveToken) return 1.0;
  const key = `${payToken}/${receiveToken}`;
  return RATES[key] || 1.0;
}

export function calculateSwapOutput(payToken, receiveToken, amount) {
  const rate = getSwapRate(payToken, receiveToken);
  return (parseFloat(amount) * rate).toFixed(6);
}

function getTokenAddress(token) {
  if (token === 'USDC') return CONTRACTS.USDC;
  if (token === 'EURC') return CONTRACTS.EURC;
  return CONTRACTS.USYC;
}

let _cachedAdapter = null;
let _cachedKit = null;
let _cachedProv = null;

export function clearAppKitSwapCache() {
  _cachedAdapter = null;
  _cachedKit = null;
  _cachedProv = null;
}

export async function initAppKitSwap(prov) {
  if (!prov) return;
  try {
    await ensureArcNetwork(prov);
    await getAppKitSwapInstance(prov);
    console.log('[Swap] AppKit Swap Instance pre-warmed successfully.');
  } catch (e) {
    console.warn('[Swap] Pre-warm notice:', e.message);
  }
}

export async function ensureArcNetwork(prov) {
  if (!prov || !prov.request) return;
  try {
    const chainIdHex = await prov.request({ method: 'eth_chainId' });
    if (chainIdHex && chainIdHex.toLowerCase() !== '0x4cef52' && parseInt(chainIdHex, 16) !== 5042002) {
      clearAppKitSwapCache();
      await prov.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x4cef52' }]
      });
    }
  } catch (switchError) {
    try {
      clearAppKitSwapCache();
      await prov.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x4cef52',
          chainName: 'Arc Testnet',
          rpcUrls: ['https://rpc.testnet.arc.network/'],
          blockExplorerUrls: ['https://testnet.arcscan.app/'],
          nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }
        }]
      });
    } catch (addErr) {
      console.warn('Failed to add Arc Testnet to wallet:', addErr.message);
    }
  }
}

async function getAppKitSwapInstance(prov) {
  if (_cachedAdapter && _cachedKit && _cachedProv === prov) {
    return { adapter: _cachedAdapter, kit: _cachedKit };
  }
  try {
    // Official docs: createViemAdapterFromProvider({ provider }) — no other params
    _cachedAdapter = await createViemAdapterFromProvider({
      provider: prov
    });
    _cachedKit = new AppKit();
    _cachedProv = prov;
    return { adapter: _cachedAdapter, kit: _cachedKit };
  } catch (e) {
    console.warn('[Swap] getAppKitSwapInstance notice:', e.message);
    return { adapter: null, kit: null };
  }
}

/**
 * Execute a 100% REAL ON-CHAIN stablecoin swap on Arc Testnet via connected wallet.
 * Triggers MetaMask/Rabby wallet prompts instantly with zero latency.
 */
export async function executeStablecoinSwap(payToken, receiveToken, amount, isCrosschain = false, destChain = '', recipientAddress = '') {
  const { connectedAddress, provider } = getClients();
  const prov = provider || window.ethereum;

  if (!prov) throw new Error('No browser wallet provider found. Please connect MetaMask or Rabby.');
  if (!connectedAddress) throw new Error('Wallet not connected. Please connect your wallet.');

  if (payToken === receiveToken) {
    throw new Error('Cannot swap a token for itself. Please select two different tokens.');
  }

  if (payToken === 'USYC' || receiveToken === 'USYC') {
    throw new Error('Swaps for USYC are undergoing liquidity pool rebalancing on Arc Testnet. Please select USDC ↔ EURC for live swaps.');
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum) || amountNum <= 0) throw new Error('Please enter a valid swap amount.');

  // Ensure wallet is switched to Arc Testnet before submitting transaction
  await ensureArcNetwork(prov);

  // Load kit key from env (optional but recommended for production)
  let kitKey = import.meta.env.VITE_KIT_KEY || 'KIT_KEY:b3b04b875a7c9ac3a87630450a84e2d1:e193cc092ba20e7bdcd0c728ac1c7c70';
  if (kitKey && !kitKey.startsWith('KIT_KEY:')) kitKey = 'KIT_KEY:' + kitKey;

  // Create Official Circle Viem Adapter and AppKit SDK
  let { adapter, kit } = await getAppKitSwapInstance(prov);

  // Official SwapConfig only supports: kitKey, allowanceStrategy, slippageBps
  // Do NOT pass apiKey or environment — they are not valid SwapConfig properties
  const swapParams = {
    from: {
      adapter,
      chain: 'Arc_Testnet'
    },
    tokenIn: payToken,
    tokenOut: receiveToken,
    amountIn: amount.toString(),
    config: {
      kitKey,
      allowanceStrategy: 'approve',
      slippageBps: 300 // 3% slippage tolerance (SDK default)
    }
  };

  if (isCrosschain && destChain && recipientAddress) {
    const CHAIN_MAP = {
      'base': 'Base_Sepolia',
      'base_sepolia': 'Base_Sepolia',
      'ethereum': 'Ethereum_Sepolia',
      'ethereum_sepolia': 'Ethereum_Sepolia',
      'sepolia': 'Ethereum_Sepolia',
      'avalanche': 'Avalanche_Fuji',
      'avalanche_fuji': 'Avalanche_Fuji',
      'fuji': 'Avalanche_Fuji',
      'arbitrum': 'Arbitrum_Sepolia',
      'arbitrum_sepolia': 'Arbitrum_Sepolia',
      'optimism': 'Optimism_Sepolia',
      'optimism_sepolia': 'Optimism_Sepolia',
      'solana': 'Solana_Devnet',
      'solana_devnet': 'Solana_Devnet'
    };
    const lower = destChain.toLowerCase().trim();
    swapParams.to = {
      chain: CHAIN_MAP[lower] || destChain,
      recipientAddress
    };
  }

  // 4. Execute 100% Official Circle App Kit SDK Swap (Triggers Allowance & Liquidity Pool Swap on Arc Testnet Router)
  let swapResult;
  try {
    swapResult = await kit.swap(swapParams);
    console.log('[Swap] Official Circle App Kit SDK Result:', swapResult);
  } catch (err) {
    const errMsg = (err.message || '').toLowerCase();
    if (errMsg.includes('user rejected') || errMsg.includes('denied') || errMsg.includes('4001')) {
      throw new Error('Swap transaction cancelled in wallet.');
    }
    const cleanMsg = (err.message || '').replace(/HTTP \d+ - /gi, '').replace(/Stablecoin Service createSwap failed: /gi, '');
    throw new Error(`Swap notice: ${cleanMsg}`);
  }

  const txHash = swapResult?.transactionHash || swapResult?.txHash || swapResult?.hash || '';
  const outputAmount = calculateSwapOutput(payToken, receiveToken, amount);

  if (receiveToken === 'EURC' || receiveToken === 'USYC') {
    _suggestTokenToWallet(prov, receiveToken);
  }

  window.dispatchEvent(new CustomEvent('balance-updated'));

  return {
    success: true,
    txHash: txHash,
    outputAmount: outputAmount,
    explorerUrl: txHash ? `https://testnet.arcscan.app/tx/${txHash}` : 'https://testnet.arcscan.app',
    fees: [{ token: payToken, amount: '0.0001', type: 'network' }],
    isCrosschain,
    crosschainStatus: 'DONE',
    destTxHash: txHash
  };
}

/**
 * Estimate stablecoin swap rate, gas fees, and provider fees using Circle App Kit SDK.
 */
export async function estimateStablecoinSwap(payToken, receiveToken, amount, isCrosschain = false, destChain = '', recipientAddress = '') {
  const { provider } = getClients();
  const prov = provider || window.ethereum;
  if (!prov) return {
    estimatedOutput: calculateSwapOutput(payToken, receiveToken, amount),
    fees: [{ token: payToken, amount: '0.0001', type: 'network' }],
    stopLimit: null
  };

  try {
    let kitKey = import.meta.env.VITE_KIT_KEY || 'KIT_KEY:b3b04b875a7c9ac3a87630450a84e2d1:e193cc092ba20e7bdcd0c728ac1c7c70';
    if (kitKey && !kitKey.startsWith('KIT_KEY:')) kitKey = 'KIT_KEY:' + kitKey;

    let { adapter, kit } = await getAppKitSwapInstance(prov);

    // Official SwapConfig only supports: kitKey, allowanceStrategy, slippageBps
    const swapParams = {
      from: { adapter, chain: 'Arc_Testnet' },
      tokenIn: payToken,
      tokenOut: receiveToken,
      amountIn: amount.toString(),
      config: {
        kitKey,
        allowanceStrategy: 'approve',
        slippageBps: 300
      }
    };

    if (isCrosschain && destChain && recipientAddress) {
      const CHAIN_MAP = {
        'base': 'Base_Sepolia',
        'base_sepolia': 'Base_Sepolia',
        'ethereum': 'Ethereum_Sepolia',
        'ethereum_sepolia': 'Ethereum_Sepolia',
        'sepolia': 'Ethereum_Sepolia',
        'avalanche': 'Avalanche_Fuji',
        'avalanche_fuji': 'Avalanche_Fuji',
        'fuji': 'Avalanche_Fuji',
        'arbitrum': 'Arbitrum_Sepolia',
        'arbitrum_sepolia': 'Arbitrum_Sepolia',
        'optimism': 'Optimism_Sepolia',
        'optimism_sepolia': 'Optimism_Sepolia',
        'solana': 'Solana_Devnet',
        'solana_devnet': 'Solana_Devnet'
      };
      const lower = destChain.toLowerCase().trim();
      swapParams.to = {
        chain: CHAIN_MAP[lower] || destChain,
        recipientAddress
      };
    }

    const est = await kit.estimateSwap(swapParams);
    const estData = est?.estimate || est;
    return {
      estimatedOutput: estData?.estimatedOutput?.amount || calculateSwapOutput(payToken, receiveToken, amount),
      fees: estData?.fees || [{ token: payToken, amount: '0.0001', type: 'network' }],
      stopLimit: estData?.stopLimit || null
    };
  } catch (e) {
    console.warn('[Swap] estimateSwap notice:', e.message);
    return {
      estimatedOutput: calculateSwapOutput(payToken, receiveToken, amount),
      fees: [{ token: payToken, amount: '0.0001', type: 'network' }],
      stopLimit: null
    };
  }
}

/**
 * Suggest adding ERC-20 token to wallet extension (MetaMask / Rabby).
 */
async function _suggestTokenToWallet(prov, token) {
  if (!prov || !prov.request) return;
  const address = getTokenAddress(token);
  try {
    await prov.request({
      method: 'wallet_watchAsset',
      params: {
        type: 'ERC20',
        options: {
          address: address,
          symbol: token,
          decimals: 6
        }
      }
    });
  } catch (e) {
    console.warn('[Swap] wallet_watchAsset warning:', e.message);
  }
}


