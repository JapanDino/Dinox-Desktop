import {useRef, useState} from 'react';
import {usePersonalSetting} from '../components/PersonalFeatures';
export const dndSettingKey = 'dinox-do-not-disturb';
/** Dinox presentation only. Does not claim to change Windows Focus Assist. */
export function useDoNotDisturb() {
    const [raw, save] = usePersonalSetting(dndSettingKey, 'false');
    const [pending, setPending] = useState(false), [error, setError] = useState('');
    const busy = useRef(false);
    const setEnabled = async (enabled: boolean) => {
        if (busy.current) return;
        busy.current = true; setPending(true); setError('');
        try { await save(String(enabled)); }
        catch { setError('Could not save Do Not Disturb.'); }
        finally { busy.current = false; setPending(false); }
    };
    return {enabled: raw === 'true', setEnabled, pending, error};
}
