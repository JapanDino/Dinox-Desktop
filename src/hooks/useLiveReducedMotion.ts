import {useSyncExternalStore} from 'react';
const query=()=>window.matchMedia('(prefers-reduced-motion: reduce)');
const subscribe=(notify:()=>void)=>{const media=query();media.addEventListener('change',notify);return()=>media.removeEventListener('change',notify);};
// Also reacts when the OS preference changes while Bloom is already open.
export const useLiveReducedMotion=()=>useSyncExternalStore(subscribe,()=>query().matches,()=>false);
