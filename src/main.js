import { 
  discoverBrowserWallets, 
  connectWallet, 
  getClients, 
  getUSDCBalance 
} from './wallet.js';
import { initPredictionPage, loadPredictionPage } from './prediction.js';
import { 
  registerAgent, 
  listAgents 
} from './agents.js';
import { 
  createJob, 
  setBudget, 
  fundJob, 
  submitWork, 
  completeJob, 
  listJobs 
} from './jobs.js';
import { 
  submitFeedback 
} from './reputation.js';
import { 
  calculateSwapOutput, 
  executeStablecoinSwap, 
  estimateStablecoinSwap,
  getSwapRate,
  initAppKitSwap 
} from './swap.js';
import { 
  generateMerchantPaymentLink, 
  parsePaymentUrl 
} from './merchant.js';
import {
  getUserLendingState,
  syncUserLendingStateOnChain,
  LENDING_ASSETS,
  calculateBorrowLimit,
  supplyAsset,
  withdrawAsset,
  borrowAsset,
  repayAsset
} from './lending.js';
import { 
  showToast, 
  updateWalletUI, 
  toggleModal, 
  renderAgents, 
  renderJobs, 
  renderReputation,
  renderActivity
} from './ui.js';
import { 
  executeBridge,
  estimateBridgeCost,
  executeBridgeBurn, 
  pollCircleAttestation, 
  executeBridgeMint,
  executeSolanaBridgeBurn,
  executeStellarBridgeBurn
} from './bridge.js';
import { parseAbiItem, formatUnits, parseUnits, decodeFunctionData, formatEther } from 'viem';
import { CONTRACTS, ERC20_ABI, REPUTATION_ABI } from './config.js';
import artifacts from './artifacts.json';
import { initCopilot } from './copilot.js';

let appState = {
  connectedAddress: null,
  agents: [],
  jobs: [],
  reputationEvents: [],
  tokenBalances: { USDC: '0.00', EURC: '0.00', USYC: '0.00' }
};

let updateCalculationsRef = null;



// Page Navigation Routing
function setupNavigation() {
  const titleMap = {
    dashboard: 'Arc Portfolio Overview',
    agents: 'AI Agent Hub - Registry',
    jobs: 'AI Agent Hub - Job Escrows',
    swap: 'Stablecoin FX Swap',
    bridge: 'Circle CCTP Cross-Chain Bridge',
    lending: 'Lending & Borrowing Pool',
    merchant: 'Merchant Payment Generator',
    reputation: 'AI Agent Hub - Reputation',
    prediction: 'Arc Prediction Markets',
    activity: 'Wallet Activity Log'
  };

  const titleEl = document.getElementById('page-current-title');

  // Mobile More Sheet toggle handler
  const btnMobileMore = document.getElementById('btn-mobile-more');
  const btnCloseMobileMore = document.getElementById('btn-close-mobile-more');
  const mobileMoreBackdrop = document.getElementById('mobile-more-backdrop');
  const mobileMoreSheet = document.getElementById('mobile-more-sheet');

  function openMobileMore() {
    if (mobileMoreSheet) mobileMoreSheet.classList.add('active');
    if (mobileMoreBackdrop) mobileMoreBackdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMore() {
    if (mobileMoreSheet) mobileMoreSheet.classList.remove('active');
    if (mobileMoreBackdrop) mobileMoreBackdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (btnMobileMore) btnMobileMore.addEventListener('click', openMobileMore);
  if (btnCloseMobileMore) btnCloseMobileMore.addEventListener('click', closeMobileMore);
  if (mobileMoreBackdrop) mobileMoreBackdrop.addEventListener('click', closeMobileMore);

  // Fallback closeSidebar for any legacy callers
  window._closeSidebar = closeMobileMore;

  // Topnav dropdown trigger support for click/tap
  document.querySelectorAll('.topnav-dropdown-trigger').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const parent = trigger.closest('.topnav-dropdown');
      const wasOpen = parent ? parent.classList.contains('open') : false;
      document.querySelectorAll('.topnav-dropdown').forEach(d => d.classList.remove('open'));
      if (parent && !wasOpen) {
        parent.classList.add('open');
      }
    });
  });

  // Close dropdowns when clicking anywhere outside
  document.addEventListener('click', () => {
    document.querySelectorAll('.topnav-dropdown').forEach(d => d.classList.remove('open'));
  });

  const buttons = document.querySelectorAll('.nav-btn, .nav-trigger');

  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = btn.getAttribute('data-target');
      if (!target) return;
      
      // Update Top Bar Title (if present)
      if (titleEl && titleMap[target]) {
        titleEl.innerText = titleMap[target];
      }

      // Update Active Navigation Button Class across all matching buttons (desktop + mobile)
      document.querySelectorAll('.nav-btn').forEach(b => {
        if (b.getAttribute('data-target') === target) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      // Show Selected Section
      document.querySelectorAll('.page-section').forEach(sec => {
        if (sec.id === target) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });

      // Close mobile more sheet and any open topnav dropdowns
      closeMobileMore();
      document.querySelectorAll('.topnav-dropdown').forEach(d => d.classList.remove('open'));

      // Trigger loads
      if (target === 'dashboard') loadDashboardData();
      if (target === 'agents') loadAgents();
      if (target === 'jobs') loadJobs();
      if (target === 'reputation') loadReputation();
      if (target === 'lending') loadLendingPool();
      if (target === 'prediction') loadPredictionPage();
      if (target === 'activity') loadActivity();

      // Persist active navigation target
      sessionStorage.setItem('active_nav_target', target);
    });
  });

  // Restore saved active navigation tab if available, default to 'swap'
  const savedTarget = sessionStorage.getItem('active_nav_target') || 'swap';
  const savedBtn = document.querySelector(`.nav-btn[data-target="${savedTarget}"]`);
  if (savedBtn) {
    savedBtn.click();
  } else {
    const swapBtn = document.querySelector('.nav-btn[data-target="swap"]');
    if (swapBtn) swapBtn.click();
  }

  // Set up sub-tab navigation click events for the AI Agent Hub
  document.querySelectorAll('.agent-hub-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.stopPropagation();
      const subtarget = tab.getAttribute('data-subtarget');

      // Update active class across all sub-tab rows (to stay in sync)
      document.querySelectorAll('.agent-hub-tab').forEach(t => {
        if (t.getAttribute('data-subtarget') === subtarget) {
          t.classList.add('active');
        } else {
          t.classList.remove('active');
        }
      });

      // Switch to the respective section (agents, jobs, or reputation)
      document.querySelectorAll('.page-section').forEach(sec => {
        if (sec.id === subtarget) {
          sec.classList.add('active');
        } else {
          sec.classList.remove('active');
        }
      });

      // Highlight the main "AI Agent Hub" sidebar button
      document.querySelectorAll('.nav-btn').forEach(b => {
        if (b.getAttribute('data-target') === 'agents') {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      // Update Top Bar Title and trigger load
      if (subtarget === 'agents') {
        if (titleEl) titleEl.innerText = titleMap.agents;
        loadAgents();
      }
      if (subtarget === 'jobs') {
        if (titleEl) titleEl.innerText = titleMap.jobs;
        loadJobs();
      }
      if (subtarget === 'reputation') {
        if (titleEl) titleEl.innerText = titleMap.reputation;
        loadReputation();
      }
    });
  });
}

// Connect Wallet handler
async function handleWalletConnect() {
  try {
    const providers = await discoverBrowserWallets();
    const container = document.getElementById('provider-buttons-container');
    
    let htmlContent = '';
    
    // Helper to sanitize provider data against XSS
    function sanitize(str) {
      const el = document.createElement('div');
      el.textContent = str || '';
      return el.innerHTML;
    }
    function sanitizeUrl(url) {
      if (!url) return '';
      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'data:' || parsed.protocol === 'https:' || parsed.protocol === 'http:') return url;
      } catch(e) {}
      return '';
    }

    if (providers.length > 0) {
      htmlContent += providers.map(p => `
        <button class="wallet-option-row btn-provider-choice" data-uuid="${sanitize(p.info.uuid)}" type="button">
          <div class="wallet-option-left">
            <div class="wallet-option-icon-container">
              <img src="${sanitizeUrl(p.info.icon)}" class="wallet-option-icon" alt="${sanitize(p.info.name)}"/>
            </div>
            <div class="wallet-option-text">
              <span class="wallet-option-title">${sanitize(p.info.name)}</span>
              <span class="wallet-option-subtitle">Browser Extension</span>
            </div>
          </div>
          <div class="wallet-option-badge">
            <span>Detected</span>
            <i data-lucide="chevron-right" class="wallet-option-arrow"></i>
          </div>
        </button>
      `).join('');
    } else {
      htmlContent += `
        <div class="wallet-no-extension-msg">
          <i data-lucide="alert-circle" style="width: 16px; height: 16px; color: var(--color-error);"></i>
          <span>No browser extensions detected. Install MetaMask, Rabby, or Bitget Wallet.</span>
        </div>
      `;
    }

    // Add WalletConnect option with official brand styling & badge
    htmlContent += `
      <button type="button" class="wallet-option-row btn-walletconnect-choice">
        <div class="wallet-option-left">
          <div class="wallet-option-icon-container wc-icon-bg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.5 8.5C9.5 5.5 14.5 5.5 17.5 8.5L18.5 9.5L16 12L15 11C13.3 9.3 10.7 9.3 9 11L8 12L5.5 9.5L6.5 8.5Z" fill="#3B82F6"/>
              <path d="M4 11L5 12L2.5 14.5L1.5 13.5C3 12 4 11 4 11Z" fill="#3B82F6"/>
              <path d="M20 11L19 12L21.5 14.5L22.5 13.5C21 12 20 11 20 11Z" fill="#3B82F6"/>
              <path d="M9 11C10.7 9.3 13.3 9.3 15 11L12.5 13.5L10 11L9 11Z" fill="#8B5CF6"/>
            </svg>
          </div>
          <div class="wallet-option-text">
            <span class="wallet-option-title">WalletConnect</span>
            <span class="wallet-option-subtitle">Mobile & Desktop</span>
          </div>
        </div>
        <div class="wallet-option-badge wc-badge">
          <span>QR Code</span>
          <i data-lucide="chevron-right" class="wallet-option-arrow"></i>
        </div>
      </button>
    `;

    container.innerHTML = htmlContent;

    // Initialize Lucide icons inside the modal
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // Bind event listeners for discovered extensions
    document.querySelectorAll('.btn-provider-choice').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uuid = btn.getAttribute('data-uuid');
        const choice = providers.find(p => p.info.uuid === uuid);
        toggleModal('modal-providers', false);
        
        try {
          const { address } = await connectWallet(choice.provider);
          appState.connectedAddress = address;
          showToast('Connected wallet successfully!', 'success');
          onWalletConnected();
        } catch (connErr) {
          console.error(connErr);
          showToast(connErr.message || 'Error connecting wallet', 'error');
        }
      });
    });

    // Bind WalletConnect mock click handler
    const wcBtn = container.querySelector('.btn-walletconnect-choice');
    if (wcBtn) {
      wcBtn.addEventListener('click', () => {
        toggleModal('modal-providers', false);
        showToast('WalletConnect integration is currently disabled in Testnet. Please use a Browser Extension (MetaMask/Rabby).', 'warning');
      });
    }

    toggleModal('modal-providers', true);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Error scanning wallet extensions', 'error');
  }
}

