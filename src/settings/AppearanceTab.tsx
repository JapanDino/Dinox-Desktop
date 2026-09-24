import {tr} from '../i18n/core';
import { BloomAppearanceSetting } from '../appearance/BloomAppearance';
import { Palette, Droplet, Contrast, Droplets, Sun, Square, Maximize2 } from "lucide-react";
import { SettingRow } from "./SettingRow";
interface AppearanceTabProps {
    themeMode: string;
    handleThemeModeChange: (mode: string) => void;
    themeColor: string;
    handleThemeColorChange: (color: string) => void;
    themeOpacity: number;
    handleOpacityChange: (val: number) => void;
    themeSaturation: number;
    handleSaturationChange: (val: number) => void;
    themeBrightness: number;
    handleBrightnessChange: (val: number) => void;
    cornersEnabled: boolean;
    toggleCorners: () => void;
    scale: number;
    handleScaleChange: (val: number) => void;
}
export function AppearanceTab({ themeMode, handleThemeModeChange, themeColor, handleThemeColorChange, themeOpacity, handleOpacityChange, themeSaturation, handleSaturationChange, themeBrightness, handleBrightnessChange, cornersEnabled, toggleCorners, scale, handleScaleChange, }: AppearanceTabProps) {
    const showCustomColor = themeMode === "custom";
    const showAdvancedSliders = themeMode === "custom" || themeMode === "adaptive";
    return (<>
      <div className="setting-group"><BloomAppearanceSetting /></div>
      <div className="setting-group-label">{tr("Theme")}</div>
      <div className="setting-group">
        <SettingRow icon={Palette} label={tr("Theme Mode")} desc={tr("Configure visual styling")}>
          <select className="settings-select" value={themeMode} onChange={(e) => handleThemeModeChange(e.target.value)}>
            <option value="dark">{tr("Dark (Translucent)")}</option>
            <option value="light">{tr("Light (Translucent)")}</option>
            <option value="custom">{tr("Custom Color")}</option>
            <option value="adaptive">{tr("Adaptive Accent")}</option>
          </select>
        </SettingRow>

        {showCustomColor && (<SettingRow icon={Droplet} label={tr("Custom Theme Color")} desc={tr("Choose layout background color")}>
            <div className="color-picker-row">
              <input type="color" value={themeColor} onChange={(e) => handleThemeColorChange(e.target.value)} className="color-picker-input"/>
              <span className="color-picker-label">{themeColor.toUpperCase()}</span>
            </div>
          </SettingRow>)}

        <SettingRow icon={Contrast} label={tr("Background Opacity")} desc={tr("Adjust theme transparency ({0}%)", Math.round(themeOpacity * 100))} divider={showAdvancedSliders}>
          <input type="range" min="0.1" max="1.0" step="0.05" value={themeOpacity} onChange={(e) => handleOpacityChange(parseFloat(e.target.value))} className="settings-slider"/>
        </SettingRow>

        {showAdvancedSliders && (<>
            <SettingRow icon={Droplets} label={tr("Color Saturation")} desc={tr("Adjust theme color vibrancy ({0}%)", Math.round(themeSaturation * 100))}>
              <input type="range" min="0.0" max="1.0" step="0.02" value={themeSaturation} onChange={(e) => handleSaturationChange(parseFloat(e.target.value))} className="settings-slider"/>
            </SettingRow>

            <SettingRow icon={Sun} label={tr("Background Brightness")} desc={tr("Adjust background lightness ({0}%)", Math.round(themeBrightness * 100))} divider={false}>
              <input type="range" min="0.0" max="1.0" step="0.02" value={themeBrightness} onChange={(e) => handleBrightnessChange(parseFloat(e.target.value))} className="settings-slider"/>
            </SettingRow>
          </>)}
      </div>

      <div className="setting-group-label">{tr("Display")}</div>
      <div className="setting-group">
        <SettingRow icon={Square} label={tr("Screen Corners")} desc={tr("Rounded top edges")}>
          <label className="toggle-switch">
            <input type="checkbox" checked={cornersEnabled} onChange={toggleCorners}/>
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow icon={Maximize2} label={tr("UI & Font Scale")} desc={tr("Adjust desktop size ({0}%)", Math.round(scale * 100))} divider={false}>
          <div className="scale-button-container">
            <button onClick={() => handleScaleChange(Math.max(0.8, parseFloat((scale - 0.1).toFixed(1))))} disabled={scale <= 0.8} className="scale-adjust-btn" title={tr("Decrease Scale")}>
              —
            </button>
            <span className="scale-display-value">{Math.round(scale * 100)}%</span>
            <button onClick={() => handleScaleChange(Math.min(1.3, parseFloat((scale + 0.1).toFixed(1))))} disabled={scale >= 1.3} className="scale-adjust-btn" title={tr("Increase Scale")}>
              +
            </button>
          </div>
        </SettingRow>
      </div>
    </>);
}
