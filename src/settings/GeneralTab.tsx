import {LanguageSetting} from '../i18n/LanguageSetting';
import {tr} from '../i18n/core';
import { Power, Clock, BatteryWarning, RefreshCw, LogOut } from "lucide-react";
import { SettingRow } from "./SettingRow";
interface GeneralTabProps {
    autostart: boolean;
    toggleAutostart: () => void;
    timeFormat24h: boolean;
    toggleTimeFormat24h: () => void;
    showUpdateIndicator: boolean;
    toggleUpdateIndicator: () => void;
    lowBatteryThreshold: number;
    handleThresholdChange: (val: number) => void;
    restartBloom: () => void;
    quitBloom: () => void;
}
export function GeneralTab({ autostart, toggleAutostart, timeFormat24h, toggleTimeFormat24h, lowBatteryThreshold, handleThresholdChange, restartBloom, quitBloom, }: GeneralTabProps) {
    return (<>
      <div className="setting-group-label">{tr("System")}</div>
      <div className="setting-group"><LanguageSetting/>
        <SettingRow icon={Power} label={tr("Launch at Login")} desc={tr("Open Dinox automatically")}>
          <label className="toggle-switch">
            <input type="checkbox" checked={autostart} onChange={toggleAutostart}/>
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow icon={Clock} label={tr("24-Hour Time")} desc={tr("Use 24-hour clock format")}>
          <label className="toggle-switch">
            <input type="checkbox" checked={timeFormat24h} onChange={toggleTimeFormat24h}/>
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow icon={BatteryWarning} label={tr("Low Battery Alert")} desc={tr("Trigger at {0}%", lowBatteryThreshold)} divider={false}>
          <input type="range" min="5" max="50" step="5" value={lowBatteryThreshold} onChange={(e) => handleThresholdChange(parseInt(e.target.value))} className="settings-slider"/>
        </SettingRow>
      </div>

      <div className="setting-group-label">{tr("App")}</div>
      <div className="setting-group">
        <SettingRow icon={RefreshCw} label={tr("Restart Dinox")} desc={tr("Reinitialize all components")} action onClick={restartBloom}/>
        <SettingRow icon={LogOut} label={tr("Quit Dinox")} desc={tr("Exit application completely")} action danger onClick={quitBloom} divider={false}/>
      </div>
    </>);
}