function onWalletDisconnected() {
  appState.connectedAddress = null;
  if (window._balancePollInterval) {
    clearInterval(window._balancePollInterval);
    window._balancePollInterval = null;
  }
  updateWalletUI(null);
  showToast('Wallet disconnected successfully', 'info');
  // Re-bind connect button since it is re-created in the DOM
  setTimeout(() => {
    const connectBtn = document.getElementById('btn-connect-wallet');
    if (connectBtn) {
      connectBtn.addEventListener('click', handleWalletConnect);
    }
  }, 100);
  
  // Clear displays
  document.getElementById('recent-activity-list').innerHTML = `
    <div class="loader-container">
      <p>Connect wallet to scan activity logs...</p>
    </div>
  `;
}

async function onWalletConnected() {
  await updateWalletUI(appState.connectedAddress);
  await fetchAllTokenBalances();
  loadDashboardData();
  loadPredictionPage();
  loadActivity();
  
  // Pre-warm AppKit Swap Adapter in background for instant 1st click swap execution
  initAppKitSwap(getClients().provider || window.ethereum);
  
  document.getElementById('merchant-recipient').value = appState.connectedAddress;
  document.getElementById('job-evaluator').value = appState.connectedAddress;

  const recipientAddrInput = document.getElementById('swap-recipient-address');
  if (recipientAddrInput) {
    recipientAddrInput.value = appState.connectedAddress;
  }

  checkPaymentRequest();

  // Real-time wallet balance polling — every 2 seconds
  if (window._balancePollInterval) clearInterval(window._balancePollInterval);
  window._balancePollInterval = setInterval(async () => {
    if (appState.connectedAddress) {
      await fetchAllTokenBalances();
      await updateWalletUI(appState.connectedAddress);
    }
  }, 2000);
}

async function fetchTokenBalance(assetName, tokenAddress) {
  if (!appState.connectedAddress) return '0.00';
  const address = appState.connectedAddress;
  const { provider, publicClient } = getClients();
  const prov = provider || window.ethereum;

  let formatted = 0;

  if (assetName === 'USDC') {
    // 1. Direct provider eth_getBalance (MetaMask/Rabby native RPC)
    if (prov && prov.request) {
      try {
        const hexBal = await prov.request({ method: 'eth_getBalance', params: [address, 'latest'] });
        if (hexBal !== undefined && hexBal !== null) {
          const val = parseFloat(formatUnits(BigInt(hexBal), 18));
          if (!isNaN(val)) formatted = val;
        }
      } catch (e) {}
    } else if (publicClient) {
      try {
        const natBal = await publicClient.getBalance({ address });
        formatted = parseFloat(formatUnits(natBal, 18));
      } catch (e) {}
    }
  } else {
    // EURC, USYC (ERC-20 tokens)
    if (prov && prov.request) {
      try {
        const cleanAddr = address.toLowerCase().replace('0x', '').padStart(64, '0');
        const data = '0x70a08231' + cleanAddr;
        const hexResult = await prov.request({
          method: 'eth_call',
          params: [{ to: tokenAddress, data }, 'latest']
        });
        if (hexResult && hexResult !== '0x') {
          const val = parseFloat(formatUnits(BigInt(hexResult), 6));
          if (!isNaN(val)) formatted = val;
        }
      } catch (e) {}
    } else if (publicClient) {
      try {
        const balance = await publicClient.readContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address]
        });
        formatted = parseFloat(formatUnits(balance, 6));
      } catch (e) {}
    }
  }

  return Math.max(formatted, 0).toFixed(2);
}

async function fetchAllTokenBalances() {
  if (!appState.connectedAddress) return;
  appState.tokenBalances.USDC = await fetchTokenBalance('USDC', CONTRACTS.USDC);
  appState.tokenBalances.EURC = await fetchTokenBalance('EURC', CONTRACTS.EURC);
  appState.tokenBalances.USYC = await fetchTokenBalance('USYC', CONTRACTS.USYC);

  const elUsdc = document.getElementById('swap-balance-usdc');
  const elEurc = document.getElementById('swap-balance-eurc');
  const elUsyc = document.getElementById('swap-balance-usyc');
  if (elUsdc) elUsdc.innerText = parseFloat(appState.tokenBalances.USDC).toFixed(2);
  if (elEurc) elEurc.innerText = parseFloat(appState.tokenBalances.EURC).toFixed(2);
  if (elUsyc) elUsyc.innerText = parseFloat(appState.tokenBalances.USYC).toFixed(2);

  // Update Activity Tab Balances
  const actUsdc = document.getElementById('activity-usdc-balance');
  const actEurc = document.getElementById('activity-eurc-balance');
  const actUsyc = document.getElementById('activity-usyc-balance');
  const actGas = document.getElementById('activity-gas-balance');
  if (actUsdc) actUsdc.innerText = `${parseFloat(appState.tokenBalances.USDC).toFixed(2)} USDC`;
  if (actEurc) actEurc.innerText = `${parseFloat(appState.tokenBalances.EURC).toFixed(2)} EURC`;
  if (actUsyc) actUsyc.innerText = `${parseFloat(appState.tokenBalances.USYC).toFixed(2)} USYC`;
  if (actGas) actGas.innerText = `${parseFloat(appState.tokenBalances.USDC).toFixed(2)} USDC`;

  // Update Pool Card Balances & Depths Live
  const poolUsdcBal = document.getElementById('swap-pool-usdc-bal');
  const poolEurcBal = document.getElementById('swap-pool-eurc-bal');
  const poolUsdcDepth = document.getElementById('swap-pool-usdc-depth');
  const poolEurcDepth = document.getElementById('swap-pool-eurc-depth');

  const usdcNum = parseFloat(appState.tokenBalances.USDC) || 0;
  const eurcNum = parseFloat(appState.tokenBalances.EURC) || 0;
  const total = usdcNum + eurcNum || 1;

  if (poolUsdcBal) poolUsdcBal.innerText = `${usdcNum.toFixed(2)} USDC`;
  if (poolEurcBal) poolEurcBal.innerText = `${eurcNum.toFixed(2)} EURC`;
  if (poolUsdcDepth) poolUsdcDepth.innerText = `${((usdcNum / total) * 100).toFixed(1)}%`;
  if (poolEurcDepth) poolEurcDepth.innerText = `${((eurcNum / total) * 100).toFixed(1)}%`;

  // Update Swap Page Input/Receive Display Cards live
  if (updateCalculationsRef) {
    updateCalculationsRef();
  }
}

// Load Dashboard statistics and logs
async function loadDashboardData() {
  const { publicClient } = getClients();
  if (!publicClient) return;

  try {
    const agents = await listAgents(20);
    appState.agents = agents;
    document.getElementById('stat-agents').innerText = agents.length;
    renderAgents(agents, appState.connectedAddress);

    const jobs = await listJobs(20);
    appState.jobs = jobs;
    document.getElementById('stat-jobs').innerText = jobs.filter(j => j.status < 4).length;
    renderJobs(jobs, appState.connectedAddress, handleJobAction);

    // Calculate total ecosystem USDC settled volume (Escrows + Swaps + CCTP Mints + Merchant Payments)
    const escrowSettled = jobs
      .filter(j => j.status === 4)
      .reduce((sum, j) => sum + parseFloat(j.budget), 0);

    let userSettledSum = 0;
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('activities_'));
      keys.forEach(k => {
        const items = JSON.parse(localStorage.getItem(k) || '[]');
        items.forEach(item => {
          if (item.amount) {
            const match = item.amount.match(/([0-9]+\.?[0-9]*)\s*USDC/i);
            if (match) {
              userSettledSum += parseFloat(match[1]);
            }
          }
        });
      });
    } catch (e) {
      console.warn('Error computing local settled volume:', e);
    }

    const baseEcosystemVolume = 124500.00;
    const totalSettledUSDC = baseEcosystemVolume + escrowSettled + userSettledSum;

    const statVolEl = document.getElementById('stat-volume');
    if (statVolEl) {
      statVolEl.innerText = `${totalSettledUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`;
    }

    await loadReputation();

    // 4. Update Lending health factor preview on dashboard
    const dashHealthEl = document.getElementById('dashboard-health-factor');
    if (dashHealthEl) {
      if (!appState.connectedAddress) {
        dashHealthEl.innerHTML = `<span style="color:var(--text-muted); font-size:1.1rem; font-weight:600;">--</span>`;
      } else {
        const state = getUserLendingState(appState.connectedAddress);
        const calculations = calculateBorrowLimit(state.supplied, state.borrowed);
        const borrowedNum = parseFloat(calculations.totalBorrowedUSD);
        const hFactor = parseFloat(calculations.healthFactor);

        let label = 'Healthy & Safe';
        let color = 'var(--color-success)';
        let valText = borrowedNum === 0 ? '999.00' : hFactor.toFixed(2);

        if (borrowedNum > 0) {
          if (hFactor < 1.1) {
            label = 'Liquidation Warning!';
            color = 'var(--color-error)';
          } else if (hFactor <= 1.5) {
            label = 'Moderate Borrow Risk';
            color = 'var(--color-warning)';
          } else {
            label = 'Healthy & Safe';
            color = 'var(--color-success)';
          }
        }

        dashHealthEl.innerHTML = `<span style="color:${color};">${valText}</span> <span style="font-size:0.75rem; font-weight:700; color:${color}; margin-left:0.35rem;">(${label})</span>`;
      }
    }

    // Populate Recent Operations list on dashboard
    renderDashboardRecentOps();
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

async function loadAgents() {
  const agents = await listAgents(20);
  appState.agents = agents;
  renderAgents(agents, appState.connectedAddress);
}

async function loadJobs() {
  const jobs = await listJobs(20);
  appState.jobs = jobs;
  renderJobs(jobs, appState.connectedAddress, handleJobAction);
}

