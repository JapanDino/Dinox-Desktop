import {DockContentSettings} from '../dock/DockContentSettings';
import {tr} from '../i18n/core';
import { ShellSettings } from '../system/ShellSettings';
import { DockDesignSettings } from '../components/DockDesignSettings';
import { SystemSettings } from '../system/SystemSettings';
import { Monitor, Eye, EyeOff, Circle } from "lucide-react";
import { SettingRow } from "./SettingRow";
interface DockTabProps {
    dockEnabled: boolean;
    toggleDock: () => void;
    dockMode: string;
    setDockModeValue: (mode: string) => void;
    dockPreviewEnabled: boolean;
    toggleDockPreview: () => void;
    dockIconOnly: boolean;
    toggleDockIconOnly: () => void;
}
export function DockTab({ dockEnabled, toggleDock, dockMode, setDockModeValue, dockPreviewEnabled, toggleDockPreview, dockIconOnly, toggleDockIconOnly, }: DockTabProps) {
    return (<>
      <div className="setting-group-label">{tr("Dock")}</div>
      <ShellSettings />
      <div className="setting-group">
        <SettingRow icon={Monitor} label={tr("Dinox Dock")} desc={tr("Панель приложений Dinox")}>
          <label className="toggle-switch">
            <input type="checkbox" checked={dockEnabled} onChange={toggleDock}/>
            <span className="slider"></span>
          </label>
        </SettingRow>

        {dockEnabled && (<>
            <SettingRow icon={dockMode === "fixed" ? EyeOff : Eye} label={tr("Behavior")} desc={tr("Choose how the dock appears")}>
              <select className="settings-select" value={dockMode} onChange={(e) => setDockModeValue(e.target.value)}>
                <option value="fixed">{tr("Fixed")}</option>
                <option value="smart">{tr("Smart")}</option>
                <option value="peek">{tr("Peek")}</option>
              </select>
            </SettingRow>

            <SettingRow icon={Eye} label={tr("Show App Previews")} desc={tr("Show window thumbnails on hover")}>
              <label className="toggle-switch">
                <input type="checkbox" checked={dockPreviewEnabled} onChange={toggleDockPreview}/>
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow icon={Circle} label={tr("Icon Only")} desc={tr("Remove icon background and padding")} divider={false}>
              <label className="toggle-switch">
                <input type="checkbox" checked={dockIconOnly} onChange={toggleDockIconOnly}/>
                <span className="slider"></span>
              </label>
            </SettingRow>
          </>)}
      </div>
      {dockEnabled && <><DockContentSettings /><SystemSettings /><DockDesignSettings /></>}
    </>);
}
