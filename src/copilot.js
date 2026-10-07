import { formatUnits, formatEther } from 'viem';
import { getClients } from './wallet.js';
import { CONTRACTS, ERC20_ABI } from './config.js';

let appStateRef = null;
let showToastRef = null;

const GEMINI_MODEL = 'gemini-3.1-flash-lite';

// Conversation history thread
let conversationHistory = [];

const DEFAULT_GEMINI_KEY = 'AQ.Ab8RN6JbSRGS_gK3J_5Hxx4ii3h_Hhod-Dspt_M5rpI9Q2nrhA';
const getApiKey = () => {
  return import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('hermes_gemini_api_key') || DEFAULT_GEMINI_KEY;
};

export function initCopilot(appState, showToast) {
  appStateRef = appState;
  showToastRef = showToast;

  // Expose global transaction notification helper for Hermes AI Copilot
  window.hermesNotifyTx = (actionType, txHash, summaryText) => {
    const shortHash = txHash ? `${txHash.slice(0, 8)}...${txHash.slice(-4)}` : '';
    const explorerUrl = txHash ? `https://testnet.arcscan.app/tx/${txHash}` : '#';
    addMessage('assistant', `✅ **${actionType} Completed**\n\n${summaryText}${txHash ? `\n\n[View Explorer Transaction (${shortHash})](${explorerUrl})` : ''}`);
  };

  setupCopilotUI();
}

function setupCopilotUI() {
  const bubble = document.getElementById('hermes-bubble');
  const drawer = document.getElementById('hermes-drawer');
  const backdrop = document.getElementById('hermes-backdrop');
  const closeBtn = document.getElementById('hermes-close');
  const chatForm = document.getElementById('hermes-chat-form');
  const chatInput = document.getElementById('hermes-chat-input');
  
  const configPanel = document.getElementById('hermes-config-panel');
  const apiKeyInput = document.getElementById('hermes-api-key-input');
  const saveApiKeyBtn = document.getElementById('hermes-save-api-key');

  if (!drawer) return;

  const openDrawer = () => {
    drawer.classList.add('active', 'open');
    if (backdrop) backdrop.classList.add('active', 'open');
    scrollToBottom();
    if (chatInput) {
      setTimeout(() => chatInput.focus(), 250);
    }
  };

  const closeDrawer = () => {
    drawer.classList.remove('active', 'open');
    if (backdrop) backdrop.classList.remove('active', 'open');
  };

  const toggleDrawer = () => {
    if (drawer.classList.contains('active') || drawer.classList.contains('open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  };

  // Expose globally
  window.openHermesChat = openDrawer;
  window.closeHermesChat = closeDrawer;
  window.toggleHermesChat = toggleDrawer;

  // Toggle drawer open/close on bubble click
  if (bubble) {
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleDrawer();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDrawer();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      closeDrawer();
    });
  }

  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (drawer.classList.contains('active') || drawer.classList.contains('open'))) {
      closeDrawer();
    }
  });

  // Attach nav buttons if present
  const navTrigger = document.getElementById('btn-open-hermes-nav');
  if (navTrigger) {
    navTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      openDrawer();
    });
  }

  const mobileTrigger = document.getElementById('btn-open-hermes-mobile');
  if (mobileTrigger) {
    mobileTrigger.addEventListener('click', (e) => {
      e.preventDefault();
      const mobileMoreSheet = document.getElementById('mobile-more-sheet');
      const mobileMoreBackdrop = document.getElementById('mobile-more-backdrop');
      if (mobileMoreSheet) mobileMoreSheet.classList.remove('active');
      if (mobileMoreBackdrop) mobileMoreBackdrop.classList.remove('active');
      openDrawer();
    });
  }

  // Handle API Key saving
  const checkApiKeyPanel = () => {
    const key = getApiKey();
    if (key) {
      configPanel.style.display = 'none';
    } else {
      configPanel.style.display = 'block';
    }
  };
  checkApiKeyPanel();

  saveApiKeyBtn.addEventListener('click', () => {
    const val = apiKeyInput.value.trim();
    if (!val) {
      showToastRef('Please enter a valid API Key', 'error');
      return;
    }
    localStorage.setItem('hermes_gemini_api_key', val);
    showToastRef('Gemini API Key saved successfully!', 'success');
    checkApiKeyPanel();
  });

  // Handle Form submit
  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    
    chatInput.value = '';
    handleUserMessage(text);
  });
}

function scrollToBottom() {
  const msgPane = document.getElementById('hermes-messages');
  if (msgPane) {
    msgPane.scrollTop = msgPane.scrollHeight;
  }
}

function addMessage(role, text) {
  const msgPane = document.getElementById('hermes-messages');
  if (!msgPane) return;

  const msgDiv = document.createElement('div');
  msgDiv.className = `hermes-msg ${role}`;
  msgDiv.innerHTML = `
    <div class="msg-bubble">
      ${role === 'assistant' ? formatMarkdownText(text) : escapeHtml(text)}
    </div>
  `;
  msgPane.appendChild(msgDiv);
  scrollToBottom();
}

function showLoadingBubble() {
  const msgPane = document.getElementById('hermes-messages');
  if (!msgPane) return null;

  const loadId = 'hermes-loading-' + Date.now();
  const msgDiv = document.createElement('div');
  msgDiv.className = 'hermes-msg assistant';
  msgDiv.id = loadId;
  msgDiv.innerHTML = `
    <div class="msg-bubble" style="display:flex; align-items:center; gap:0.5rem;">
      <div class="spinner" style="width:14px; height:14px; border-width:2px; margin:0;"></div>
      <span>Hermes is thinking...</span>
    </div>
  `;
  msgPane.appendChild(msgDiv);
  scrollToBottom();
  return loadId;
}

function removeLoadingBubble(id) {
  if (!id) return;
  const bubble = document.getElementById(id);
  if (bubble) bubble.remove();
}

function appendAssistantWidget(htmlContent) {
  const msgPane = document.getElementById('hermes-messages');
  if (!msgPane) return;

  const widgetWrapper = document.createElement('div');
  widgetWrapper.className = 'hermes-msg assistant';
  widgetWrapper.style.maxWidth = '92%';
  widgetWrapper.innerHTML = htmlContent;
  msgPane.appendChild(widgetWrapper);
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
  scrollToBottom();
}

// Simple escape helper
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Basic markdown format helper
function formatMarkdownText(text) {
  let formatted = escapeHtml(text);
  
  // bold **text**
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // bullet lists
  formatted = formatted.replace(/^\s*\*\s+(.*?)$/gm, '<li>$1</li>');
  formatted = formatted.replace(/(<li>.*?<\/li>)+/g, '<ul style="margin:0.5rem 0; padding-left:1.2rem;">$&</ul>');
  
  // code blocks `code`
  formatted = formatted.replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.06); padding:0.1rem 0.25rem; border-radius:4px; font-family:monospace; font-size:0.8rem;">$1</code>');
  
  // newlines
  formatted = formatted.replace(/\n/g, '<br/>');
  
  return formatted;
}