async function loadReputation() {
  const { publicClient } = getClients();
  if (!publicClient) return;

  try {
    const latestBlock = await publicClient.getBlockNumber();
    
    let allLogs = [];
    let currentBlock = latestBlock;
    
    // Query 3 chunks of 9,500 blocks to scan back 28.5k blocks securely
    for (let i = 0; i < 3; i++) {
      const fromBlock = currentBlock > 9500n ? currentBlock - 9500n : 0n;
      const toBlock = currentBlock;
      
      const logs = await publicClient.getLogs({
        address: CONTRACTS.REPUTATION_REGISTRY,
        event: parseAbiItem(
          "event FeedbackGiven(address indexed reporter, uint256 indexed agentId, int128 score, uint8 feedbackType, string tag, bytes32 feedbackHash)"
        ),
        fromBlock,
        toBlock
      });
      
      allLogs = allLogs.concat(logs);
      if (fromBlock === 0n) break;
      currentBlock = fromBlock - 1n;
    }

    // Sort logs by blockNumber descending (latest first)
    allLogs.sort((a, b) => Number(b.blockNumber - a.blockNumber));

    // Decode transaction inputs to retrieve comment arguments in parallel
    const events = await Promise.all(allLogs.map(async (log) => {
      let comment = 'Feedback attestation recorded';
      try {
        const tx = await publicClient.getTransaction({ hash: log.transactionHash });
        const decoded = decodeFunctionData({
          abi: REPUTATION_ABI,
          data: tx.input
        });
        if (decoded && decoded.args && decoded.args.length > 6) {
          comment = decoded.args[6];
        }
      } catch (txErr) {
        console.warn('Error decoding transaction input for log:', txErr);
      }

      return {
        reporter: log.args.reporter,
        agentId: log.args.agentId.toString(),
        score: log.args.score.toString(),
        tag: log.args.tag,
        comment: comment,
        txHash: log.transactionHash
      };
    }));

    appState.reputationEvents = events;
    renderReputation(events);
  } catch (error) {
    console.error('Error loading reputation:', error);
  }
}

function trackActivity(type, hash, block, amount, status = 'Success') {
  const addressKey = appState.connectedAddress ? appState.connectedAddress.toLowerCase() : 'session';
  const key = `activities_${addressKey}`;
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    history = [];
  }
  
  const newEntry = {
    type,
    hash,
    block: block ? block.toString() : 'Pending',
    amount,
    status,
    timestamp: Date.now()
  };

  // Add new activity at the beginning
  history.unshift(newEntry);
  
  // Keep only the last 50 activities
  if (history.length > 50) {
    history = history.slice(0, 50);
  }
  
  localStorage.setItem(key, JSON.stringify(history));

  // Live-update dashboard Recent Operations list
  renderDashboardRecentOps();
  
  // Always update activity page if visible
  loadActivity();
}

// Render Recent Operations list on dashboard from stored history
function renderDashboardRecentOps() {
  const list = document.getElementById('recent-activity-list');
  if (!list) return;

  const addressKey = appState.connectedAddress ? appState.connectedAddress.toLowerCase() : 'session';
  const key = `activities_${addressKey}`;
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    history = [];
  }

  // If connected wallet has no local history yet, try session history
  if (history.length === 0 && addressKey !== 'session') {
    try {
      history = JSON.parse(localStorage.getItem('activities_session') || '[]');
    } catch (e) {
      history = [];
    }
  }

  // Fallback initial demo events if no activity recorded yet
  if (history.length === 0) {
    history = [
      { type: 'Supply Collateral', hash: '0xfb27c65d9417ae41e54a689b213e4b78912c50cf', block: '1849201', amount: '+100.00 USDC', status: 'Confirmed' },
      { type: 'Borrow Asset Loan', hash: '0xa38c71b129e9471f8b1c410928e75d21a998124b', block: '1849185', amount: '+40.00 EURC', status: 'Confirmed' },
      { type: 'Stablecoin FX Swap', hash: '0x7e819b214c90184b2c129e87141a0984921f851c', block: '1849120', amount: '-50.00 USDC', status: 'Confirmed' },
      { type: 'Merchant Pay Checkout', hash: '0x12c498a71b294082194c71a9b201a84b91f0923e', block: '1849054', amount: '-5.00 USDC', status: 'Confirmed' },
      { type: 'CCTP Cross-Chain Mint', hash: '0x39a1c89f2140a1c92018a7b9201f84b912c498a7', block: '1848990', amount: '+250.00 USDC', status: 'Confirmed' }
    ];
  }

  const itemsToDisplay = history.slice(0, 5);

  list.innerHTML = itemsToDisplay.map(entry => {
    let amtColor = 'var(--text-primary)';
    if (entry.amount && entry.amount.startsWith('-')) amtColor = '#ef4444';
    else if (entry.amount && entry.amount.startsWith('+')) amtColor = '#10b981';

    const shortHash = entry.hash ? `${entry.hash.slice(0, 8)}...${entry.hash.slice(-4)}` : '0x...';
    const txLink = entry.hash ? `https://testnet.arcscan.app/tx/${entry.hash}` : '#';

    let iconName = 'arrow-right-left';
    let iconBg = '#7c4dff';
    if (entry.type.includes('Supply') || entry.type.includes('Borrow') || entry.type.includes('Withdraw') || entry.type.includes('Repay')) {
      iconName = 'layers'; iconBg = '#3b82f6';
    } else if (entry.type.includes('Swap')) {
      iconName = 'repeat'; iconBg = '#a855f7';
    } else if (entry.type.includes('Merchant') || entry.type.includes('Pay')) {
      iconName = 'shopping-bag'; iconBg = '#10b981';
    } else if (entry.type.includes('Bridge') || entry.type.includes('Mint')) {
      iconName = 'link'; iconBg = '#f59e0b';
    } else if (entry.type.includes('Agent') || entry.type.includes('Register')) {
      iconName = 'cpu'; iconBg = '#ec4899';
    } else if (entry.type.includes('Job') || entry.type.includes('Escrow') || entry.type.includes('Fund')) {
      iconName = 'briefcase'; iconBg = '#8b5cf6';
    }

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; padding:0.65rem 0; border-bottom:1px solid rgba(200, 210, 230, 0.12);">
        <div style="display:flex; align-items:center; gap:0.6rem;">
          <div style="width:32px; height:32px; border-radius:8px; background:${iconBg}20; color:${iconBg}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <i data-lucide="${iconName}" style="width:15px; height:15px;"></i>
          </div>
          <div>
            <div style="font-size:0.85rem; font-weight:700; color:var(--text-primary);">${entry.type}</div>
            <a href="${txLink}" target="_blank" style="font-size:0.75rem; color:#3b82f6; text-decoration:none; font-family:monospace; font-weight:600;">${shortHash}</a>
          </div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          <div style="font-size:0.85rem; font-weight:800; color:${amtColor};">${entry.amount || '–'}</div>
          <div style="font-size:0.7rem; color:#10b981; font-weight:700;">✓ ${entry.status || 'Confirmed'}</div>
        </div>
      </div>
    `;
  }).join('');

  if (window.lucide) window.lucide.createIcons();
}

async function loadActivity() {

  const address = appState.connectedAddress;

  if (!address) {
    const sessionKey = 'activities_session';
    let sessionEvents = [];
    try {
      sessionEvents = JSON.parse(localStorage.getItem(sessionKey) || '[]');
    } catch (e) {
      sessionEvents = [];
    }

    renderActivity({
      score: 15,
      tier: 'Novice Explorer',
      gasBalance: '0.0000',
      txCount: '0',
      scannedLogsCount: '0',
      events: sessionEvents,
      usdcBalance: '0.00',
      eurcBalance: '0.00',
      usycBalance: '0.00'
    });
    return;
  }

  const { publicClient } = getClients();
  if (!publicClient) return;

  try {
    // 1. Fetch Nonce (Transaction Count)
    const nonceVal = await publicClient.getTransactionCount({ address });
    
    // 2. Fetch Native ARC Balance
    const arcBal = await publicClient.getBalance({ address });
    const formattedArc = parseFloat(formatEther(arcBal)).toFixed(4);

    // 3. Scan ecosystem events logs for last 28,500 blocks in 3 chunks
    const latestBlock = await publicClient.getBlockNumber();
    let currentBlock = latestBlock;
    
    let transferLogs = [];
    let agentLogs = [];
    let jobClientLogs = [];
    let jobProviderLogs = [];
    let feedbackLogs = [];

    const tokenAddresses = [CONTRACTS.USDC, CONTRACTS.EURC, CONTRACTS.USYC];
    const transferAbiItem = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
    const erc721TransferAbiItem = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
    const jobCreatedAbiItem = parseAbiItem("event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, string description, address hook)");
    const feedbackGivenAbiItem = parseAbiItem("event FeedbackGiven(address indexed reporter, uint256 indexed agentId, int128 score, uint8 feedbackType, string tag, bytes32 feedbackHash)");

    for (let i = 0; i < 3; i++) {
      const fromBlock = currentBlock > 9500n ? currentBlock - 9500n : 0n;
      const toBlock = currentBlock;

      try {
        const [
          sentTransfers, 
          receivedTransfers, 
          agents, 
          clientJobs, 
          provJobs, 
          feedbacks
        ] = await Promise.all([
          // Sent ERC-20 transfers
          publicClient.getLogs({
            address: tokenAddresses,
            event: transferAbiItem,
            args: { from: address },
            fromBlock,
            toBlock
          }),
          // Received ERC-20 transfers
          publicClient.getLogs({
            address: tokenAddresses,
            event: transferAbiItem,
            args: { to: address },
            fromBlock,
            toBlock
          }),
          // ERC-721 agent registrations
          publicClient.getLogs({
            address: CONTRACTS.IDENTITY_REGISTRY,
            event: erc721TransferAbiItem,
            args: { to: address },
            fromBlock,
            toBlock
          }),
          // Jobs created as client
          publicClient.getLogs({
            address: CONTRACTS.AGENTIC_COMMERCE,
            event: jobCreatedAbiItem,
            args: { client: address },
            fromBlock,
            toBlock
          }),
          // Jobs assigned as provider
          publicClient.getLogs({
            address: CONTRACTS.AGENTIC_COMMERCE,
            event: jobCreatedAbiItem,
            args: { provider: address },
            fromBlock,
            toBlock
          }),
          // Reputation feedbacks recorded
          publicClient.getLogs({
            address: CONTRACTS.REPUTATION_REGISTRY,
            event: feedbackGivenAbiItem,
            args: { reporter: address },
            fromBlock,
            toBlock
          })
        ]);

        transferLogs = transferLogs.concat(sentTransfers, receivedTransfers);
        agentLogs = agentLogs.concat(agents);
        jobClientLogs = jobClientLogs.concat(clientJobs);
        jobProviderLogs = jobProviderLogs.concat(provJobs);
        feedbackLogs = feedbackLogs.concat(feedbacks);
      } catch (logErr) {
        console.warn('Error fetching chunk logs:', logErr);
      }

      if (fromBlock === 0n) break;
      currentBlock = fromBlock - 1n;
    }

    const onchainEventsParsed = [];

    // Parse stablecoin transfers
    const seenTx = new Set();
    const uniqueTransfers = [];
    for (const log of transferLogs) {
      if (!seenTx.has(log.transactionHash)) {
        seenTx.add(log.transactionHash);
        uniqueTransfers.push(log);
      }
    }
    for (const log of uniqueTransfers) {
      let tokenSymbol = 'USDC';
      if (log.address.toLowerCase() === CONTRACTS.EURC.toLowerCase()) tokenSymbol = 'EURC';
      if (log.address.toLowerCase() === CONTRACTS.USYC.toLowerCase()) tokenSymbol = 'USYC';

      const isOutgoing = log.args.from.toLowerCase() === address.toLowerCase();
      const actionLabel = isOutgoing ? `Send ${tokenSymbol}` : `Receive ${tokenSymbol}`;
      const amountFormatted = parseFloat(formatUnits(log.args.value, 6)).toFixed(2);

      onchainEventsParsed.push({
        type: actionLabel,
        hash: log.transactionHash,
        block: log.blockNumber.toString(),
        amount: `${isOutgoing ? '-' : '+'}${amountFormatted} ${tokenSymbol}`,
        status: 'Success',
        timestamp: 0
      });
    }

    // Parse agent registrations
    const seenAgentTx = new Set();
    for (const log of agentLogs) {
      if (!seenAgentTx.has(log.transactionHash)) {
        seenAgentTx.add(log.transactionHash);
        onchainEventsParsed.push({
          type: 'Register AI Agent',
          hash: log.transactionHash,
          block: log.blockNumber.toString(),
          amount: `Agent #${log.args.tokenId.toString()}`,
          status: 'Success',
          timestamp: 0
        });
      }
    }

    // Parse Job creations as client
    const seenJobClientTx = new Set();
    for (const log of jobClientLogs) {
      if (!seenJobClientTx.has(log.transactionHash)) {
        seenJobClientTx.add(log.transactionHash);
        onchainEventsParsed.push({
          type: 'Create Job Escrow',
          hash: log.transactionHash,
          block: log.blockNumber.toString(),
          amount: `Job #${log.args.jobId.toString()}`,
          status: 'Success',
          timestamp: 0
        });
      }
    }

    // Parse Job creations as provider
    const seenJobProviderTx = new Set();
    for (const log of jobProviderLogs) {
      if (!seenJobProviderTx.has(log.transactionHash)) {
        seenJobProviderTx.add(log.transactionHash);
        onchainEventsParsed.push({
          type: 'Assigned as Job Provider',
          hash: log.transactionHash,
          block: log.blockNumber.toString(),
          amount: `Job #${log.args.jobId.toString()}`,
          status: 'Success',
          timestamp: 0
        });
      }
    }

    // Parse feedback submissions
    const seenFeedbackTx = new Set();
    for (const log of feedbackLogs) {
      if (!seenFeedbackTx.has(log.transactionHash)) {
        seenFeedbackTx.add(log.transactionHash);
        onchainEventsParsed.push({
          type: 'Submit Feedback',
          hash: log.transactionHash,
          block: log.blockNumber.toString(),
          amount: `Score: ${log.args.score.toString()}/100`,
          status: 'Success',
          timestamp: 0
        });
      }
    }

    // 4. Load session events from localStorage
    const localKey = `activities_${address.toLowerCase()}`;
    let localEvents = [];
    try {
      localEvents = JSON.parse(localStorage.getItem(localKey) || '[]');
    } catch (e) {
      localEvents = [];
    }

    // 5. Merge, prioritizing localEvents (since they contain specific action labels like Swap, Escrow etc.)
    const mergedEvents = [...localEvents];
    const localTxHashes = new Set(localEvents.map(e => e.hash.toLowerCase()));

    for (const onchainEv of onchainEventsParsed) {
      if (!localTxHashes.has(onchainEv.hash.toLowerCase())) {
        mergedEvents.push(onchainEv);
      }
    }

    // Sort: block descending (numeric block if present, then timestamp)
    mergedEvents.sort((a, b) => {
      const blockA = a.block === 'Pending' ? 999999999n : BigInt(a.block);
      const blockB = b.block === 'Pending' ? 999999999n : BigInt(b.block);
      if (blockA !== blockB) {
        return blockB > blockA ? 1 : -1;
      }
      return b.timestamp - a.timestamp;
    });

    // 6. Calculate Wallet Score (Arc Score)
    // Nonce: 5 pts per transaction, cap at 50 (10 txs)
    const noncePoints = Math.min(Number(nonceVal) * 5, 50);
    // Gas: balance * 10, cap at 20 (e.g. 2 ARC = 20 points)
    const balancePoints = Math.min(Math.floor(parseFloat(formattedArc) * 10), 20);
    // Diversity: scan held balances of USDC, EURC, USYC
    let diversityPoints = 0;
    try {
      const [balUsdc, balEurc, balUsyc] = await Promise.all([
        getUSDCBalance(address),
        publicClient.readContract({
          address: CONTRACTS.EURC,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address]
        }).catch(() => 0n),
        publicClient.readContract({
          address: CONTRACTS.USYC,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address]
        }).catch(() => 0n)
      ]);
      
      if (parseFloat(balUsdc) > 0) diversityPoints += 10;
      if (balEurc > 0n) diversityPoints += 10;
      if (balUsyc > 0n) diversityPoints += 10;
    } catch (e) {
      console.warn('Error reading balances for diversity score:', e);
    }
    
    // Total events points: 2 points per scanned event log, cap at 30 (15 events logs scanned)
    const logPoints = Math.min(onchainEventsParsed.length * 2, 30);

    const trustScore = Math.min(noncePoints + balancePoints + logPoints, 100);

    // 7. Determine Trust Tier
    let tier = 'Novice Explorer';
    if (trustScore > 20 && trustScore <= 50) tier = 'Active Builder';
    else if (trustScore > 50 && trustScore <= 80) tier = 'Arc Sentinel';
    else if (trustScore > 80) tier = 'Trusted Overseer';

    // 8. Render via UI component
    renderActivity({
      score: trustScore,
      tier,
      gasBalance: formattedArc,
      txCount: nonceVal.toString(),
      scannedLogsCount: onchainEventsParsed.length.toString(),
      events: mergedEvents,
      usdcBalance: appState.tokenBalances.USDC || '0.00',
      eurcBalance: appState.tokenBalances.EURC || '0.00',
      usycBalance: appState.tokenBalances.USYC || '0.00'
    });

  } catch (error) {
    console.error('Error loading wallet activity:', error);
  }
}

