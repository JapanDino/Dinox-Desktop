import {tr} from '../i18n/core';
import { Download, RefreshCw, FileDown, Upload } from "lucide-react";
import { SettingRow } from "./SettingRow";
interface AboutTabProps {
    appVersion: string;
    autoUpdate: boolean;
    toggleAutoUpdate: () => void;
    updateStatus: string;
    updateVersion: string;
    checkForUpdates: () => void;
    installUpdate: () => void;
    exportStatus: string;
    importStatus: string;
    handleExportSettings: () => void;
    handleImportSettings: () => void;
}
export function AboutTab({ appVersion, autoUpdate, toggleAutoUpdate, updateStatus, updateVersion, checkForUpdates, installUpdate, exportStatus, importStatus, handleExportSettings, handleImportSettings, }: AboutTabProps) {
    const getUpdateLabel = () => {
        switch (updateStatus) {
            case "checking":
                return tr("Checking...");
            case "available":
                return tr("Update Available (v{0})", updateVersion);
            case "uptodate":
                return tr("Dinox is up to date");
            case "downloading":
                return tr("Downloading Update...");
            case "installing":
                return tr("Installing...");
            case "error":
                return tr("Не удалось проверить или установить обновление");
            default:
                return tr("Check for Updates");
        }
    };
    const getUpdateDesc = () => updateStatus === "available" ? tr("Click to install and restart") : tr("Currently running v{0}", appVersion);
    const getExportLabel = () => {
        if (exportStatus === "exporting")
            return tr("Exporting...");
        if (exportStatus === "success")
            return tr("Exported!");
        return tr("Export Settings");
    };
    const getImportLabel = () => {
        if (importStatus === "importing")
            return tr("Importing...");
        if (importStatus === "success")
            return tr("Imported!");
        return tr("Import Settings");
    };
    return (<div className="about-tab-container">
      <div className="about-header">
        <img src="/dinox.svg" className="about-logo" alt={tr("Dinox Logo")}/>
        <h1 className="about-title">Dinox</h1>
        <p className="about-version">{tr("Version")}{" "}{appVersion}</p>
      </div>

      <div className="setting-group-label">{tr("Software Updates")}</div>
      <div className="setting-group">
        <><SettingRow icon={Download} label={tr("Auto Update")} desc={tr("Update automatically on startup")}>
          <label className="toggle-switch">
            <input type="checkbox" aria-label={tr("Auto Update")} checked={autoUpdate} onChange={toggleAutoUpdate}/>
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow icon={RefreshCw} label={getUpdateLabel()} desc={getUpdateDesc()} action divider={false} onClick={["checking","downloading","installing"].includes(updateStatus) ? undefined : () => (updateStatus === "available" ? installUpdate() : checkForUpdates())}/></>
      </div>

      <p className="cal-sync-note">{tr("Подписанные релизы JapanDino/Dinox-Desktop. По умолчанию — предложение обновиться. Авторежим устанавливает обновление при запуске и перезапускает приложение.")}</p>
      <div className="setting-group-label setting-group-label--spaced">{tr("Data")}</div>
      <div className="setting-group">
        <SettingRow icon={FileDown} label={getExportLabel()} desc={tr("Save settings to a file")} action onClick={handleExportSettings}/>
        <SettingRow icon={Upload} label={getImportLabel()} desc={tr("Load settings from a file")} action divider={false} onClick={handleImportSettings}/>
      </div>

      <div className="about-footer">
        <p>{tr("Dinox — JapanDino · основано на Bloom от sehaz")}</p>
      </div>
    </div>);
}