async function callGeminiAPI(messages, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const tools = [{
    functionDeclarations: [
      {
        name: "navigate_to",
        description: "Navigate to a specific page or section in the dApp dashboard",
        parameters: {
          type: "OBJECT",
          properties: {
            target: { 
              type: "STRING", 
              description: "Target section id: dashboard, agents, jobs, swap, lending, merchant, reputation, activity" 
            }
          },
          required: ["target"]
        }
      },
      {
        name: "theme_manipulation",
        description: "Switch application theme view between dark mode and light mode",
        parameters: {
          type: "OBJECT",
          properties: {
            mode: { 
              type: "STRING", 
              enum: ["dark", "light"], 
              description: "Theme mode selection" 
            }
          },
          required: ["mode"]
        }
      },
      {
        name: "calculate_yield",
        description: "Compute compounding yield interest return stats over a multi-year period",
        parameters: {
          type: "OBJECT",
          properties: {
            principal: { type: "NUMBER", description: "Initial investment capital in USDC" },
            apy: { type: "NUMBER", description: "Interest APY yield in percent (e.g. 5.5)" },
            years: { type: "NUMBER", description: "Duration timeline of years" }
          },
          required: ["principal", "apy", "years"]
        }
      },
      {
        name: "get_wallet_info",
        description: "Read token balances, native gas ARC balance, trust scores, and nonces for connected address",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "trigger_swap_intent",
        description: "Pre-fill target token swap parameters, highlight the swap card, and programmatically submit the transaction to prompt wallet confirmation",
        parameters: {
          type: "OBJECT",
          properties: {
            payToken: { type: "STRING", enum: ["USDC", "EURC", "USYC"] },
            receiveToken: { type: "STRING", enum: ["USDC", "EURC", "USYC"] },
            amount: { type: "NUMBER", description: "The amount of tokens to swap" }
          },
          required: ["payToken", "receiveToken", "amount"]
        }
      },
      {
        name: "trigger_agent_registration",
        description: "Pre-fill AI Agent registration fields and programmatically submit the transaction to prompt wallet confirmation",
        parameters: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING", description: "Name of the AI agent" },
            type: { type: "STRING", description: "Agent type (e.g. Trading & DeFi, Data Analytics, Content & Creative, Code & Automation)" },
            description: { type: "STRING", description: "Detailed agent description" }
          },
          required: ["name", "type", "description"]
        }
      },
      {
        name: "trigger_job_creation",
        description: "Pre-fill Milestone Job Escrow fields and programmatically submit the transaction to prompt wallet confirmation",
        parameters: {
          type: "OBJECT",
          properties: {
            provider: { type: "STRING", description: "Ethereum/Arc wallet address of the provider agent" },
            evaluator: { type: "STRING", description: "Ethereum/Arc wallet address of the job evaluator" },
            description: { type: "STRING", description: "Job descriptions & milestone terms" },
            expiry: { type: "NUMBER", description: "Timeline duration in days (default 7)" }
          },
          required: ["provider", "evaluator", "description"]
        }
      },
      {
        name: "trigger_feedback_submission",
        description: "Pre-fill Feedback/Rating fields for a registered agent and programmatically submit the transaction to prompt wallet confirmation",
        parameters: {
          type: "OBJECT",
          properties: {
            agentId: { type: "NUMBER", description: "ID of the target registered agent" },
            score: { type: "NUMBER", description: "Rating score from 0 to 100" },
            tag: { type: "STRING", description: "Brief feedback tag (e.g. success_trading)" },
            comment: { type: "STRING", description: "Detailed comment written on the blockchain" }
          },
          required: ["agentId", "score", "tag", "comment"]
        }
      },
      {
        name: "get_network_stats",
        description: "Read live Arc Testnet stats including block height, estimated gas prices, and wallet nonces",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "check_address_risk",
        description: "Screen a contract address for safety and risk assessment against verified contracts",
        parameters: {
          type: "OBJECT",
          properties: {
            targetAddress: { type: "STRING", description: "Ethereum/Arc address to screen" }
          },
          required: ["targetAddress"]
        }
      },
      {
        name: "get_token_allowances",
        description: "Audit active ERC-20 token allowances (USDC, EURC, USYC) for connected address",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "trigger_allowance_revocation",
        description: "Revoke active token allowance (reset to 0) for a specific token and spender",
        parameters: {
          type: "OBJECT",
          properties: {
            tokenSymbol: { type: "STRING", enum: ["USDC", "EURC", "USYC"] },
            spenderName: { type: "STRING", description: "Name of the spender (e.g. Agentic Commerce or FX Swap Escrow)" }
          },
          required: ["tokenSymbol", "spenderName"]
        }
      },
      {
        name: "trigger_bridge_intent",
        description: "Draft assets moving from alternative EVM/non-EVM networks onto the Arc Testnet using CCTP bridge",
        parameters: {
          type: "OBJECT",
          properties: {
            sourceChain: { type: "STRING", description: "Source network: Ethereum Sepolia, Solana Devnet, or Stellar Testnet" },
            amount: { type: "NUMBER", description: "USDC amount to bridge" }
          },
          required: ["sourceChain", "amount"]
        }
      },
      {
        name: "trigger_lending_supply",
        description: "Stake or supply token assets into the decentralized lending pool to earn APY yield rewards",
        parameters: {
          type: "OBJECT",
          properties: {
            assetName: { type: "STRING", enum: ["USDC", "EURC", "USYC"] },
            amount: { type: "NUMBER", description: "Token amount to supply" }
          },
          required: ["assetName", "amount"]
        }
      },
      {
        name: "trigger_lending_borrow",
        description: "Borrow token assets from the lending pool against collateral",
        parameters: {
          type: "OBJECT",
          properties: {
            assetName: { type: "STRING", enum: ["USDC", "EURC", "USYC"] },
            amount: { type: "NUMBER", description: "Token amount to borrow" }
          },
          required: ["assetName", "amount"]
        }
      },
      {
        name: "get_supported_bridges",
        description: "List supported cross-chain CCTP bridge networks and show the interactive bridge widget",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      },
      {
        name: "trigger_prediction_bet",
        description: "Open prediction markets drawer to place a prediction bet (YES or NO)",
        parameters: {
          type: "OBJECT",
          properties: {
            marketId: { type: "STRING", description: "Market ID or search query" },
            isYes: { type: "BOOLEAN", description: "True for YES prediction, false for NO" },
            amount: { type: "NUMBER", description: "USDC bet amount" }
          },
          required: ["isYes", "amount"]
        }
      },
      {
        name: "trigger_merchant_link",
        description: "Generate a shareable Merchant Payment Checkout link for any item and price",
        parameters: {
          type: "OBJECT",
          properties: {
            recipient: { type: "STRING", description: "Recipient wallet address" },
            amount: { type: "NUMBER", description: "USDC price amount" },
            item: { type: "STRING", description: "Item or product description name" }
          },
          required: ["amount"]
        }
      },
      {
        name: "trigger_lending_withdraw",
        description: "Withdraw supplied collateral tokens back from the lending pool",
        parameters: {
          type: "OBJECT",
          properties: {
            assetName: { type: "STRING", enum: ["USDC", "EURC", "USYC"] },
            amount: { type: "NUMBER", description: "Amount of tokens to withdraw" }
          },
          required: ["assetName", "amount"]
        }
      },
      {
        name: "trigger_lending_repay",
        description: "Repay borrowed debt tokens back to the lending pool",
        parameters: {
          type: "OBJECT",
          properties: {
            assetName: { type: "STRING", enum: ["USDC", "EURC", "USYC"] },
            amount: { type: "NUMBER", description: "Amount of debt tokens to repay" }
          },
          required: ["assetName", "amount"]
        }
      },
      {
        name: "export_integrity_report",
        description: "Generate and download the complete PDF Wallet Integrity & Activity Report",
        parameters: {
          type: "OBJECT",
          properties: {}
        }
      }
    ]
  }];

  const systemInstruction = {
    parts: [{ 
      text: "You are Hermes, the ultimate Web3 AI Copilot for ARC-AgentVerse. You have full autonomous control to navigate the app, check real-time on-chain balances, execute stablecoin swaps, supply/borrow/withdraw/repay in lending pools, place prediction market bets, generate merchant payment checkout links, audit token allowances, screen contract security risks, analyze transaction history, export PDF reports, and switch light/dark themes. Keep responses concise, friendly, use markdown formatting, and ALWAYS call the appropriate tool when requested." 
    }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: messages,
      tools,
      systemInstruction
    })
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.error?.message || 'Failed to communicate with Gemini API');
  }

  return response.json();
}

