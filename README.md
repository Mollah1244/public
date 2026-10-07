# Nomarc Protocol & Arc Agentverse 🚀

An advanced, stablecoin-native AI Agent verse and Decentralized Finance (DeFi) Platform built for the **Arc Testnet**, powered by the official **Circle App Kit SDK (`@circle-fin/app-kit`)**.

---

## ✨ Features

- 🔄 **100% Real On-Chain Swap**: Instant, real-time stablecoin swaps between USDC, EURC, and USYC powered by Circle App Kit SDK.
- 🌉 **Official Circle CCTP Cross-Chain Bridge**: Seamlessly bridge native USDC between **Ethereum Sepolia**, **Base Sepolia**, **Arbitrum Sepolia**, **Avalanche Fuji**, **Optimism Sepolia**, and **Arc Testnet**.
- 📊 **Real-Time Market Analytics & Volatility**: Interactive volatility sparklines and AI-driven sentiment analysis.
- 🎯 **Pop-up Free Prediction Markets**: Seamless prediction market trading with instant background signature execution.
- 🔐 **Zero Local Offsets / 100% On-Chain State**: All token balances and transaction receipts are fetched directly from live RPC nodes with exponential backoff retries.

---

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher)
- Browser Wallet extension ([MetaMask](https://metamask.io/) or [Rabby](https://rabby.io/)) connected to **Arc Testnet**.

### Installation

```bash
# Clone or extract the project folder
cd arc-agentverse

# Install dependencies
npm install
```

### Environment Setup

Create a `.env` file in the root directory (or copy from `.env.example`):

```env
VITE_KIT_KEY=KIT_KEY:b3b04b875a7c9ac3a87630450a84e2d1:e193cc092ba20e7bdcd0c728ac1c7c70
VITE_STANDARD_API_KEY=TEST_API_KEY:2742440739ffec8ffca0d5e798d5b3f2:b54616f04f0fd670adaf89fe4aded312
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🚀 Build for Production

```bash
npm run build
```

The optimized production bundle will be generated in the `dist/` directory.

---

## 📄 License

MIT License © 2026 Nomarc Protocol Team