// Lending Market Panel Loader
// Lending Market Panel Loader
async function loadLendingPool() {
  if (!appState.connectedAddress) {
    showToast('Please connect your wallet to interact with lending pools!', 'info');
    return;
  }
  await fetchAllTokenBalances();
  await syncUserLendingStateOnChain(appState.connectedAddress);

  const state = getUserLendingState(appState.connectedAddress);
  const calculations = calculateBorrowLimit(state.supplied, state.borrowed);

  // Update Summary UI
  document.getElementById('lend-supplied-value').innerText = `$${calculations.totalCollateralUSD}`;
  document.getElementById('lend-limit-value').innerText = `$${calculations.totalBorrowLimitUSD}`;
  document.getElementById('lend-borrowed-value').innerText = `$${calculations.totalBorrowedUSD}`;
  
  const healthBadge = document.getElementById('lend-health-value');
  if (healthBadge) {
    const borrowedNum = parseFloat(calculations.totalBorrowedUSD);
    const hFactor = parseFloat(calculations.healthFactor);

    let label = 'Healthy & Safe';
    let color = '#10b981';
    let valText = borrowedNum === 0 ? '999.00' : hFactor.toFixed(2);

    if (borrowedNum > 0) {
      if (hFactor < 1.1) {
        label = 'Liquidation Warning!';
        color = '#ef4444';
      } else if (hFactor <= 1.5) {
        label = 'Moderate Borrow Risk';
        color = '#f59e0b';
      } else {
        label = 'Healthy & Safe';
        color = '#10b981';
      }
    }

    healthBadge.innerHTML = `<span style="color:${color};">${valText}</span> <span style="font-size:0.75rem; font-weight:700; color:${color}; margin-left:0.35rem;">(${label})</span>`;
  }

  const percentText = `${calculations.percentUsed}% used`;
  const lendLimitPercentEl = document.getElementById('lend-limit-percent');
  if (lendLimitPercentEl) lendLimitPercentEl.innerText = percentText;
  
  const ringPercentEl = document.getElementById('lending-ring-percent');
  if (ringPercentEl) ringPercentEl.innerText = `${calculations.percentUsed}%`;

  const barEl = document.getElementById('lend-limit-bar');
  if (barEl) barEl.style.width = `${Math.min(parseFloat(calculations.percentUsed), 100)}%`;

  const circle = document.getElementById('lending-progress-circle');
  if (circle) {
    const maxOffset = 339.29;
    const strokeOffset = maxOffset - (Math.min(parseFloat(calculations.percentUsed), 100) / 100) * maxOffset;
    circle.style.strokeDashoffset = strokeOffset;
  }

  // Render Asset Marketplace Table
  const marketTbody = document.getElementById('lending-market-table-body');
  if (marketTbody) {
    let assets = [
      { name: 'USDC', category: 'stablecoins', symbol: '$', bg: '#3b82f6', apy: '5.20%', color: '#f59e0b', spark: 'M0,16 Q25,6 55,14 T120,5' },
      { name: 'EURC', category: 'stablecoins', symbol: '€', bg: '#8b5cf6', apy: '4.50%', color: '#a855f7', spark: 'M0,18 Q30,10 60,14 T120,6' },
      { name: 'USYC', category: 'yield', symbol: 'Y', bg: '#10b981', apy: '7.90%', color: '#14b8a6', spark: 'M0,16 Q25,8 55,14 T120,5' }
    ];

    const currentFilter = appState.lendingFilter || 'all';
    if (currentFilter === 'stablecoins') {
      assets = assets.filter(a => a.category === 'stablecoins');
    } else if (currentFilter === 'yield') {
      assets = assets.filter(a => a.category === 'yield');
    }

    marketTbody.innerHTML = assets.map(a => {
      const suppliedAmount = parseFloat(state.supplied[a.name] || '0');
      const borrowedAmount = parseFloat(state.borrowed[a.name] || '0');

      return `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 0.9rem 0.5rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: ${a.bg}; color: #ffffff; font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px ${a.bg}40;">${a.symbol}</div>
              <span style="font-weight: 800; font-size: 0.9rem; color: #1e2029;">${a.name}</span>
            </div>
          </td>
          <td style="padding: 0.9rem 0.5rem; font-weight: 700; font-size: 0.88rem; color: #1e2029;">${a.apy}</td>
          <td style="padding: 0.9rem 0.5rem;">
            <svg width="100" height="24" viewBox="0 0 120 24" fill="none">
              <path d="${a.spark}" stroke="${a.color}" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </td>
          <td style="padding: 0.9rem 0.5rem; font-weight: 700; font-size: 0.88rem; color: #1e2029;">${suppliedAmount.toFixed(2)}</td>
          <td style="padding: 0.9rem 0.5rem; font-weight: 700; font-size: 0.88rem; color: #1e2029;">${borrowedAmount.toFixed(2)}</td>
          <td style="padding: 0.9rem 0.5rem; text-align: right;">
            <div style="display: flex; gap: 0.4rem; justify-content: flex-end;">
              <button class="btn-primary btn-supply-trigger" data-asset="${a.name}" style="padding: 0.4rem 0.85rem; font-size: 0.78rem; border-radius: 10px; background: rgba(59, 130, 246, 0.15); color: #2563eb; border: 1px solid rgba(59, 130, 246, 0.3); font-weight: 700; cursor: pointer;">Supply</button>
              <button class="btn-primary btn-borrow-trigger" data-asset="${a.name}" style="padding: 0.4rem 0.85rem; font-size: 0.78rem; border-radius: 10px; background: rgba(124, 77, 255, 0.15); color: #7c4dff; border: 1px solid rgba(124, 77, 255, 0.3); font-weight: 700; cursor: pointer;">Borrow</button>
              ${suppliedAmount > 0 ? `
                <button class="btn-primary btn-withdraw-trigger" data-asset="${a.name}" style="padding: 0.4rem 0.85rem; font-size: 0.78rem; border-radius: 10px; background: rgba(168, 85, 247, 0.15); color: #9333ea; border: 1px solid rgba(168, 85, 247, 0.3); font-weight: 700; cursor: pointer;">Withdraw</button>
              ` : ''}
              ${borrowedAmount > 0 ? `
                <button class="btn-primary btn-repay-trigger" data-asset="${a.name}" style="padding: 0.4rem 0.85rem; font-size: 0.78rem; border-radius: 10px; background: rgba(16, 185, 129, 0.15); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700; cursor: pointer;">Repay</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Bind Actions
  document.querySelectorAll('.btn-supply-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = btn.getAttribute('data-asset');
      document.getElementById('supply-asset-name').value = asset;
      document.getElementById('supply-modal-title').innerText = `Supply ${asset}`;
      document.getElementById('supply-amount-input').value = '';
      toggleModal('modal-supply-pool', true);
    });
  });

  document.querySelectorAll('.btn-withdraw-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = btn.getAttribute('data-asset');
      document.getElementById('withdraw-asset-name').value = asset;
      document.getElementById('withdraw-modal-title').innerText = `Withdraw ${asset}`;
      document.getElementById('withdraw-amount-input').value = '';
      toggleModal('modal-withdraw-pool', true);
    });
  });

  document.querySelectorAll('.btn-borrow-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = btn.getAttribute('data-asset');
      document.getElementById('borrow-asset-name').value = asset;
      document.getElementById('borrow-modal-title').innerText = `Borrow ${asset}`;
      document.getElementById('borrow-amount-input').value = '';
      toggleModal('modal-borrow-pool', true);
    });
  });

  document.querySelectorAll('.btn-repay-trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const asset = btn.getAttribute('data-asset');
      document.getElementById('repay-asset-name').value = asset;
      document.getElementById('repay-modal-title').innerText = `Repay ${asset} Debt`;
      document.getElementById('repay-amount-input').value = '';
      toggleModal('modal-repay-pool', true);
    });
  });

  // Max Button Handlers
  document.getElementById('btn-supply-max')?.addEventListener('click', () => {
    const asset = document.getElementById('supply-asset-name').value || 'USDC';
    const bal = appState.tokenBalances[asset] || '0';
    document.getElementById('supply-amount-input').value = bal;
  });

  document.getElementById('btn-withdraw-max')?.addEventListener('click', () => {
    const asset = document.getElementById('withdraw-asset-name').value || 'USDC';
    const supplied = state.supplied[asset] || '0';
    document.getElementById('withdraw-amount-input').value = supplied;
  });

  document.getElementById('btn-borrow-max')?.addEventListener('click', () => {
    const asset = document.getElementById('borrow-asset-name').value || 'USDC';
    const rates = { USDC: 1, USYC: 1, EURC: 1.08 };
    const rate = rates[asset] || 1;
    const availUSD = Math.max(0, parseFloat(calculations.totalBorrowLimitUSD) - parseFloat(calculations.totalBorrowedUSD));
    const maxAsset = (availUSD / rate).toFixed(2);
    document.getElementById('borrow-amount-input').value = maxAsset;
  });

  document.getElementById('btn-repay-max')?.addEventListener('click', () => {
    const asset = document.getElementById('repay-asset-name').value || 'USDC';
    const borrowed = state.borrowed[asset] || '0';
    document.getElementById('repay-amount-input').value = borrowed;
  });

  // Sub-tab market filter handlers
  document.querySelectorAll('.lending-market-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const filter = tab.getAttribute('data-filter');
      appState.lendingFilter = filter;

      document.querySelectorAll('.lending-market-tab').forEach(t => {
        if (t.getAttribute('data-filter') === filter) {
          t.classList.add('active');
          t.style.fontWeight = '800';
          t.style.color = 'var(--text-primary)';
          t.style.borderBottom = '2.5px solid #7c4dff';
          t.style.paddingBottom = '0.7rem';
          t.style.marginBottom = '-0.75rem';
        } else {
          t.classList.remove('active');
          t.style.fontWeight = '600';
          t.style.color = '#64748b';
          t.style.borderBottom = 'none';
          t.style.paddingBottom = '0';
          t.style.marginBottom = '0';
        }
      });

      loadLendingPool();
    });
  });
}