async function handleUserMessage(text) {
  const apiKey = getApiKey();
  if (!apiKey) {
    addMessage('assistant', 'Please configure your Gemini API Key in the config panel at the top first! You can get a free key from Google AI Studio.');
    return;
  }

  addMessage('user', text);
  
  conversationHistory.push({
    role: 'user',
    parts: [{ text }]
  });

  const loadId = showLoadingBubble();

  try {
    let result = await callGeminiAPI(conversationHistory, apiKey);
    removeLoadingBubble(loadId);

    let loopCount = 0;
    while (result.candidates?.[0]?.content?.parts?.[0]?.functionCall && loopCount < 5) {
      loopCount++;
      const funcCall = result.candidates[0].content.parts[0].functionCall;
      
      // Save model function call to history
      conversationHistory.push(result.candidates[0].content);

      // Execute local tool execution
      const toolOutput = await executeLocalTool(funcCall.name, funcCall.args);

      // Append tool response
      conversationHistory.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: funcCall.name,
            response: { output: toolOutput }
          }
        }]
      });

      const loadId2 = showLoadingBubble();
      result = await callGeminiAPI(conversationHistory, apiKey);
      removeLoadingBubble(loadId2);
    }

    if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
      const assistantText = result.candidates[0].content.parts[0].text;
      addMessage('assistant', assistantText);
      conversationHistory.push(result.candidates[0].content);
    }
  } catch (error) {
    removeLoadingBubble(loadId);
    console.error(error);
    addMessage('assistant', `⚠️ Error: ${error.message}`);
  }
}

