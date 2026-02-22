# Project Rules

## OPNet Project on Bitcoin Layer 1

### Packages
- ALWAYS use @btc-vision/bitcoin (NEVER bitcoinjs-lib)
- ALWAYS use @btc-vision/ecpair (NEVER ecpair)
- ALWAYS use the opnet npm package for blockchain queries
- ALWAYS use hyper-express for backends (NEVER Express, Fastify, or Koa)
- Check the opnet-development skill docs for exact package versions -- do not guess

### Smart Contracts
- Written in AssemblyScript, compiled to WebAssembly
- Use SafeMath for ALL u256 arithmetic -- no raw operators
- No unbounded loops -- all iterations must have a known max
- Constructor runs on every call -- use onDeployment() for one-time init
- Each storage pointer must have a unique value -- collisions corrupt data

### Frontend
- Connect to OP_WALLET (NEVER MetaMask)
- Use JSONRpcProvider from opnet for all RPC queries
- NEVER use the WalletConnect provider for read operations
- Include the WalletConnect popup CSS fix
- Pass null for signer/mldsaSigner in sendTransaction (wallet signs)

### General
- TypeScript only -- no raw JavaScript
- Read the skill docs before writing any code
- Simulate every contract call before sending a transaction