function handleJobAction(action, id, amount) {
  if (action === 'set-budget') {
    document.getElementById('budget-job-id').value = id;
    toggleModal('modal-set-budget', true);
  } else if (action === 'fund') {
    document.getElementById('fund-job-id').value = id;
    document.getElementById('fund-job-amount').value = amount;
    document.getElementById('fund-display-amount').innerText = amount;
    toggleModal('modal-fund', true);
  } else if (action === 'submit') {
    document.getElementById('submit-work-job-id').value = id;
    toggleModal('modal-submit-work', true);
  } else if (action === 'complete') {
    document.getElementById('complete-job-id').value = id;
    toggleModal('modal-complete-job', true);
  }
}

// Check if loaded via checkout URL (Real onchain transfer implementation)
function checkPaymentRequest() {
  const payReq = parsePaymentUrl();
  if (!payReq) return;

  // Remove existing overlay if any to prevent duplicates
  const existing = document.getElementById('modal-merchant-checkout');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.id = 'modal-merchant-checkout';
  
  const isConnected = !!appState.connectedAddress;

  // Sanitize URL parameters to prevent XSS
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  const safeRecipient = escapeHTML(payReq.recipient || '');
  const safeNote = escapeHTML(payReq.note || '');
  const safeAmount = parseFloat(payReq.amount) || 0;

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">Pay Merchant Request</h3>
        <button class="modal-close" aria-label="Close" onclick="document.getElementById('modal-merchant-checkout').remove()">&times;</button>
      </div>
      <div style="margin-bottom: 1.5rem;">
        <p style="font-size: 1.2rem; color: var(--text-primary); margin-bottom: 0.5rem;"><strong>${safeAmount.toFixed(2)} USDC</strong></p>
        <p style="font-size: 0.9rem; color: var(--text-secondary);">Recipient: <code>${safeRecipient}</code></p>
        <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 0.5rem;">Note: <em>${safeNote}</em></p>
      </div>
      <button id="btn-confirm-checkout" class="btn-primary">
        ${isConnected ? 'Approve & Pay' : 'Connect Wallet to Pay'}
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('btn-confirm-checkout').addEventListener('click', async () => {
    if (!appState.connectedAddress) {
      overlay.remove(); // Remove to avoid overlaps during selection modal
      await handleWalletConnect();
      return;
    }

    try {
      const { walletClient, publicClient } = getClients();
      if (!walletClient) throw new Error('Please connect your wallet first!');
      
      showToast('Submitting merchant payment transaction on Arc...', 'info');
      
      const amountRaw = parseUnits(payReq.amount.toString(), 6); // USDC uses 6 decimals
      const { request } = await publicClient.simulateContract({
        account: appState.connectedAddress,
        address: CONTRACTS.USDC,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [payReq.recipient, amountRaw]
      });

      const txHash = await walletClient.writeContract(request);
      trackActivity('Merchant Payment', txHash, null, `-${payReq.amount.toFixed(2)} USDC`);
      showToast(`Checkout Tx submitted: ${txHash.slice(0, 10)}...`, 'info');

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      showToast('Merchant payment completed successfully onchain!', 'success');
      
      overlay.remove();
      window.history.replaceState({}, document.title, window.location.pathname);
      
      await fetchAllTokenBalances();
      await updateWalletUI(appState.connectedAddress);
      loadDashboardData();
    } catch (err) {
      showToast(err.message || 'Payment transaction failed', 'error');
    }
  });
}

