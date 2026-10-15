export type ProviderId = 'codex' | 'claude';
export interface QuotaWindow { id:string; label:string; used:number; minutes:number|null; resets:number|null }
export interface ProviderLimits { provider:ProviderId; available:boolean; connected:boolean; bridge:boolean; checked:number|null; windows:QuotaWindow[]; error:string|null }
export interface LimitsSnapshot { codex:ProviderLimits; claude:ProviderLimits }
export function emptyLimits(provider:ProviderId):ProviderLimits { return {provider,available:false,connected:false,bridge:false,checked:null,windows:[],error:null}; }
export function usableWindow(window:QuotaWindow, now=Date.now()/1000) { return Number.isFinite(window.used) && window.used>=0 && window.used<=100 && (window.resets===null || window.resets>now); }
export function remaining(window:QuotaWindow) { return Math.max(0,Math.floor(100-window.used)); }
export function stale(limits:ProviderLimits, now=Date.now()/1000) { return limits.checked===null || now-limits.checked>600; }
export function summary(limits:ProviderLimits, now=Date.now()/1000) {
 const windows=limits.windows.filter(w=>usableWindow(w,now));
 // The tightest window is what actually prevents further use.
 return stale(limits,now)||limits.error||!windows.length?'—':`${Math.min(...windows.map(remaining))}%`;
}
