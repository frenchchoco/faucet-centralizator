import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { FaucetManager } from './FaucetManager';

// Register the contract factory with the runtime.
// The factory is called lazily on first access.
Blockchain.contract = (): FaucetManager => {
    return new FaucetManager();
};

// Re-export runtime entry points so the WASM host can call them.
export { execute, onDeploy, onUpdate } from '@btc-vision/btc-runtime/runtime/exports';

// VERY IMPORTANT
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