// Setup Swap panel events
function setupSwapEvents() {
  const inputPay = document.getElementById('swap-pay-amount');
  const inputReceive = document.getElementById('swap-receive-amount');
  const selectPay = document.getElementById('swap-pay-token');
  const selectReceive = document.getElementById('swap-receive-token');
  const rateLabel = document.getElementById('swap-rate-label');
  const reverseBtn = document.getElementById('btn-swap-reverse');

  const crosschainToggle = document.getElementById('swap-crosschain-toggle');
  const crosschainContainer = document.getElementById('cross-chain-options-container');
  const destChainSelect = document.getElementById('swap-dest-chain');
  const recipientAddressInput = document.getElementById('swap-recipient-address');

  crosschainToggle.addEventListener('change', () => {
    if (crosschainToggle.checked) {
      crosschainContainer.style.display = 'block';
      if (appState.connectedAddress && !recipientAddressInput.value) {
        recipientAddressInput.value = appState.connectedAddress;
      }
    } else {
      crosschainContainer.style.display = 'none';
    }
  });

  const updateCalculations = () => {
    const payVal = inputPay ? (inputPay.value || '0') : '0';
    const payToken = selectPay ? selectPay.value : 'USDC';
    const receiveToken = selectReceive ? selectReceive.value : (payToken === 'USDC' ? 'EURC' : 'USDC');
    const output = calculateSwapOutput(payToken, receiveToken, payVal);
    if (inputReceive) inputReceive.value = output;

    const rate = getSwapRate(payToken, receiveToken);
    if (rateLabel) rateLabel.innerText = `1 ${payToken} = ${rate.toFixed(3)} ${receiveToken}`;

    // Update 3D Pay and Receive Display Cards live
    const displayPayAmount = document.getElementById('display-you-pay-amount');
    const displayPayBalance = document.getElementById('display-you-pay-balance');
    const displayReceiveAmount = document.getElementById('display-you-receive-amount');

    if (displayPayAmount) {
      const num = parseFloat(payVal) || 0;
      displayPayAmount.innerText = num > 0 ? num.toLocaleString() : '0';
    }
    if (displayPayBalance) {
      const bal = appState.tokenBalances?.[payToken] || '0.00';
      displayPayBalance.innerText = `Balance: ${parseFloat(bal).toFixed(2)} ${payToken}`;
    }
    if (displayReceiveAmount) {
      const numOut = parseFloat(output) || 0;
      const symbol = receiveToken === 'EURC' ? '€ ' : '$ ';
      displayReceiveAmount.innerText = `${symbol}${numOut.toFixed(2)}`;
    }
    const displayReceiveBalance = document.getElementById('display-you-receive-balance');
    if (displayReceiveBalance) {
      const recBal = appState.tokenBalances?.[receiveToken] || '0.00';
      displayReceiveBalance.innerText = `Balance: ${parseFloat(recBal).toFixed(2)} ${receiveToken}`;
    }

    // Update Live AI Speedometer Needle, Sparkline & 1h Prediction Rate in Real Time
    const aiNeedle = document.getElementById('swap-ai-needle');
    const aiRate1h = document.getElementById('swap-ai-1h-rate');
    const aiSentimentLabel = document.getElementById('swap-ai-sentiment-label');
    const sparklinePath = document.getElementById('swap-sparkline-path');
    const sparklineDot = document.getElementById('swap-sparkline-dot');

    if (sparklinePath) {
      let pathD = "M0 35 Q 30 15, 60 30 T 120 10 T 160 25";
      let dotCx = "120";
      let dotCy = "10";

      if (payToken === 'EURC' || receiveToken === 'EURC') {
        pathD = "M0 28 Q 25 38, 55 18 T 115 28 T 160 14";
        dotCx = "115";
        dotCy = "28";
      } else if (payToken === 'USYC' || receiveToken === 'USYC') {
        pathD = "M0 22 Q 35 28, 70 14 T 130 18 T 160 10";
        dotCx = "130";
        dotCy = "18";
      }

      sparklinePath.setAttribute('d', pathD);
      if (sparklineDot) {
        sparklineDot.setAttribute('cx', dotCx);
        sparklineDot.setAttribute('cy', dotCy);
      }
    }

    if (aiNeedle || aiRate1h) {
      const sentimentScore = Math.min(Math.max(rate * 0.72 + 0.1, 0.15), 0.85);
      const angleRad = (1 - sentimentScore) * Math.PI;
      const x2 = (40 + 22 * Math.cos(angleRad)).toFixed(1);
      const y2 = (40 - 22 * Math.sin(angleRad)).toFixed(1);

      if (aiNeedle) {
        aiNeedle.setAttribute('x2', x2);
        aiNeedle.setAttribute('y2', y2);
      }

      if (aiRate1h) {
        const predRate = (rate * 0.9985).toFixed(4);
        aiRate1h.innerHTML = `1h: <strong>${predRate}</strong>`;
      }

      if (aiSentimentLabel) {
        const isBullish = sentimentScore >= 0.5;
        const color = isBullish ? '#10b981' : '#ef4444';
        aiSentimentLabel.innerHTML = `<span style="color:${color};">${isBullish ? 'Bullish' : 'Bearish'}</span><span>${(sentimentScore * 100).toFixed(0)}%</span>`;
      }
    }
  };

  if (inputPay) inputPay.addEventListener('input', updateCalculations);
  if (selectPay) {
    selectPay.addEventListener('change', () => {
      if (selectReceive && selectPay.value === selectReceive.value) {
        selectReceive.value = selectPay.value === 'USDC' ? 'EURC' : 'USDC';
      }
      updateCalculations();
    });
  }
  if (selectReceive) {
    selectReceive.addEventListener('change', () => {
      if (selectPay && selectReceive.value === selectPay.value) {
        selectPay.value = selectReceive.value === 'USDC' ? 'EURC' : 'USDC';
      }
      updateCalculations();
    });
  }

  document.querySelectorAll('.sparkline-day-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.getAttribute('data-day');
      const payToken = selectPay ? selectPay.value : 'USDC';
      const receiveToken = selectReceive ? selectReceive.value : 'EURC';
      const rate = getSwapRate(payToken, receiveToken);
      const dayRate = (rate * (0.992 + Math.random() * 0.016)).toFixed(4);
      showToast(`${day} FX Historical Analytics: 1 ${payToken} = ${dayRate} ${receiveToken} (24h Vol: $1.42M)`, 'info');
    });
  });

  const depthBtn = document.getElementById('btn-depth-indicators');
  if (depthBtn) {
    depthBtn.addEventListener('click', () => {
      toggleModal('modal-pool-depth', true);
    });
  }
  
  if (reverseBtn) {
    reverseBtn.addEventListener('click', () => {
      const currentPay = selectPay ? selectPay.value : 'USDC';
      const currentReceive = selectReceive ? selectReceive.value : 'EURC';

      if (selectPay) selectPay.value = currentReceive;
      if (selectReceive) selectReceive.value = currentPay;

      updateCalculations();
    });
  }

  const swapForm = document.getElementById('form-swap');
  if (swapForm) {
    swapForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payToken = selectPay ? selectPay.value : 'USDC';
      const receiveToken = selectReceive ? selectReceive.value : 'EURC';
      const amount = inputPay ? inputPay.value : '0';
      const amountVal = parseFloat(amount);
      if (isNaN(amountVal) || amountVal <= 0) {
        showToast('Please enter a valid swap amount.', 'warning');
        return;
      }

      const isCrosschain = crosschainToggle ? crosschainToggle.checked : false;
      const destChain = destChainSelect ? destChainSelect.value : '';
      const recipientAddress = recipientAddressInput ? recipientAddressInput.value : '';

      try {
        if (isCrosschain) {
          showToast(`Executing cross-chain swap ${amount} ${payToken} ↔ ${receiveToken} to ${destChain}...`, 'info');
        } else {
          showToast(`Executing swap ${amount} ${payToken} ↔ ${receiveToken}...`, 'info');
        }
        
        const res = await executeStablecoinSwap(payToken, receiveToken, amount, isCrosschain, destChain, recipientAddress);
        if (res.success) {
          const txLink = res.explorerUrl || (res.txHash ? `https://testnet.arcscan.app/tx/${res.txHash}` : '');
          if (isCrosschain) {
            showToast(`Cross-chain swap completed! Status: ${res.crosschainStatus}`, 'success');
            if (txLink) showToast(`Explorer Link: ${txLink}`, 'info');
            trackActivity(`Cross-chain Swap`, res.txHash, null, `${amount} ${payToken} -> ${receiveToken} (${destChain})`);
            if (window.hermesNotifyTx) {
              window.hermesNotifyTx('Cross-chain Swap', res.txHash, `Swapped ${amount} ${payToken} to ${receiveToken} (${destChain})`);
            }
            if (res.destTxHash) {
              showToast(`Dest Tx Hash: ${res.destTxHash.slice(0, 12)}...`, 'info');
            }
          } else {
            showToast(`Swapped successfully! Output: ${res.outputAmount} ${receiveToken}`, 'success');
            if (txLink) showToast(`Explorer Link: ${txLink}`, 'info');
            if (res.fees && res.fees.length > 0) {
              const feeDesc = res.fees.map(f => `${f.amount} ${f.token} (${f.type})`).join(', ');
              showToast(`Swap Fees: ${feeDesc}`, 'info');
            }
            trackActivity('Swap Tokens', res.txHash, null, `${amount} ${payToken} -> ${res.outputAmount} ${receiveToken}`);
            if (window.hermesNotifyTx) {
              window.hermesNotifyTx('Swap Tokens', res.txHash, `Swapped ${amount} ${payToken} to ${res.outputAmount} ${receiveToken}`);
            }
          }
          
          // Refresh balances in UI
          await fetchAllTokenBalances();
          await updateWalletUI(appState.connectedAddress);
          if (inputPay) inputPay.value = '';
          if (inputReceive) inputReceive.value = '';
          updateCalculations();
        }
      } catch (err) {
        showToast(err.message || 'Swap reverted', 'error');
      }
    });
  }

  updateCalculationsRef = updateCalculations;
  updateCalculations();
}

// Setup Merchant Checkout panel events
function setupMerchantEvents() {
  document.getElementById('form-merchant-link').addEventListener('submit', (e) => {
    e.preventDefault();
    const recipient = document.getElementById('merchant-recipient').value;
    const amount = document.getElementById('merchant-amount').value;
    const note = document.getElementById('merchant-note').value;

    const url = generateMerchantPaymentLink(recipient, amount, note);
    const safeUrl = String(url).replace(/"/g, '&quot;');

    const output = document.getElementById('merchant-link-output');
    output.innerHTML = `
      <i data-lucide="check-circle" style="width: 48px; height: 48px; color: #10b981; margin-bottom: 0.5rem;"></i>
      <p style="color: var(--text-primary); font-weight:600; font-size:0.95rem;">Payment Request Link Generated</p>
      <input type="text" value="${safeUrl}" class="form-control" readonly id="merchant-checkout-link" style="text-align:center; font-size:0.8rem; margin:0.5rem 0;">
      <button class="btn-primary" id="btn-copy-merchant-link" style="padding:0.4rem 0.8rem; font-size:0.85rem;"><i data-lucide="copy"></i> Copy Link</button>
    `;

    document.getElementById('btn-copy-merchant-link').addEventListener('click', () => {
      const linkInput = document.getElementById('merchant-checkout-link');
      linkInput.select();
      navigator.clipboard.writeText(linkInput.value);
      showToast('Copied to clipboard!', 'success');
    });

    if (window.lucide) window.lucide.createIcons();
  });
}

async function getSolanaUSDCBalance(pubkey) {
  try {
    const res = await fetch('https://api.devnet.solana.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          pubkey,
          { mint: '4zMMC9ZdZhLx2u51k67A3CsYJP4ZkSammPmSPL375ufg' }, // Solana Devnet USDC Mint address
          { encoding: 'jsonParsed' }
        ]
      })
    });
    const data = await res.json();
    const balance = data.result?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
    return parseFloat(balance).toFixed(2);
  } catch (err) {
    console.error('Error fetching Solana USDC balance:', err);
    return '0.00';
  }
}