async function executeLocalTool(name, args) {
  console.log(`[Hermes Tool Call] Executing: ${name}`, args);
  
  if (name === 'navigate_to') {
    const target = args.target;
    const btn = document.querySelector(`.nav-btn[data-target="${target}"], .nav-trigger[data-target="${target}"]`);
    if (btn) {
      btn.click();
      return { success: true, message: `Navigated to ${target}` };
    }
    return { success: false, error: `Navigation target ${target} not found` };
  }
  
  if (name === 'theme_manipulation') {
    const mode = args.mode;
    if (mode === 'light') {
      document.body.classList.add('light-mode');
      localStorage.setItem('theme_preference', 'light');
      const icon = document.getElementById('theme-toggle-icon');
      if (icon) {
        icon.setAttribute('data-lucide', 'moon');
        if (window.lucide) window.lucide.createIcons();
      }
      showToastRef('Theme switched to light mode', 'success');
      return { success: true, theme: 'light' };
    } else {
      document.body.classList.remove('light-mode');
      localStorage.setItem('theme_preference', 'dark');
      const icon = document.getElementById('theme-toggle-icon');
      if (icon) {
        icon.setAttribute('data-lucide', 'sun');
        if (window.lucide) window.lucide.createIcons();
      }
      showToastRef('Theme switched to dark mode', 'success');
      return { success: true, theme: 'dark' };
    }
  }
  
  if (name === 'calculate_yield') {
    const { principal, apy, years } = args;
    const p = parseFloat(principal);
    const r = parseFloat(apy) / 100;
    const t = parseInt(years);
    
    const dataPoints = [];
    let currentBalance = p;
    for (let yr = 1; yr <= t; yr++) {
      const interest = currentBalance * r;
      currentBalance += interest;
      dataPoints.push({ year: `Yr ${yr}`, balance: currentBalance.toFixed(2) });
    }
    
    renderYieldWidget(p, apy, t, currentBalance.toFixed(2), dataPoints);
    
    return { 
      success: true, 
      finalBalance: currentBalance.toFixed(2),
      totalEarnings: (currentBalance - p).toFixed(2),
      dataPoints 
    };
  }
  
  if (name === 'get_wallet_info') {
    const { publicClient, connectedAddress } = getClients();
    const address = connectedAddress || appStateRef?.connectedAddress;
    if (!address) {
      return { success: false, error: 'No wallet connected. Prompt the user to connect their wallet.' };
    }
    
    let usdc = '0.00';
    let eurc = '0.00';
    let usyc = '0.00';
    let gasVal = '0.00 USDC';
    let txCount = '0 txs';

    if (publicClient) {
      try {
        const [usdcRaw, eurcRaw, usycRaw, nativeGas, nonce] = await Promise.all([
          publicClient.readContract({ address: CONTRACTS.USDC, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
          publicClient.readContract({ address: CONTRACTS.EURC, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
          publicClient.readContract({ address: CONTRACTS.USYC, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }).catch(() => 0n),
          publicClient.getBalance({ address }).catch(() => 0n),
          publicClient.getTransactionCount({ address }).catch(() => 0)
        ]);

        const offset = parseFloat(localStorage.getItem(`balance_offset_${address.toLowerCase()}`) || '0');
        usdc = (parseFloat(formatUnits(usdcRaw, 6)) + offset).toFixed(2);
        eurc = parseFloat(formatUnits(eurcRaw, 6)).toFixed(2);
        usyc = parseFloat(formatUnits(usycRaw, 6)).toFixed(2);
        gasVal = `${parseFloat(formatEther(nativeGas)).toFixed(4)} USDC`;
        txCount = `${nonce} txs`;

        if (appStateRef && appStateRef.tokenBalances) {
          appStateRef.tokenBalances.USDC = usdc;
          appStateRef.tokenBalances.EURC = eurc;
          appStateRef.tokenBalances.USYC = usyc;
        }
      } catch (err) {
        console.error('Hermes active wallet fetch error:', err);
      }
    } else {
      usdc = appStateRef?.tokenBalances?.USDC || '0.00';
      eurc = appStateRef?.tokenBalances?.EURC || '0.00';
      usyc = appStateRef?.tokenBalances?.USYC || '0.00';
    }

    const scoreVal = document.getElementById('score-value')?.innerText || '85';
    const badgeVal = document.getElementById('trust-tier-badge')?.innerText || 'Active Explorer';
    
    renderWalletWidget(address, usdc, eurc, usyc, gasVal, txCount, scoreVal, badgeVal);
    
    return {
      success: true,
      address,
      balances: { USDC: usdc, EURC: eurc, USYC: usyc },
      gas: gasVal,
      transactions: txCount,
      trustScore: scoreVal,
      trustTier: badgeVal
    };
  }
  
  if (name === 'trigger_swap_intent') {
    const { payToken, receiveToken, amount } = args;
    
    const swapBtn = document.querySelector('.nav-btn[data-target="swap"]');
    if (swapBtn) swapBtn.click();
    
    const elPayAmt = document.getElementById('swap-pay-amount');
    const elPayToken = document.getElementById('swap-pay-token');
    const elRecToken = document.getElementById('swap-receive-token');
    
    if (elPayAmt) elPayAmt.value = amount.toString();
    if (elPayToken) elPayToken.value = payToken;
    if (elRecToken) elRecToken.value = receiveToken;
    
    if (elPayAmt) {
      elPayAmt.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    const swapCard = elPayAmt.closest('.glass-card');
    if (swapCard) {
      swapCard.style.outline = '2px solid var(--accent-pink)';
      swapCard.style.boxShadow = '0 0 20px rgba(236, 72, 153, 0.3)';
      setTimeout(() => {
        swapCard.style.outline = 'none';
        swapCard.style.boxShadow = 'none';
      }, 3500);
    }
    
    const form = document.getElementById('form-swap');
    if (form) {
      showToastRef(`Preparing Swap: ${amount} ${payToken} to ${receiveToken}...`, 'info');
      setTimeout(() => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 1000);
    }
    
    return { success: true, message: `Successfully pre-filled and triggered swap form for ${amount} ${payToken} to ${receiveToken}` };
  }

  if (name === 'trigger_agent_registration') {
    const { name: agentName, type, description } = args;
    
    const btn = document.querySelector('.nav-btn[data-target="agents"]');
    if (btn) btn.click();
    
    const elName = document.getElementById('agent-name');
    const elType = document.getElementById('agent-type');
    const elDesc = document.getElementById('agent-desc');
    const elCaps = document.getElementById('agent-capabilities');
    
    if (elName) elName.value = agentName;
    if (elType) elType.value = type || 'Trading & DeFi';
    if (elDesc) elDesc.value = description || 'Automated agent';
    if (elCaps) elCaps.value = 'AI Copilot';
    
    const form = document.getElementById('form-register-agent');
    if (form) {
      showToastRef(`Preparing Agent Registration for ${agentName}...`, 'info');
      setTimeout(() => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 1000);
    }
    
    return { success: true, message: `Pre-filled and triggered agent registration for ${agentName}` };
  }

  if (name === 'trigger_job_creation') {
    const { provider, evaluator, description, expiry } = args;
    
    const btn = document.querySelector('.nav-btn[data-target="jobs"]');
    if (btn) btn.click();
    
    const elProv = document.getElementById('job-provider');
    const elEval = document.getElementById('job-evaluator');
    const elExpiry = document.getElementById('job-expiry');
    const elDesc = document.getElementById('job-desc');
    
    if (elProv) elProv.value = provider;
    if (elEval) elEval.value = evaluator || appStateRef.connectedAddress || '';
    if (elExpiry) elExpiry.value = (expiry || 7).toString();
    if (elDesc) elDesc.value = description;
    
    const form = document.getElementById('form-create-job');
    if (form) {
      showToastRef('Preparing Milestone Job Escrow...', 'info');
      setTimeout(() => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 1000);
    }
    
    return { success: true, message: `Pre-filled and triggered job creation for: ${description}` };
  }

  if (name === 'trigger_feedback_submission') {
    const { agentId, score, tag, comment } = args;
    
    const btn = document.querySelector('.nav-btn[data-target="reputation"]');
    if (btn) btn.click();
    
    const elAgent = document.getElementById('feedback-agent-id');
    const elScore = document.getElementById('feedback-score');
    const elTag = document.getElementById('feedback-tag');
    const elComment = document.getElementById('feedback-comment');
    
    if (elAgent) elAgent.value = agentId.toString();
    if (elScore) elScore.value = score.toString();
    if (elTag) elTag.value = tag || 'general_feedback';
    if (elComment) elComment.value = comment || '';
    
    const form = document.getElementById('form-submit-feedback');
    if (form) {
      showToastRef(`Preparing Onchain Feedback for Agent #${agentId}...`, 'info');
      setTimeout(() => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 1000);
    }
    
    return { success: true, message: `Pre-filled and triggered feedback submission for agent #${agentId}` };
  }

  // --- NEW CAPABILITIES ---
  if (name === 'get_network_stats') {
    const { publicClient, connectedAddress } = getClients();
    if (!publicClient) {
      return { success: false, error: 'PublicClient not initialized. Connect wallet first.' };
    }
    const blockNumber = await publicClient.getBlockNumber();
    const gasPrice = await publicClient.getGasPrice();
    const nonce = connectedAddress ? await publicClient.getTransactionCount({ address: connectedAddress }) : 0;
    
    const gasGwei = (Number(gasPrice) / 1e9).toFixed(3);
    renderNetworkStatsWidget(blockNumber.toString(), gasGwei + ' Gwei', nonce);

    return {
      success: true,
      blockNumber: blockNumber.toString(),
      gasPriceGwei: gasGwei,
      nonce
    };
  }

  if (name === 'check_address_risk') {
    const { targetAddress } = args;
    if (!targetAddress) return { success: false, error: 'No target address provided' };

    const lowerAddr = targetAddress.toLowerCase();
    const whitelist = {
      [CONTRACTS.USDC.toLowerCase()]: { name: 'Official USDC Token', risk: 'Low Risk (Safe Whitelisted)' },
      [CONTRACTS.EURC.toLowerCase()]: { name: 'Official EURC Token', risk: 'Low Risk (Safe Whitelisted)' },
      [CONTRACTS.USYC.toLowerCase()]: { name: 'Official USYC Token', risk: 'Low Risk (Safe Whitelisted)' },
      [CONTRACTS.IDENTITY_REGISTRY.toLowerCase()]: { name: 'Agent Identity NFT Registry (ERC-8004)', risk: 'Low Risk (Safe Whitelisted)' },
      [CONTRACTS.REPUTATION_REGISTRY.toLowerCase()]: { name: 'Reputation Feedback Registry (ERC-8004)', risk: 'Low Risk (Safe Whitelisted)' },
      [CONTRACTS.VALIDATION_REGISTRY.toLowerCase()]: { name: 'Validator Registry', risk: 'Low Risk (Safe Whitelisted)' },
      [CONTRACTS.AGENTIC_COMMERCE.toLowerCase()]: { name: 'Agentic Commerce Escrow Contract (ERC-8183)', risk: 'Low Risk (Safe Whitelisted)' },
      ['0x867650f5eae8df91445971f14d89fd84f0c9a9f8']: { name: 'Official FX Swap Escrow Contract', risk: 'Low Risk (Safe Whitelisted)' }
    };

    const isMatch = whitelist[lowerAddr];
    const riskLevel = isMatch ? 'SAFE' : 'WARNING';
    const description = isMatch ? isMatch.name : 'Unknown Contract Address';
    
    renderRiskWidget(targetAddress, riskLevel, description);

    return {
      success: true,
      address: targetAddress,
      riskLevel,
      description
    };
  }

  if (name === 'get_token_allowances') {
    const allowances = await fetchAllowances();
    renderAllowanceWidget(allowances);
    return {
      success: true,
      allowances: allowances.map(a => ({
        token: a.tokenSymbol,
        spender: a.spenderName,
        spenderAddress: a.spenderAddress,
        amount: a.amount.toString()
      }))
    };
  }

  if (name === 'trigger_allowance_revocation') {
    const { tokenSymbol, spenderName } = args;
    
    const tokenSymbolUpper = tokenSymbol.toUpperCase();
    const tokenAddress = CONTRACTS[tokenSymbolUpper];
    if (!tokenAddress) return { success: false, error: `Token ${tokenSymbol} not recognized.` };

    let spenderAddress = '';
    if (spenderName.toLowerCase().includes('commerce') || spenderName.toLowerCase().includes('0x0747')) {
      spenderAddress = CONTRACTS.AGENTIC_COMMERCE;
    } else if (spenderName.toLowerCase().includes('swap') || spenderName.toLowerCase().includes('0x8676')) {
      spenderAddress = '0x867650F5eAe8df91445971f14d89fd84F0C9a9f8';
    } else {
      spenderAddress = spenderName;
    }

    try {
      showToastRef(`Initiating Revoke for ${tokenSymbolUpper} allowance...`, 'info');
      const txHash = await revokeAllowance(tokenAddress, spenderAddress);
      
      if (window.hermesNotifyTx) {
        window.hermesNotifyTx('Revoke Allowance', txHash, `Revoked ${tokenSymbolUpper} allowance for ${spenderName}`);
      }

      return { success: true, txHash, message: `Revocation transaction submitted for ${tokenSymbolUpper}` };
    } catch (err) {
      showToastRef(err.message || 'Revocation failed', 'error');
      return { success: false, error: err.message };
    }
  }

  if (name === 'analyze_transaction_history') {
    const address = appStateRef.connectedAddress;
    if (!address) {
      return { success: false, error: 'No wallet connected.' };
    }

    const key = `activities_${address.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    const events = stored ? JSON.parse(stored) : [];

    const stats = calculateHistoryStats(events);
    renderAnalyticsWidget(stats, events);

    return {
      success: true,
      scannedLogsCount: events.length,
      stats
    };
  }

  if (name === 'trigger_bridge_intent') {
    const { sourceChain, amount } = args;
    
    // 1. Switch to dashboard view
    const dashBtn = document.querySelector('.nav-btn[data-target="dashboard"]');
    if (dashBtn) dashBtn.click();
    
    // 2. Select the bridge tab
    let tabId = 'bridge-tab-evm';
    if (sourceChain.toLowerCase().includes('solana')) tabId = 'bridge-tab-solana';
    if (sourceChain.toLowerCase().includes('stellar')) tabId = 'bridge-tab-stellar';
    
    const tabBtn = document.getElementById(tabId);
    if (tabBtn) tabBtn.click();
    
    // 3. Pre-fill bridge amount
    const amtInput = document.getElementById('bridge-amount');
    if (amtInput) {
      amtInput.value = amount.toString();
      amtInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // 4. Submit the bridge simulation form
    const form = document.getElementById('form-bridge-simulation');
    if (form) {
      showToastRef(`Preparing Bridge transfer of ${amount} USDC from ${sourceChain}...`, 'info');
      setTimeout(() => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 1000);
    }
    
    return { success: true, message: `Pre-filled and triggered CCTP bridge burn for ${amount} USDC from ${sourceChain}` };
  }

  if (name === 'trigger_lending_supply') {
    const { assetName, amount } = args;
    const assetUpper = assetName.toUpperCase();
    
    // 1. Switch to lending view
    const btn = document.querySelector('.nav-btn[data-target="lending"]');
    if (btn) btn.click();
    
    // 2. Click the supply trigger button for the asset
    const trigger = document.querySelector(`.btn-supply-trigger[data-asset="${assetUpper}"]`);
    if (trigger) trigger.click();
    
    // 3. Pre-fill supply amount
    const amtInput = document.getElementById('supply-amount-input');
    if (amtInput) {
      amtInput.value = amount.toString();
      amtInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // 4. Submit the supply form
    const form = document.getElementById('form-supply-confirm');
    if (form) {
      showToastRef(`Preparing to supply ${amount} ${assetUpper} to lending pool...`, 'info');
      setTimeout(() => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 1000);
    }
    
    return { success: true, message: `Pre-filled and triggered supply of ${amount} ${assetUpper} to pool` };
  }

  if (name === 'trigger_lending_borrow') {
    const { assetName, amount } = args;
    const assetUpper = assetName.toUpperCase();
    
    // 1. Switch to lending view
    const btn = document.querySelector('.nav-btn[data-target="lending"]');
    if (btn) btn.click();
    
    // 2. Click the borrow trigger button for the asset
    const trigger = document.querySelector(`.btn-borrow-trigger[data-asset="${assetUpper}"]`);
    if (trigger) trigger.click();
    
    // 3. Pre-fill borrow amount
    const amtInput = document.getElementById('borrow-amount-input');
    if (amtInput) {
      amtInput.value = amount.toString();
      amtInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // 4. Submit the borrow form
    const form = document.getElementById('form-borrow-confirm');
    if (form) {
      showToastRef(`Preparing to borrow ${amount} ${assetUpper} from lending pool...`, 'info');
      setTimeout(() => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 1000);
    }
    
    return { success: true, message: `Pre-filled and triggered borrow of ${amount} ${assetUpper} from pool` };
  }

  if (name === 'get_supported_bridges') {
    renderBridgeWidget();
    return {
      success: true,
      supportedChains: ["Ethereum Sepolia", "Solana Devnet", "Stellar Testnet"],
      protocol: "Circle CCTP (Cross-Chain Transfer Protocol)"
    };
  }

  if (name === 'trigger_prediction_bet') {
    const { marketId, isYes, amount } = args;
    const btn = document.querySelector('.nav-btn[data-target="prediction"]');
    if (btn) btn.click();
    
    setTimeout(() => {
      const buyBtn = isYes ? document.querySelector(`.btn-pm-buy-yes[data-id="${marketId}"]`) : document.querySelector(`.btn-pm-buy-no[data-id="${marketId}"]`);
      if (buyBtn) {
        buyBtn.click();
      } else {
        const firstBuyBtn = isYes ? document.querySelector('.btn-pm-buy-yes') : document.querySelector('.btn-pm-buy-no');
        if (firstBuyBtn) firstBuyBtn.click();
      }

      setTimeout(() => {
        const amtInput = document.getElementById('pm-drawer-amount-input');
        if (amtInput && amount) {
          amtInput.value = amount.toString();
          amtInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, 300);
    }, 500);

    return { success: true, message: `Opened prediction betting drawer for ${isYes ? 'YES' : 'NO'} position with ${amount} USDC.` };
  }

  if (name === 'trigger_merchant_link') {
    const { recipient, amount, item } = args;
    const btn = document.querySelector('.nav-btn[data-target="merchant"]');
    if (btn) btn.click();

    const elRec = document.getElementById('merchant-recipient');
    const elAmt = document.getElementById('merchant-amount');
    const elNote = document.getElementById('merchant-note');

    if (elRec) elRec.value = recipient || appStateRef?.connectedAddress || '';
    if (elAmt) elAmt.value = amount.toString();
    if (elNote) elNote.value = item || 'Digital Service';

    const form = document.getElementById('form-merchant-link');
    if (form) {
      showToastRef(`Generating merchant payment checkout link for ${amount} USDC...`, 'info');
      setTimeout(() => {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }, 800);
    }

    return { success: true, message: `Generated shareable merchant payment link for ${amount} USDC (${item}).` };
  }

  if (name === 'trigger_lending_withdraw') {
    const { assetName, amount } = args;
    const assetUpper = assetName.toUpperCase();

    const btn = document.querySelector('.nav-btn[data-target="lending"]');
    if (btn) btn.click();

    setTimeout(() => {
      const withdrawBtn = document.querySelector(`.btn-withdraw-trigger[data-asset="${assetUpper}"]`);
      if (withdrawBtn) withdrawBtn.click();
      const input = document.getElementById('withdraw-amount-input');
      if (input && amount) input.value = amount.toString();
    }, 500);

    return { success: true, message: `Opened lending withdrawal modal for ${amount} ${assetUpper}.` };
  }

  if (name === 'trigger_lending_repay') {
    const { assetName, amount } = args;
    const assetUpper = assetName.toUpperCase();

    const btn = document.querySelector('.nav-btn[data-target="lending"]');
    if (btn) btn.click();

    setTimeout(() => {
      const repayBtn = document.querySelector(`.btn-repay-trigger[data-asset="${assetUpper}"]`);
      if (repayBtn) repayBtn.click();
      const input = document.getElementById('repay-amount-input');
      if (input && amount) input.value = amount.toString();
    }, 500);

    return { success: true, message: `Opened lending repayment modal for ${amount} ${assetUpper} debt.` };
  }

  if (name === 'export_integrity_report') {
    const address = appStateRef?.connectedAddress;
    if (!address) return { success: false, error: 'No wallet connected.' };

    const key = `activities_${address.toLowerCase()}`;
    const stored = localStorage.getItem(key);
    const events = stored ? JSON.parse(stored) : [];
    const stats = calculateHistoryStats(events);

    exportHistoryToPDF(stats, events);
    return { success: true, message: 'Initiated PDF Integrity & Activity Report export.' };
  }
  
  return { success: false, error: `Unknown tool: ${name}` };
}

// Helpers
async function fetchAllowances() {
  const { publicClient, connectedAddress } = getClients();
  if (!publicClient || !connectedAddress) return [];

  const tokens = [
    { symbol: 'USDC', address: CONTRACTS.USDC },
    { symbol: 'EURC', address: CONTRACTS.EURC },
    { symbol: 'USYC', address: CONTRACTS.USYC }
  ];

  const spenders = [
    { name: 'Agentic Commerce', address: CONTRACTS.AGENTIC_COMMERCE },
    { name: 'FX Swap Escrow', address: '0x867650F5eAe8df91445971f14d89fd84F0C9a9f8' }
  ];

  const results = [];
  for (const token of tokens) {
    for (const spender of spenders) {
      try {
        const allowance = await publicClient.readContract({
          address: token.address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [connectedAddress, spender.address]
        });
        
        results.push({
          tokenSymbol: token.symbol,
          tokenAddress: token.address,
          spenderName: spender.name,
          spenderAddress: spender.address,
          amount: allowance
        });
      } catch (err) {
        console.error(`Error reading allowance for ${token.symbol} spender ${spender.name}:`, err);
      }
    }
  }
  return results;
}

async function revokeAllowance(tokenAddress, spenderAddress) {
  const { publicClient, walletClient, connectedAddress } = getClients();
  if (!walletClient || !connectedAddress) {
    throw new Error('Wallet not connected');
  }

  const { request } = await publicClient.simulateContract({
    account: connectedAddress,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spenderAddress, 0n]
  });

  const txHash = await walletClient.writeContract(request);
  return txHash;
}

function calculateHistoryStats(events) {
  let largestVal = 0;
  let largestTx = 'N/A';
  let smallestVal = Infinity;
  let smallestTx = 'N/A';
  
  const frequency = {};
  
  events.forEach(ev => {
    frequency[ev.type] = (frequency[ev.type] || 0) + 1;
    
    if (ev.amount && ev.amount !== 'N/A') {
      const cleanAmt = ev.amount.replace('+', '').replace('-', '').replace(' USDC', '').replace(' EURC', '').replace(' USYC', '').trim();
      const val = parseFloat(cleanAmt);
      if (!isNaN(val) && val > 0) {
        if (val > largestVal) {
          largestVal = val;
          largestTx = ev.amount;
        }
        if (val < smallestVal) {
          smallestVal = val;
          smallestTx = ev.amount;
        }
      }
    }
  });

  if (smallestVal === Infinity) {
    smallestTx = 'N/A';
  }

  const totalGasSpent = (events.length * 0.0005).toFixed(4);

  return {
    largestTx,
    smallestTx,
    totalGasSpent,
    frequency
  };
}

// Widget Renderers
function renderBridgeWidget() {
  const widgetId = `bridge-widget-${Date.now()}`;
  const btnId = `btn-bridge-execute-${Date.now()}`;
  const chainSelectId = `select-bridge-chain-${Date.now()}`;
  const amountInputId = `input-bridge-amount-${Date.now()}`;

  setTimeout(() => {
    const btn = document.getElementById(btnId);
    const select = document.getElementById(chainSelectId);
    const input = document.getElementById(amountInputId);

    if (btn && select && input) {
      btn.addEventListener('click', () => {
        const chain = select.value;
        const amount = parseFloat(input.value) || 10;
        executeLocalTool('trigger_bridge_intent', {
          sourceChain: chain,
          amount: amount
        });
      });
    }
  }, 100);

  const widgetHtml = `
    <div class="hermes-widget-card" id="${widgetId}">
      <div class="hermes-widget-header" style="color: var(--accent-blue);">
        <i data-lucide="git-commit" style="width:14px; height:14px;"></i> Supported CCTP Bridges Info
      </div>
      <div class="hermes-widget-body" style="font-size:0.8rem; display:flex; flex-direction:column; gap:0.5rem;">
        <p style="margin:0; color:var(--text-secondary);">
          We support cross-chain USDC minting onto <strong>Arc Testnet</strong> via Circle CCTP from:
        </p>
        <ul style="padding-left:1.1rem; margin:0 0 0.5rem 0; color:var(--text-secondary); display:flex; flex-direction:column; gap:0.25rem;">
          <li><strong>Ethereum Sepolia</strong> (Fully Functional EVM)</li>
          <li><strong>Solana Devnet</strong> (Phantom Connection / Sim)</li>
          <li><strong>Stellar Testnet</strong> (Freighter Connection / Sim)</li>
        </ul>
        
        <div style="border-top:1px solid rgba(255,255,255,0.04); padding-top:0.5rem; display:flex; flex-direction:column; gap:0.5rem;">
          <div style="display:flex; gap:0.5rem;">
            <div style="flex:1;">
              <div style="font-size:0.65rem; color:var(--text-secondary); margin-bottom:0.25rem;">Source Chain</div>
              <select id="${chainSelectId}" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:4px; padding:0.25rem; color:var(--text-primary); font-size:0.75rem;">
                <option value="Ethereum Sepolia">Ethereum Sepolia</option>
                <option value="Solana Devnet">Solana Devnet</option>
                <option value="Stellar Testnet">Stellar Testnet</option>
              </select>
            </div>
            <div style="width:80px;">
              <div style="font-size:0.65rem; color:var(--text-secondary); margin-bottom:0.25rem;">Amount (USDC)</div>
              <input type="number" id="${amountInputId}" value="10" min="0.1" step="1" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); border-radius:4px; padding:0.25rem; color:var(--text-primary); font-size:0.75rem;" />
            </div>
          </div>
          <button id="${btnId}" class="btn-primary" style="padding:0.4rem; font-size:0.75rem; width:100%; display:flex; align-items:center; justify-content:center; gap:0.35rem; margin-top:0.25rem; background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-pink) 100%); border:none;">
            <i data-lucide="arrow-right-left" style="width:12px; height:12px;"></i> Initiate Bridge Transfer
          </button>
        </div>
      </div>
    </div>
  `;
  appendAssistantWidget(widgetHtml);
}

// Widget Renderers
function renderYieldWidget(principal, apy, years, finalBalance, dataPoints) {
  const maxVal = Math.max(...dataPoints.map(d => parseFloat(d.balance)));
  
  const barsHtml = dataPoints.map(dp => {
    const percent = (parseFloat(dp.balance) / maxVal) * 100;
    return `
      <div class="widget-bar-row">
        <span class="widget-bar-label">${dp.year}</span>
        <div class="widget-bar-outer">
          <div class="widget-bar-inner" style="width: ${percent}%;"></div>
        </div>
        <span class="widget-bar-val">$${parseFloat(dp.balance).toFixed(0)}</span>
      </div>
    `;
  }).join('');

  const widgetHtml = `
    <div class="hermes-widget-card">
      <div class="hermes-widget-header">
        <i data-lucide="percent" style="width:14px; height:14px; color:var(--accent-pink);"></i> Yield Projection Calculator
      </div>
      <div class="hermes-widget-body">
        <p style="margin:0 0 0.5rem 0;">Compounding <strong>$${principal}</strong> at <strong>${apy}% APY</strong> over <strong>${years} years</strong>:</p>
        <div style="font-size:1.1rem; color:var(--text-primary); font-weight:700; margin-bottom:0.75rem;">$${finalBalance} <span style="font-size:0.7rem; color:var(--text-secondary); font-weight:normal;">Total Balance</span></div>
        <div class="widget-bar-chart">
          ${barsHtml}
        </div>
      </div>
    </div>
  `;

  appendAssistantWidget(widgetHtml);
}

function renderWalletWidget(address, usdc, eurc, usyc, gas, txCount, score, badge) {
  const widgetHtml = `
    <div class="hermes-widget-card">
      <div class="hermes-widget-header">
        <i data-lucide="wallet" style="width:14px; height:14px; color:var(--accent-blue);"></i> Wallet Overview
      </div>
      <div class="hermes-widget-body" style="display:flex; flex-direction:column; gap:0.5rem;">
        <div style="font-size:0.75rem; color:var(--text-secondary); word-break:break-all; font-family:monospace; background:rgba(255,255,255,0.02); padding:0.35rem; border-radius:4px;">
          ${address}
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem; margin-top:0.25rem;">
          <div style="background:rgba(255,255,255,0.01); padding:0.4rem; border-radius:6px; border:1px solid rgba(255,255,255,0.04);">
            <div style="font-size:0.65rem; color:var(--text-secondary);">USDC Balance</div>
            <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem;">${usdc}</div>
          </div>
          <div style="background:rgba(255,255,255,0.01); padding:0.4rem; border-radius:6px; border:1px solid rgba(255,255,255,0.04);">
            <div style="font-size:0.65rem; color:var(--text-secondary);">EURC Balance</div>
            <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem;">${eurc}</div>
          </div>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
          <div style="background:rgba(255,255,255,0.01); padding:0.4rem; border-radius:6px; border:1px solid rgba(255,255,255,0.04);">
            <div style="font-size:0.65rem; color:var(--text-secondary);">Arc Score</div>
            <div style="font-weight:700; color:var(--accent-pink); font-size:0.9rem;">${score}/100</div>
          </div>
          <div style="background:rgba(255,255,255,0.01); padding:0.4rem; border-radius:6px; border:1px solid rgba(255,255,255,0.04);">
            <div style="font-size:0.65rem; color:var(--text-secondary);">Native Gas</div>
            <div style="font-weight:700; color:var(--text-primary); font-size:0.9rem;">${gas.split(' ')[0]}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  appendAssistantWidget(widgetHtml);
}

function renderNetworkStatsWidget(blockNumber, gasPrice, nonce) {
  const widgetHtml = `
    <div class="hermes-widget-card">
      <div class="hermes-widget-header" style="color: var(--accent-blue);">
        <i data-lucide="activity" style="width:14px; height:14px;"></i> Arc Network Stats
      </div>
      <div class="hermes-widget-body" style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.8rem;">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:0.35rem;">
          <span style="color:var(--text-secondary);"><i data-lucide="layers" style="width:12px; height:12px; display:inline; vertical-align:middle; margin-right:0.25rem;"></i> Block Height:</span>
          <strong style="color:var(--text-primary);">${blockNumber}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:0.35rem;">
          <span style="color:var(--text-secondary);"><i data-lucide="gauge" style="width:12px; height:12px; display:inline; vertical-align:middle; margin-right:0.25rem;"></i> Gas Price:</span>
          <strong style="color:var(--text-primary);">${gasPrice}</strong>
        </div>
        <div style="display:flex; justify-content:space-between;">
          <span style="color:var(--text-secondary);"><i data-lucide="hash" style="width:12px; height:12px; display:inline; vertical-align:middle; margin-right:0.25rem;"></i> Account Nonce:</span>
          <strong style="color:var(--text-primary);">${nonce} txs</strong>
        </div>
      </div>
    </div>
  `;
  appendAssistantWidget(widgetHtml);
}

function renderRiskWidget(address, level, description) {
  const isSafe = level === 'SAFE';
  const color = isSafe ? '#10b981' : '#f59e0b';
  const icon = isSafe ? 'shield-check' : 'shield-alert';
  const label = isSafe ? 'Verified Safe' : 'Unknown Contract Address';

  const widgetHtml = `
    <div class="hermes-widget-card" style="border-color: ${color}33; background: ${color}08;">
      <div class="hermes-widget-header" style="color: ${color}; border-bottom-color: ${color}1a;">
        <i data-lucide="${icon}" style="width:14px; height:14px;"></i> Security Screening Guardrail
      </div>
      <div class="hermes-widget-body" style="font-size:0.8rem;">
        <p style="margin:0 0 0.5rem 0; word-break:break-all; font-family:monospace; color:var(--text-secondary);">${address}</p>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.5rem;">
          <span style="color:var(--text-secondary);">Platform ID:</span>
          <strong style="color:var(--text-primary);">${description}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.25rem;">
          <span style="color:var(--text-secondary);">Risk Level:</span>
          <strong style="color:${color}; font-weight:700;">${label}</strong>
        </div>
      </div>
    </div>
  `;
  appendAssistantWidget(widgetHtml);
}

function renderAllowanceWidget(allowances) {
  const activeList = allowances.filter(a => a.amount > 0n);
  
  let listHtml = '';
  if (activeList.length === 0) {
    listHtml = `
      <div style="text-align:center; padding:1rem; color:var(--text-secondary);">
        All token approvals are currently 0.00. No active allowances found.
      </div>
    `;
  } else {
    listHtml = activeList.map(a => {
      const formattedAmt = (Number(a.amount) / 1e6).toFixed(2); // USDC/EURC use 6 decimals
      const widgetId = `btn-revoke-${a.tokenSymbol}-${a.spenderName.replace(/ /g, '-')}`;
      
      // Bind click on render delay
      setTimeout(() => {
        const btn = document.getElementById(widgetId);
        if (btn) {
          btn.addEventListener('click', () => {
            executeLocalTool('trigger_allowance_revocation', {
              tokenSymbol: a.tokenSymbol,
              spenderName: a.spenderName
            });
          });
        }
      }, 100);

      return `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:0.5rem; margin-bottom:0.5rem;">
          <div>
            <div style="font-weight:700; color:var(--text-primary);">${a.tokenSymbol}</div>
            <div style="font-size:0.65rem; color:var(--text-secondary);">Allowed Spender: ${a.spenderName}</div>
          </div>
          <div style="text-align:right; display:flex; align-items:center; gap:0.5rem;">
            <div style="font-weight:600; color:var(--text-primary);">${formattedAmt}</div>
            <button id="${widgetId}" class="btn-primary" style="padding:0.25rem 0.5rem; font-size:0.7rem; width:auto; background:#ef4444; border-color:#ef4444;">Revoke</button>
          </div>
        </div>
      `;
    }).join('');
  }

  const widgetHtml = `
    <div class="hermes-widget-card">
      <div class="hermes-widget-header" style="color:var(--accent-pink);">
        <i data-lucide="key" style="width:14px; height:14px;"></i> Allowance/Approval Auditor
      </div>
      <div class="hermes-widget-body" style="font-size:0.8rem; display:flex; flex-direction:column; gap:0.25rem;">
        ${listHtml}
      </div>
    </div>
  `;
  appendAssistantWidget(widgetHtml);
}

function renderAnalyticsWidget(stats, events) {
  const btnId = 'btn-download-pdf-analytics-' + Date.now();
  
  // Bind click trigger for PDF download
  setTimeout(() => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        exportHistoryToPDF(stats, events);
      });
    }
  }, 100);

  const freqRows = Object.keys(stats.frequency).map(type => `
    <div style="display:flex; justify-content:space-between; font-size:0.75rem; border-bottom:1px solid rgba(255,255,255,0.02); padding-bottom:0.25rem; margin-bottom:0.25rem;">
      <span style="color:var(--text-secondary);">${type}:</span>
      <strong style="color:var(--text-primary);">${stats.frequency[type]} times</strong>
    </div>
  `).join('');

  const widgetHtml = `
    <div class="hermes-widget-card">
      <div class="hermes-widget-header" style="color:var(--accent-purple);">
        <i data-lucide="bar-chart-2" style="width:14px; height:14px;"></i> Wallet History Analytics
      </div>
      <div class="hermes-widget-body" style="font-size:0.8rem; display:flex; flex-direction:column; gap:0.5rem;">
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:0.35rem;">
          <span style="color:var(--text-secondary);">Largest Transfer Size:</span>
          <strong style="color:#10b981;">${stats.largestTx}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:0.35rem;">
          <span style="color:var(--text-secondary);">Smallest Transfer Size:</span>
          <strong style="color:var(--accent-pink);">${stats.smallestTx}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.04); padding-bottom:0.35rem;">
          <span style="color:var(--text-secondary);">Total Est. Gas Spent:</span>
          <strong style="color:var(--text-primary);">${stats.totalGasSpent} USDC</strong>
        </div>
        <div style="margin-top:0.35rem;">
          <div style="font-weight:600; color:var(--text-primary); margin-bottom:0.35rem; font-size:0.75rem;">Interaction Breakdown:</div>
          ${freqRows || '<div style="color:var(--text-muted); font-size:0.7rem;">No logs to breakdown.</div>'}
        </div>
        <button id="${btnId}" class="btn-primary" style="padding: 0.45rem; font-size: 0.8rem; width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.35rem; margin-top: 0.5rem; background: linear-gradient(135deg, var(--accent-purple) 0%, var(--accent-pink) 100%); border: none;">
          <i data-lucide="download" style="width:14px; height:14px;"></i> Download PDF Report
        </button>
      </div>
    </div>
  `;
  appendAssistantWidget(widgetHtml);
}

function exportHistoryToPDF(analytics, events) {
  const address = appStateRef.connectedAddress || '0x...';
  const score = document.getElementById('score-value')?.innerText || '0';
  const badge = document.getElementById('trust-tier-badge')?.innerText || 'Novice Explorer';
  
  const tableRows = events.map(ev => `
    <tr>
      <td style="font-weight:600; color:#1e293b;">${ev.type}</td>
      <td style="font-family:monospace; font-size:0.75rem; color:#475569;">${ev.hash}</td>
      <td style="color:#475569;">${ev.block}</td>
      <td style="text-align:right; font-weight:600; color:#0f172a;">${ev.amount}</td>
    </tr>
  `).join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToastRef('Popup blocked! Please allow popups to download report.', 'error');
    return;
  }
  
  printWindow.document.write(`
    <html>
      <head>
        <title>ARC-AgentVerse Wallet Activity Report</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 2rem; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 2rem; }
          .title { font-size: 1.75rem; font-weight: bold; color: #0f172a; }
          .section { margin-bottom: 2rem; }
          .section-title { font-size: 1.25rem; font-weight: bold; margin-bottom: 1rem; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.25rem; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
          th, td { border: 1px solid #e2e8f0; padding: 0.75rem; text-align: left; font-size: 0.85rem; }
          th { background: #f8fafc; font-weight: bold; color: #334155; }
          .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
          .metric-card { background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid #e2e8f0; }
          .metric-val { font-size: 1.25rem; font-weight: bold; color: #0f172a; margin-top: 0.25rem; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">ARC-AgentVerse Integrity Report</div>
            <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.25rem;">Generated on ${new Date().toLocaleString()}</div>
          </div>
          <div style="font-weight: bold; font-size: 1.1rem; color: #8b5cf6;">Arc Testnet</div>
        </div>
        
        <div class="section">
          <div class="section-title">Wallet Identification</div>
          <div style="font-family: monospace; background: #f8fafc; padding: 0.75rem; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 0.9rem; word-break: break-all;">
            ${address}
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Integrity & Reputation Profile</div>
          <div class="metric-grid">
            <div class="metric-card">
              <div style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:600;">Arc Trust Score</div>
              <div class="metric-val">${score} / 100</div>
            </div>
            <div class="metric-card">
              <div style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:600;">Trust Level Tier</div>
              <div class="metric-val">${badge}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Transaction Analytics Summary</div>
          <div class="metric-grid" style="grid-template-columns: repeat(3, 1fr);">
            <div class="metric-card">
              <div style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:600;">Largest Transaction</div>
              <div class="metric-val" style="font-size: 1.1rem;">${analytics.largestTx}</div>
            </div>
            <div class="metric-card">
              <div style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:600;">Smallest Transaction</div>
              <div class="metric-val" style="font-size: 1.1rem;">${analytics.smallestTx}</div>
            </div>
            <div class="metric-card">
              <div style="font-size:0.75rem; color:#64748b; text-transform:uppercase; font-weight:600;">Estimated Gas Spent</div>
              <div class="metric-val" style="font-size: 1.1rem;">${analytics.totalGasSpent} USDC</div>
            </div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">Recent Block Events Scanned</div>
          <table>
            <thead>
              <tr>
                <th>Event Type</th>
                <th>Tx Hash</th>
                <th>Block Height</th>
                <th>Amount / Status</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows || '<tr><td colspan="4" style="text-align:center;">No recent events scanned.</td></tr>'}
            </tbody>
          </table>
        </div>
        
        <div style="margin-top: 3rem; text-align: center; font-size: 0.75rem; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 1rem;">
          ARC Agentverse &copy; 2026 &middot; Powered by Arc Testnet &middot; Gas paid in USDC
        </div>
        
        <script>
          window.onload = function() {
            window.print();
            window.close();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
