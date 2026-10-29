import { accountSetupEnabled } from './accountSetup';
export const requireAccountSetup = accountSetupEnabled(import.meta.env.VITE_ACCOUNT_SETUP_TARGET || '', window.location.hostname, import.meta.env.DEV);