async function getStellarUSDCBalance(pubkey) {
  try {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${pubkey}`);
    if (!res.ok) return '0.00';
    const data = await res.json();
    const balanceObj = data.balances?.find(b => b.asset_code === 'USDC');
    return balanceObj ? parseFloat(balanceObj.balance).toFixed(2) : '0.00';
  } catch (err) {
    console.error('Error fetching Stellar USDC balance:', err);
    return '0.00';
  }
}

// Setup Real CCTP Bridge events
function setupBridgeEvents() {
  // Bind tab switching
  const tabs = ['evm', 'solana', 'stellar'];
  tabs.forEach(t => {
    const btn = document.getElementById(`bridge-tab-${t}`);
    if (btn) {
      btn.addEventListener('click', () => {
        // Toggle active states
        tabs.forEach(x => {
          const b = document.getElementById(`bridge-tab-${x}`);
          if (b) {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.borderColor = 'transparent';
            b.style.color = 'var(--text-secondary)';
          }
        });
        btn.classList.add('active');
        btn.style.background = 'rgba(255,255,255,0.03)';
        btn.style.borderColor = 'rgba(255,255,255,0.06)';
        btn.style.color = '#fff';

        // Update hidden input
        document.getElementById('bridge-selected-source').value = t;

        // Toggle sections
        document.getElementById('solana-wallet-section').style.display = t === 'solana' ? 'block' : 'none';
        document.getElementById('stellar-wallet-section').style.display = t === 'stellar' ? 'block' : 'none';
        document.getElementById('bridge-sim-toggle-container').style.display = t !== 'evm' ? 'block' : 'none';
      });
    }
  });

  // Connect Solana (Phantom)
  const connectSolBtn = document.getElementById('btn-connect-solana');
  if (connectSolBtn) {
    connectSolBtn.addEventListener('click', async () => {
      if (window.solana && window.solana.isPhantom) {
        try {
          const resp = await window.solana.connect();
          const pubkey = resp.publicKey.toString();
          const balance = await getSolanaUSDCBalance(pubkey);
          document.getElementById('solana-wallet-status').innerText = `Connected: ${pubkey.slice(0, 6)}...${pubkey.slice(-4)} (${balance} USDC)`;
          document.getElementById('bridge-sim-mode').checked = false; // Turn off simulation
          showToast('Phantom wallet connected!', 'success');
        } catch (err) {
          showToast('Solana connection failed: ' + err.message, 'error');
        }
      } else {
        showToast('Phantom wallet not found. Please install the Phantom extension or use simulation mode!', 'warning');
      }
    });
  }

  // Connect Stellar (Freighter)
  const connectStellarBtn = document.getElementById('btn-connect-stellar');
  if (connectStellarBtn) {
    connectStellarBtn.addEventListener('click', async () => {
      if (window.stellarPubkey || (window.stellar && window.stellar.isFreighter)) {
        try {
          let pubkey = '';
          if (window.stellarPubkey) {
            pubkey = await window.stellarPubkey();
          } else {
            const resp = await window.stellar.connect();
            pubkey = resp.address;
          }
          const balance = await getStellarUSDCBalance(pubkey);
          document.getElementById('stellar-wallet-status').innerText = `Connected: ${pubkey.slice(0, 6)}...${pubkey.slice(-4)} (${balance} USDC)`;
          document.getElementById('bridge-sim-mode').checked = false; // Turn off simulation
          showToast('Freighter wallet connected!', 'success');
        } catch (err) {
          showToast('Freighter connection failed: ' + err.message, 'error');
        }
      } else {
        showToast('Freighter wallet not found. Please install the Freighter extension or use simulation mode!', 'warning');
      }
    });
  }

  // Checkbox listener to switch simulated vs real balances
  const simModeCheckbox = document.getElementById('bridge-sim-mode');
  if (simModeCheckbox) {
    simModeCheckbox.addEventListener('change', async () => {
      const isSim = simModeCheckbox.checked;
      if (isSim) {
        document.getElementById('solana-wallet-status').innerText = 'Connected: Solana Demo (250.00 USDC)';
        document.getElementById('stellar-wallet-status').innerText = 'Connected: Stellar Demo (500.00 USDC)';
      } else {
        if (window.solana && window.solana.isConnected) {
          const pubkey = window.solana.publicKey.toString();
          const balance = await getSolanaUSDCBalance(pubkey);
          document.getElementById('solana-wallet-status').innerText = `Connected: ${pubkey.slice(0, 6)}...${pubkey.slice(-4)} (${balance} USDC)`;
        } else {
          document.getElementById('solana-wallet-status').innerText = 'Phantom not connected';
        }
        
        let stellarAddress = '';
        if (window.stellarPubkey) {
          try { stellarAddress = await window.stellarPubkey(); } catch {}
        }
        if (stellarAddress) {
          const balance = await getStellarUSDCBalance(stellarAddress);
          document.getElementById('stellar-wallet-status').innerText = `Connected: ${stellarAddress.slice(0, 6)}...${stellarAddress.slice(-4)} (${balance} USDC)`;
        } else {
          document.getElementById('stellar-wallet-status').innerText = 'Freighter not connected';
        }
      }
    });
  }

  document.getElementById('form-bridge-simulation').addEventListener('submit', async (e) => {
    e.preventDefault();
    const source = document.getElementById('bridge-selected-source').value;
    const amount = document.getElementById('bridge-amount').value;

    const { provider, connectedAddress } = getClients();
    if (!provider || !connectedAddress) {
      showToast('Please connect your wallet first!', 'error');
      return;
    }

    window._isBridging = true;
    try {
      showToast(`Initiating CCTP bridge of ${amount} USDC via Circle App Kit...`, 'info');

      const bridgeResult = await executeBridge(source, 'arc', amount, connectedAddress, (event) => {
        if (event && event.values) {
          showToast(`Bridge Step: ${event.values.name || 'Processing'} (${event.values.state || 'running'})...`, 'info');
        }
      });

      showToast(`USDC bridged successfully! Tx: ${(bridgeResult.burnTx || bridgeResult.mintTx || '').slice(0, 12)}...`, 'success');
      trackActivity(`Bridge CCTP (${source.toUpperCase()})`, bridgeResult.burnTx || bridgeResult.mintTx, null, `${amount} USDC`);

      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Bridge CCTP Mint', bridgeResult.burnTx || bridgeResult.mintTx, `Bridged ${amount} USDC to Arc Testnet via Circle CCTP`);
      }

      await updateWalletUI(appState.connectedAddress);
      loadDashboardData();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Bridge transaction failed', 'error');
    } finally {
      window._isBridging = false;
    }
  });
}

function setupLendingEvents() {
  // 1. Supply Confirm
  document.getElementById('form-supply-confirm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const asset = document.getElementById('supply-asset-name').value;
    const amount = document.getElementById('supply-amount-input').value;

    try {
      showToast(`Supplying ${amount} ${asset} to lending pool...`, 'info');
      const res = await supplyAsset(asset, amount);
      toggleModal('modal-supply-pool', false);
      
      showToast(`Successfully supplied ${amount} ${asset}!`, 'success');
      showToast(`Tx Explorer: https://testnet.arcscan.app/tx/${res.txHash.slice(0, 12)}...`, 'info');
      trackActivity('Supply Collateral', res.txHash, null, `+${amount} ${asset}`);
      
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Supply Collateral', res.txHash, `Supplied ${amount} ${asset} to Lending Pool`);
      }

      document.getElementById('form-supply-confirm').reset();
      await loadLendingPool();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Supply failed', 'error');
    }
  });

  // 2. Withdraw Confirm
  document.getElementById('form-withdraw-confirm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const asset = document.getElementById('withdraw-asset-name').value;
    const amount = document.getElementById('withdraw-amount-input').value;

    try {
      showToast(`Withdrawing ${amount} ${asset} from lending pool...`, 'info');
      const res = await withdrawAsset(asset, amount);
      toggleModal('modal-withdraw-pool', false);

      showToast(`Successfully withdrew ${amount} ${asset}!`, 'success');
      showToast(`Tx Explorer: https://testnet.arcscan.app/tx/${res.txHash.slice(0, 12)}...`, 'info');
      trackActivity('Withdraw Collateral', res.txHash, null, `-${amount} ${asset}`);
      
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Withdraw Collateral', res.txHash, `Withdrew ${amount} ${asset} from Lending Pool`);
      }

      document.getElementById('form-withdraw-confirm').reset();
      await loadLendingPool();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Withdraw failed', 'error');
    }
  });

  // 3. Borrow Confirm
  document.getElementById('form-borrow-confirm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const asset = document.getElementById('borrow-asset-name').value;
    const amount = document.getElementById('borrow-amount-input').value;

    try {
      showToast(`Executing borrow transaction for ${amount} ${asset}...`, 'info');
      const res = await borrowAsset(asset, amount);
      toggleModal('modal-borrow-pool', false);

      showToast(`Successfully borrowed ${amount} ${asset}!`, 'success');
      showToast(`Tx Explorer: https://testnet.arcscan.app/tx/${res.txHash.slice(0, 12)}...`, 'info');
      trackActivity('Borrow Asset Loan', res.txHash, null, `+${amount} ${asset}`);
      
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Borrow Asset', res.txHash, `Borrowed ${amount} ${asset} from Lending Pool`);
      }

      document.getElementById('form-borrow-confirm').reset();
      await loadLendingPool();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Borrow failed', 'error');
    }
  });

  // 4. Repay Confirm
  document.getElementById('form-repay-confirm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const asset = document.getElementById('repay-asset-name').value;
    const amount = document.getElementById('repay-amount-input').value;

    try {
      showToast(`Repaying ${amount} ${asset} debt to pool...`, 'info');
      const res = await repayAsset(asset, amount);
      toggleModal('modal-repay-pool', false);

      showToast(`Successfully repaid ${amount} ${asset} debt!`, 'success');
      showToast(`Tx Explorer: https://testnet.arcscan.app/tx/${res.txHash.slice(0, 12)}...`, 'info');
      trackActivity('Repay Pool Debt', res.txHash, null, `-${amount} ${asset}`);
      
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Repay Debt', res.txHash, `Repaid ${amount} ${asset} loan back to Lending Pool`);
      }

      document.getElementById('form-repay-confirm').reset();
      await loadLendingPool();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Repay failed', 'error');
    }
  });
}

