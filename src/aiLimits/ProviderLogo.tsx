import type {SVGProps} from 'react';
import OpenAILogo from '../assets/brands/openai.svg?react';
import ClaudeLogo from '../assets/brands/claude.svg?react';
import type {ProviderId} from './model';
import './providerLogo.css';
/** Provider identification only; these marks are not Dinox branding. */
export function ProviderLogo({provider,size=16}: {provider:ProviderId;size?:number}) {
 const Mark=provider==='codex'?OpenAILogo:ClaudeLogo;
 return <span className={`provider-logo provider-logo-${provider}`} style={{width:size,height:size}} aria-hidden="true"><Mark focusable="false" aria-hidden="true"/></span>;
}
type IconProps=SVGProps<SVGSVGElement>&{size?:number;strokeWidth?:number};
export const CodexProviderIcon=({size=16}:IconProps)=><ProviderLogo provider="codex" size={size}/>;
export const ClaudeProviderIcon=({size=16}:IconProps)=><ProviderLogo provider="claude" size={size}/>;
