import {tr} from '../i18n/core';
import {tx} from '../desktopText';
import {IslandSettings} from './IslandSettings';
import {AiLimitsSettings} from '../aiLimits/AiLimits';
import { PanelTop, Calendar, Music, Minimize2, LayoutList, Sparkles, Circle, CloudSun, X, } from "lucide-react";
import { CalendarSettings } from "../calendar/CalendarSettings";
import { PersonalSettings, usePersonalSetting } from "../components/PersonalFeatures";
import { SettingRow } from "./SettingRow";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig } from "./types";
interface NotchTabProps {
    notchMode: string;
    setNotchModeValue: (mode: string) => void;
    calendarEnabled: boolean;
    toggleCalendar: () => void;
    musicModeEnabled: boolean;
    toggleMusicMode: () => void;
    musicCompactNotch: boolean;
    toggleMusicCompactNotch: () => void;
    mediaLayout: "classic" | "compact";
    toggleMediaLayout: (layout: "classic" | "compact") => void;
    mediaAmbienceEnabled: boolean;
    toggleAmbience: () => void;
    mediaCompactGlowEnabled: boolean;
    toggleCompactGlow: () => void;
    weatherEnabled: boolean;
    toggleWeather: () => void;
    tempUnitFahrenheit: boolean;
    toggleTempUnit: () => void;
    cityName: string;
    setCityName: (name: string) => void;
    citySearchResults: Array<{
        name: string;
        country: string;
        latitude: number;
        longitude: number;
    }>;
    showCityDropdown: boolean;
    setShowCityDropdown: (show: boolean) => void;
    selectCity: (city: {
        name: string;
        country: string;
        latitude: number;
        longitude: number;
    }) => void;
    handleCityClear: () => void;
    statusWidgets: WidgetConfig;
    handleWidgetsChange: (config: WidgetConfig) => void;
}
export function NotchTab({ notchMode, setNotchModeValue, calendarEnabled, toggleCalendar, musicModeEnabled, toggleMusicMode, musicCompactNotch, toggleMusicCompactNotch, mediaLayout, toggleMediaLayout, mediaAmbienceEnabled, toggleAmbience, mediaCompactGlowEnabled, toggleCompactGlow, weatherEnabled, toggleWeather, tempUnitFahrenheit, toggleTempUnit, cityName, setCityName, citySearchResults, showCityDropdown, setShowCityDropdown, selectCity, handleCityClear, statusWidgets, handleWidgetsChange, }: NotchTabProps) {
    const [placement] = usePersonalSetting('bloom-island-position', 'top-center');
    const hoverEdge = placement === 'left' ? tx('левого', 'left') : placement === 'right' ? tx('правого', 'right') : placement === 'bottom' ? tx('нижнего', 'bottom') : tx('верхнего', 'top');
    return (<>
      <div className="setting-group-label">{tr("Notch")}</div>
      <div className="setting-group">
        <SettingRow icon={PanelTop} label={tr("Верхняя панель с часами")} desc={tr("Выберите, когда показывать часы и виджеты")}>
          <select className="settings-select" aria-label={tr("Верхняя панель с часами")} value={notchMode} onChange={(e) => setNotchModeValue(e.target.value)}>
            <option value="fixed">{tr("Всегда видна")}</option>
            <option value="smart">{tr("Скрывать при перекрытии")}</option>
            <option value="peek">{tr("Автоскрытие")}</option>
            <option value="hover">{tr("Только при наведении")}</option>
          </select>
        </SettingRow>

        <p className="panel-mode-hint">{notchMode === 'hover' ? tx(`Наведите курсор на место острова у ${hoverEdge} края. После ухода остров скрывается, даже с закреплённым календарём. События не раскрывают его.`, `Move the pointer to the island's position on the ${hoverEdge} edge. It hides when you leave, even with a pinned calendar. Events do not expand it.`) : notchMode === 'peek' ? tr('Появляется при наведении и важных событиях. Закреплённый календарь остаётся открытым.') : notchMode === 'smart' ? tr('Панель скрывается, когда её перекрывает окно приложения.') : tr('Часы постоянно видны. Для скрытия выберите «Автоскрытие».')}</p>
        <SettingRow icon={Calendar} label={tr("Calendar & Timer")} desc={tr("Enable productivity split-view")}>
          <label className="toggle-switch">
            <input type="checkbox" checked={calendarEnabled} onChange={toggleCalendar}/>
            <span className="slider"></span>
          </label>
        </SettingRow>

        <SettingRow icon={Music} label={tr("Music Mode")} desc={tr("Interactive live music widget")}>
          <label className="toggle-switch">
            <input type="checkbox" checked={musicModeEnabled} onChange={toggleMusicMode}/>
            <span className="slider"></span>
          </label>
        </SettingRow>

        {musicModeEnabled && (<>
            <SettingRow icon={Minimize2} label={tr("Compact Mode")} desc={tr("Show visualizer & artwork when collapsed")}>
              <label className="toggle-switch">
                <input type="checkbox" checked={musicCompactNotch} onChange={toggleMusicCompactNotch}/>
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow icon={LayoutList} label={tr("Media Layout")} desc={tr("Choose expanded player style")}>
              <div className="unit-toggle-minimal wide" role="group" aria-label={tr('Media Layout')}>
                <button type="button" aria-pressed={mediaLayout === 'classic'} className={mediaLayout === "classic" ? "active" : ""} onClick={() => toggleMediaLayout("classic")}>{tr("Classic")}</button>
                <button type="button" aria-pressed={mediaLayout === 'compact'} className={mediaLayout === "compact" ? "active" : ""} onClick={() => toggleMediaLayout("compact")}>{tr("Compact")}</button>
              </div>
            </SettingRow>

            <SettingRow icon={Sparkles} label={tr("Ambient Glow")} desc={tr("Colored glow behind expanded album art")}>
              <label className="toggle-switch">
                <input type="checkbox" checked={mediaAmbienceEnabled} onChange={toggleAmbience}/>
                <span className="slider"></span>
              </label>
            </SettingRow>

            <SettingRow icon={Circle} label={tr("Compact Glow")} desc={tr("Glow around collapsed thumbnail")} divider={false}>
              <label className="toggle-switch">
                <input type="checkbox" checked={mediaCompactGlowEnabled} onChange={toggleCompactGlow}/>
                <span className="slider"></span>
              </label>
            </SettingRow>
          </>)}
      </div>

      <IslandSettings/>
      <AiLimitsSettings/>
      <div className="setting-group-label">{tr("Weather")}</div>
      <div className="setting-group">
        <SettingRow icon={CloudSun} label={tr("Weather Status")} desc={cityName || tr("Auto-detect location")}>
          <div className="weather-controls">
            <div className="unit-toggle-minimal" role="group" aria-label={tx('Единицы температуры','Temperature unit')}>
              <button type="button" aria-label={tx('Градусы Цельсия','Celsius')} aria-pressed={!tempUnitFahrenheit} className={!tempUnitFahrenheit ? "active" : ""} onClick={() => {if(tempUnitFahrenheit)toggleTempUnit();}}>°C</button>
              <button type="button" aria-label={tx('Градусы Фаренгейта','Fahrenheit')} aria-pressed={tempUnitFahrenheit} className={tempUnitFahrenheit ? "active" : ""} onClick={() => {if(!tempUnitFahrenheit)toggleTempUnit();}}>°F</button>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={weatherEnabled} onChange={toggleWeather}/>
              <span className="slider"></span>
            </label>
          </div>
        </SettingRow>

        {weatherEnabled && (<div className="manual-city-input">
            <div className="city-input-row">
              <input type="text" aria-label={tr('Search city...')} placeholder={tr("Search city...")} value={cityName} onChange={(e) => setCityName(e.target.value)} onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)} onKeyDown={(e) => {
                if (e.key === "Enter" && citySearchResults.length > 0) {
                    e.preventDefault();
                    selectCity(citySearchResults[0]);
                }
                if (e.key === "Escape") {
                    setShowCityDropdown(false);
                }
            }} onBlur={event => {if(!event.currentTarget.closest('.manual-city-input')?.contains(event.relatedTarget as Node))setShowCityDropdown(false);}}/>
              {cityName && (<button className="city-clear-btn" onMouseDown={(e) => {
                    e.preventDefault();
                }} onClick={handleCityClear} aria-label={tr('Clear city')} title={tr("Clear city")}>
                  <X size={10} strokeWidth={2.5}/>
                </button>)}
            </div>
            {showCityDropdown && citySearchResults.length > 0 && (<div className="city-dropdown">
                {citySearchResults.map((city) => (<button key={`${city.name}-${city.latitude}`} className="city-dropdown-item" onMouseDown={(e) => {
                        e.preventDefault();
                    }} onClick={() => selectCity(city)}>
                    <span className="city-dropdown-name">{city.name}</span>
                    <span className="city-dropdown-country">{city.country}</span>
                  </button>))}
              </div>)}
          </div>)}
      </div>

      <div className="setting-group-label">{tr("Widgets")}</div>
      <div className="setting-group">
        <StatusWidgetConfig value={statusWidgets} onChange={handleWidgetsChange}/>
      </div>
      <CalendarSettings />
      <PersonalSettings />
    </>);
}