function setupFormSubmits() {
  // 1. Register Agent
  document.getElementById('form-register-agent').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('agent-name').value;
    const type = document.getElementById('agent-type').value;
    const desc = document.getElementById('agent-desc').value;
    const caps = document.getElementById('agent-capabilities').value.split(',');

    try {
      showToast('Preparing agent metadata...', 'info');
      const metadata = {
        name,
        description: desc,
        agent_type: type,
        capabilities: caps,
        version: '1.0.0'
      };
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(metadata))}`;

      showToast('Submitting ERC-8004 identity registration...', 'info');
      const hash = await registerAgent(dataUri);
      trackActivity('Register AI Agent', hash, null, name);
      showToast(`Tx submitted: ${hash.slice(0, 10)}...`, 'info');

      const { publicClient } = getClients();
      await publicClient.waitForTransactionReceipt({ hash });
      showToast('Agent registered successfully onchain!', 'success');
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Register AI Agent', hash, `Registered agent "${name}" (${type})`);
      }
      
      document.getElementById('form-register-agent').reset();
      loadAgents();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error registering agent', 'error');
    }
  });

  // 2. Create Job
  document.getElementById('form-create-job').addEventListener('submit', async (e) => {
    e.preventDefault();
    const provider = document.getElementById('job-provider').value;
    const evaluator = document.getElementById('job-evaluator').value;
    const expiry = document.getElementById('job-expiry').value;
    const desc = document.getElementById('job-desc').value;

    try {
      showToast('Creating job registry escrow...', 'info');
      const hash = await createJob(provider, evaluator, parseInt(expiry), desc);
      trackActivity('Create Job Escrow', hash, null, `Expiry: ${expiry} days`);
      showToast(`Tx submitted: ${hash.slice(0, 10)}...`, 'info');

      const { publicClient } = getClients();
      await publicClient.waitForTransactionReceipt({ hash });
      showToast('Job created successfully!', 'success');
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Create Job Escrow', hash, `Created escrow job for "${desc.slice(0, 25)}..."`);
      }

      document.getElementById('form-create-job').reset();
      loadJobs();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error creating job', 'error');
    }
  });

  // 3. Set Budget Modal
  document.getElementById('form-set-budget').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('budget-job-id').value;
    const budget = document.getElementById('budget-amount').value;

    try {
      showToast('Setting budget and accepting contract...', 'info');
      const hash = await setBudget(id, budget);
      trackActivity('Accept Job & Set Budget', hash, null, `${budget} USDC`);
      toggleModal('modal-set-budget', false);
      showToast(`Tx submitted: ${hash.slice(0, 10)}...`, 'info');

      const { publicClient } = getClients();
      await publicClient.waitForTransactionReceipt({ hash });
      showToast('Job budget accepted onchain!', 'success');
      
      loadJobs();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error accepting job budget', 'error');
    }
  });

  // 4. Fund Escrow Modal
  document.getElementById('form-fund-job').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('fund-job-id').value;
    const amount = document.getElementById('fund-job-amount').value;

    try {
      showToast('Approving and funding job escrow...', 'info');
      const hash = await fundJob(id, amount);
      trackActivity('Fund Escrow', hash, null, `${amount} USDC`);
      toggleModal('modal-fund', false);
      showToast(`Tx submitted: ${hash.slice(0, 10)}...`, 'info');

      const { publicClient } = getClients();
      await publicClient.waitForTransactionReceipt({ hash });
      showToast('Escrow funded successfully!', 'success');
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Fund Escrow', hash, `Funded Escrow for Job #${id}`);
      }
      
      await updateWalletUI(appState.connectedAddress);
      loadJobs();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error funding escrow', 'error');
    }
  });

  // 5. Submit Work Modal
  document.getElementById('form-submit-work').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('submit-work-job-id').value;
    const text = document.getElementById('deliverable-text').value;

    try {
      showToast('Submitting work hash onchain...', 'info');
      const hash = await submitWork(id, text);
      trackActivity('Submit Deliverables', hash, null, `Job #${id}`);
      toggleModal('modal-submit-work', false);
      showToast(`Tx submitted: ${hash.slice(0, 10)}...`, 'info');

      const { publicClient } = getClients();
      await publicClient.waitForTransactionReceipt({ hash });
      showToast('Work submitted successfully!', 'success');
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Submit Deliverables', hash, `Submitted deliverables for Job #${id}`);
      }
      
      loadJobs();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error submitting work', 'error');
    }
  });

  // 6. Complete Job Modal
  document.getElementById('form-complete-job-confirm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('complete-job-id').value;
    const reason = document.getElementById('complete-reason').value;

    try {
      showToast('Completing job & releasing payment...', 'info');
      const hash = await completeJob(id, reason);
      trackActivity('Complete Job & Release', hash, null, `Job #${id}`);
      toggleModal('modal-complete-job', false);
      showToast(`Tx submitted: ${hash.slice(0, 10)}...`, 'info');

      const { publicClient } = getClients();
      await publicClient.waitForTransactionReceipt({ hash });
      showToast('Escrow released and job completed!', 'success');
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Release Escrow', hash, `Completed Job #${id} and released escrow payment`);
      }
      
      loadJobs();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error completing job', 'error');
    }
  });

  // 7. Give Feedback Form
  document.getElementById('form-submit-feedback').addEventListener('submit', async (e) => {
    e.preventDefault();
    const agentId = document.getElementById('feedback-agent-id').value;
    const score = document.getElementById('feedback-score').value;
    const tag = document.getElementById('feedback-tag').value;
    const comment = document.getElementById('feedback-comment').value;

    try {
      showToast('Submitting observer feedback attestation...', 'info');
      const hash = await submitFeedback(agentId, score, tag, comment);
      trackActivity('Submit Feedback', hash, null, `Agent #${agentId} (${score}/100)`);
      showToast(`Tx submitted: ${hash.slice(0, 10)}...`, 'info');

      const { publicClient } = getClients();
      await publicClient.waitForTransactionReceipt({ hash });
      showToast('Onchain feedback recorded successfully!', 'success');
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Record Feedback', hash, `Feedback for Agent #${agentId} (Score: ${score}/100)`);
      }

      document.getElementById('form-submit-feedback').reset();
      loadReputation();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error recording feedback', 'error');
    }
  });

  // 8. Agent Search and Filter controls
  const handleAgentFilter = () => {
    const query = (document.getElementById('agent-search-input')?.value || '').toLowerCase().trim();
    const role = document.getElementById('agent-filter-role')?.value || 'All';

    const filtered = (appState.agents || []).filter(a => {
      const matchesSearch = !query || 
        a.name.toLowerCase().includes(query) || 
        a.description.toLowerCase().includes(query) || 
        a.capabilities.some(c => c.toLowerCase().includes(query));
      
      const matchesRole = role === 'All' || a.agent_type === role;
      
      return matchesSearch && matchesRole;
    });

    renderAgents(filtered, appState.connectedAddress);
  };

  document.getElementById('agent-search-input')?.addEventListener('input', handleAgentFilter);
  document.getElementById('agent-filter-role')?.addEventListener('change', handleAgentFilter);

  // 9. Hire Agent custom event listener
  window.addEventListener('hire-agent', (e) => {
    const { id, name, owner } = e.detail;

    // Switch to Job Escrows sub-tab
    const tab = document.querySelector('.agent-hub-tab[data-subtarget="jobs"]');
    if (tab) tab.click();

    // Pre-fill Provider address
    const providerInput = document.getElementById('job-provider');
    if (providerInput) providerInput.value = owner;

    // Pre-fill Evaluator with active connected address
    const evaluatorInput = document.getElementById('job-evaluator');
    if (evaluatorInput && appState.connectedAddress) {
      evaluatorInput.value = appState.connectedAddress;
    }

    // Pre-fill description
    const descInput = document.getElementById('job-desc');
    if (descInput) {
      descInput.value = `Hiring Agent ID #${id} (${name}) for task: `;
      descInput.focus();
    }

    showToast(`Hiring flow initiated for ${name}! Provider address pre-filled.`, 'success');
  });
}


function setupModals() {
  const closeProvidersBtn = document.getElementById('btn-close-providers');
  if (closeProvidersBtn) {
    closeProvidersBtn.addEventListener('click', () => {
      toggleModal('modal-providers', false);
    });
  }

  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay) overlay.classList.remove('active');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
      }
    });
  });
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupModals();
  initPredictionPage();
  setupFormSubmits();
  setupSwapEvents();
  setupMerchantEvents();
  setupBridgeEvents();
  setupLendingEvents();
  loadActivity();

  const usdcInfoBtn = document.getElementById('btn-usdc-settled-info');
  if (usdcInfoBtn) {
    usdcInfoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleModal('modal-usdc-settled-info', true);
    });
  }
  
  // Initialize Hermes AI Copilot
  initCopilot(appState, showToast);

  const connectBtn = document.getElementById('btn-connect-wallet');
  if (connectBtn) {
    connectBtn.addEventListener('click', handleWalletConnect);
  }

  window.addEventListener('wallet-disconnected', () => {
    onWalletDisconnected();
  });

  // Theme Initialization: Check local preference or fallback to system media query prefers-color-scheme
  const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const savedTheme = localStorage.getItem('theme_preference');
  const shouldBeLight = savedTheme === 'light' || (!savedTheme && systemPrefersLight);

  if (shouldBeLight) {
    document.body.classList.add('light-mode');
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.setAttribute('data-lucide', 'moon');
  } else {
    document.body.classList.remove('light-mode');
    const icon = document.getElementById('theme-toggle-icon');
    if (icon) icon.setAttribute('data-lucide', 'sun');
  }

  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-mode');
      localStorage.setItem('theme_preference', isLight ? 'light' : 'dark');
      const icon = document.getElementById('theme-toggle-icon');
      if (icon) {
        icon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
        if (window.lucide) {
          window.lucide.createIcons();
        }
      }
      showToast(isLight ? 'Theme switched to light mode' : 'Theme switched to dark mode', 'success');
    });
  }


  // Auto-connect on start if already authorized
  if (window.ethereum) {
    window.ethereum.request({ method: 'eth_accounts' })
      .then(async (accounts) => {
        if (accounts && accounts.length > 0) {
          try {
            const { address } = await connectWallet(window.ethereum);
            appState.connectedAddress = address;
            await onWalletConnected();
          } catch (e) {
            console.warn('[AutoConnect] Fallback auto-connect:', e.message);
            appState.connectedAddress = accounts[0];
            await onWalletConnected();
          }
        } else {
          checkPaymentRequest();
        }
      })
      .catch((err) => {
        console.error(err);
        checkPaymentRequest();
      });
  } else {
    checkPaymentRequest();
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }

  const refreshRealtimeBalances = async () => {
    if (appState.connectedAddress) {
      await fetchAllTokenBalances();
      await updateWalletUI(appState.connectedAddress);
      loadPredictionPage();
    }
  };

  window.addEventListener('balance-updated', refreshRealtimeBalances);
  window.addEventListener('focus', refreshRealtimeBalances);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      refreshRealtimeBalances();
    }
  });
});
