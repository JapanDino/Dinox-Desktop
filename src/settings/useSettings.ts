import {createConfirmedPersistence, cacheConfirmedSettings, type PersistenceStatus, type SettingValues} from './confirmedPersistence';
import {tr} from '../i18n/core';
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { getVersion } from "@tauri-apps/api/app";
import type { UpdateCheckResult } from "../updater";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { hexToHsl } from "../theme";
import type { WidgetConfig } from "./types";
function readBool(val: string | null): boolean {
    return val === "true";
}
export function useSettings() {
    const [autostart, setAutostart] = useState(false);
    const autostartRevision = useRef(0);
    const [weatherEnabled, setWeatherEnabled] = useState(true);
    const [calendarEnabled, setCalendarEnabled] = useState(true);
    const [musicModeEnabled, setMusicModeEnabled] = useState(true);
    const [musicCompactNotch, setMusicCompactNotch] = useState(true);
    const [volumeOverlayEnabled, setVolumeOverlayEnabled] = useState(true);
    const [volumeEdgeEnabled, setVolumeEdgeEnabled] = useState(() => localStorage.getItem("bloom-volume-edge-enabled") !== "false");
    const [brightnessOverlayEnabled, setBrightnessOverlayEnabled] = useState(() => localStorage.getItem("bloom-brightness-overlay-enabled") !== "false");
    const [brightnessEdgeEnabled, setBrightnessEdgeEnabled] = useState(() => localStorage.getItem("bloom-brightness-edge-enabled") !== "false");
    const [mediaAmbienceEnabled, setMediaAmbienceEnabled] = useState(true);
    const [mediaCompactGlowEnabled, setMediaCompactGlowEnabled] = useState(true);
    const [mediaLayout, setMediaLayout] = useState<"classic" | "compact">(() => (localStorage.getItem("bloom-media-layout") as "classic" | "compact") || "classic");
    const [cornersEnabled, setCornersEnabled] = useState(() => localStorage.getItem("bloom-corners-enabled") === "true");
    const [showUpdateIndicator, setShowUpdateIndicator] = useState(() => localStorage.getItem("bloom-show-update-indicator") !== "false");
    const [timeFormat24h, setTimeFormat24h] = useState(() => localStorage.getItem("bloom-time-format-24h") === "true");
    const [tempUnitFahrenheit, setTempUnitFahrenheit] = useState(false);
    const [cityName, setCityName] = useState("");
    const confirmedCity = useRef("");
    const settingsRevision = useRef(0);
    const [citySearchResults, setCitySearchResults] = useState<Array<{
        name: string;
        country: string;
        latitude: number;
        longitude: number;
    }>>([]);
    const [showCityDropdown, setShowCityDropdown] = useState(false);
    const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({
        left: ["weather"],
        right: ["battery"],
    });
    const [dockEnabled, setDockEnabled] = useState(true);
    const [dockPreviewEnabled, setDockPreviewEnabled] = useState(true);
    const [dockIconOnly, setDockIconOnly] = useState(() => localStorage.getItem("bloom-dock-icon-only") === "true");
    const [dockMode, setDockMode] = useState(() => {
        const raw = localStorage.getItem("bloom-dock-mode") || "smart";
        return raw === "auto-hide" ? "smart" : raw;
    });
    const [notchMode, setNotchMode] = useState("fixed");
    const [lowBatteryThreshold, setLowBatteryThreshold] = useState(20);
    const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "uptodate" | "error" | "downloading" | "installing">("idle");
    const [updateVersion, setUpdateVersion] = useState("");
    const [appVersion, setAppVersion] = useState("");
    const [autoUpdate, setAutoUpdate] = useState(() => localStorage.getItem("dinox-auto-update") === "true");
    const [scale, setScale] = useState(() => parseFloat(localStorage.getItem("bloom-scale") || "1.0"));
    const [themeMode, setThemeMode] = useState(() => localStorage.getItem("bloom-theme-mode") || "dark");
    const [themeColor, setThemeColor] = useState(() => localStorage.getItem("bloom-theme-color") || "#007aff");
    const [themeOpacity, setThemeOpacity] = useState(() => {
        const val = localStorage.getItem("bloom-theme-opacity");
        return val !== null ? parseFloat(val) : 0.8;
    });
    const [themeSaturation, setThemeSaturation] = useState(() => {
        const val = localStorage.getItem("bloom-theme-saturation");
        return val !== null ? parseFloat(val) : 0.5;
    });
    const [themeBrightness, setThemeBrightness] = useState(() => {
        const val = localStorage.getItem("bloom-theme-brightness");
        return val !== null ? parseFloat(val) : 0.15;
    });
    const [exportStatus, setExportStatus] = useState<"idle" | "exporting" | "success" | "error">("idle");
    const [importStatus, setImportStatus] = useState<"idle" | "importing" | "success" | "error">("idle");
    const [persistenceStatus, setPersistenceStatus] = useState<PersistenceStatus>({pending: 0, failures: []});
    const persistence = useRef<ReturnType<typeof createConfirmedPersistence> | null>(null);
    if (!persistence.current) persistence.current = createConfirmedPersistence(setPersistenceStatus);
    const saveValues = (values: SettingValues, confirmed: () => void, id = Object.keys(values).sort().join('|')) => {
        settingsRevision.current++;
        return persistence.current!.run(id, async () => {
            const entries = Object.entries(values);
            if (entries.length === 1) {
                const [key, value] = entries[0];
                await invoke('save_setting', {key, value});
            } else await invoke('save_settings', {values});
        }, () => {
            // Native events are sent only after the atomic disk commit. UI stays confirmed on errors.
            confirmed();
            try { cacheConfirmedSettings(localStorage, values); }
            catch (error) { console.warn('Settings saved, local cache unavailable', error); }
        });
    };
    const saveSetting = (key: string, value: string, confirmed: () => void) => saveValues({[key]: value}, confirmed);
    // ── Load all settings from backend + localStorage ──
    const loadAllSettings = useCallback(async (): Promise<void> => {
        const revision = settingsRevision.current;
        try {
            const settings: Record<string, string> = await invoke("load_settings");
            if (settingsRevision.current !== revision) { void loadAllSettings(); return; }
            const getVal = (key: string) => {
                const val = settings[key];
                if (key in settings)
                    return val == null ? null : String(val);
                return localStorage.getItem(key);
            };
            const apply = <T>(val: string | null, setter: (v: T) => void, transform: (v: string) => T) => {
                if (val !== null)
                    setter(transform(val));
            };
            apply(getVal("bloom-weather-enabled"), setWeatherEnabled, readBool);
            apply(getVal("bloom-calendar-enabled"), setCalendarEnabled, readBool);
            apply(getVal("bloom-music-mode-enabled"), setMusicModeEnabled, readBool);
            apply(getVal("bloom-music-compact-notch"), setMusicCompactNotch, readBool);
            apply(getVal("bloom-volume-overlay-enabled"), setVolumeOverlayEnabled, readBool);
            apply(getVal("bloom-brightness-overlay-enabled"), setBrightnessOverlayEnabled, readBool);
            apply(getVal("bloom-media-ambience-enabled"), setMediaAmbienceEnabled, readBool);
            apply(getVal("bloom-media-compact-glow-enabled"), setMediaCompactGlowEnabled, readBool);
            apply(getVal("bloom-corners-enabled"), setCornersEnabled, readBool);
            apply(getVal("bloom-time-format-24h"), setTimeFormat24h, readBool);
            apply(getVal("bloom-show-update-indicator"), setShowUpdateIndicator, readBool);
            apply(getVal("dinox-auto-update"), setAutoUpdate, readBool);
            apply(getVal("bloom-volume-edge-enabled"), setVolumeEdgeEnabled, readBool);
            apply(getVal("bloom-brightness-edge-enabled"), setBrightnessEdgeEnabled, readBool);
            apply(getVal("bloom-dock-enabled"), setDockEnabled, readBool);
            apply(getVal("bloom-dock-preview-enabled"), setDockPreviewEnabled, readBool);
            apply(getVal("bloom-dock-icon-only"), setDockIconOnly, readBool);
            apply(getVal("bloom-temp-unit"), setTempUnitFahrenheit, (v) => v === "fahrenheit");
            apply(getVal("bloom-scale"), setScale, parseFloat);
            apply(getVal("bloom-low-battery-threshold"), setLowBatteryThreshold, parseInt);
            apply(getVal("bloom-notch-mode"), setNotchMode, (v) => (v === "auto-hide" ? "smart" : v));
            apply(getVal("bloom-dock-mode"), setDockMode, (v) => (v === "auto-hide" ? "smart" : v));
            const savedCity = getVal("bloom-weather-city");
            confirmedCity.current = savedCity ?? "";
            setCityName(confirmedCity.current);
            apply(getVal("bloom-theme-mode"), setThemeMode, (v) => v);
            apply(getVal("bloom-theme-color"), setThemeColor, (v) => v);
            apply(getVal("bloom-theme-opacity"), setThemeOpacity, parseFloat);
            apply(getVal("bloom-theme-saturation"), setThemeSaturation, parseFloat);
            apply(getVal("bloom-theme-brightness"), setThemeBrightness, parseFloat);
            const widgetsVal = getVal("bloom-status-widgets");
            if (widgetsVal) {
                try {
                    const parsed = JSON.parse(widgetsVal);
                    if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
                        setStatusWidgets(parsed);
                    }
                }
                catch { }
            }
        }
        catch (e) {
            console.error("Failed to load settings:", e);
        }
    }, []);
    // ── Initialize on mount ──
    useEffect(() => {
        loadAllSettings();
        const startupRevision = autostartRevision.current;
        isEnabled()
            .then(value => { if (autostartRevision.current === startupRevision) setAutostart(value); })
            .catch(() => { });
        getVersion()
            .then((ver) => setAppVersion(ver || "—"))
            .catch(() => setAppVersion("—"));
        checkForUpdates(false);
    }, []);
    // ── Sync settings from other windows ──
    const syncedSettings = {
        "bloom-dock-mode": setDockMode,
        "bloom-notch-mode": setNotchMode,
        "bloom-dock-enabled": setDockEnabled,
        "bloom-dock-icon-only": setDockIconOnly,
        "bloom-dock-preview-enabled": setDockPreviewEnabled,
        "bloom-weather-enabled": setWeatherEnabled,
        "bloom-calendar-enabled": setCalendarEnabled,
        "bloom-music-mode-enabled": setMusicModeEnabled,
        "bloom-music-compact-notch": setMusicCompactNotch,
        "bloom-media-ambience-enabled": setMediaAmbienceEnabled,
        "bloom-media-compact-glow-enabled": setMediaCompactGlowEnabled,
        "bloom-media-layout": setMediaLayout,
        "bloom-corners-enabled": setCornersEnabled,
        "bloom-show-update-indicator": setShowUpdateIndicator,
        "bloom-time-format-24h": setTimeFormat24h,
        "bloom-low-battery-threshold": setLowBatteryThreshold,
        "bloom-scale": setScale,
        "bloom-temp-unit": (v: string) => setTempUnitFahrenheit(v === "fahrenheit"),
        "dinox-auto-update": setAutoUpdate,
        "bloom-volume-overlay-enabled": setVolumeOverlayEnabled,
        "bloom-volume-edge-enabled": setVolumeEdgeEnabled,
        "bloom-brightness-overlay-enabled": setBrightnessOverlayEnabled,
        "bloom-brightness-edge-enabled": setBrightnessEdgeEnabled,
        "bloom-theme-mode": setThemeMode,
        "bloom-theme-color": setThemeColor,
        "bloom-theme-opacity": setThemeOpacity,
        "bloom-theme-saturation": setThemeSaturation,
        "bloom-theme-brightness": setThemeBrightness,
        "bloom-weather-city": (v: string) => { confirmedCity.current = v || ""; setCityName(confirmedCity.current); },
        "bloom-status-widgets": (v: string) => { try { const parsed = JSON.parse(v); if (Array.isArray(parsed.left) && Array.isArray(parsed.right)) setStatusWidgets(parsed); } catch {} },
    };
    useSettingsSync(Object.fromEntries(Object.entries(syncedSettings).map(([key, apply]) => [key, (value: any) => { settingsRevision.current++; (apply as (v: any) => void)(value); }])));
    // ── Listen for system accent changes (adaptive theme) ──
    useEffect(() => {
        const unlisten = listen<string>("system-accent-changed", (event) => {
            const mode = localStorage.getItem("bloom-theme-mode") || "dark";
            if (mode === "adaptive") {
                try {
                    const hsl = hexToHsl(event.payload);
                    setThemeSaturation(hsl.s / 100);
                    setThemeBrightness(hsl.l / 100);
                }
                catch (e) {
                    console.error("Failed to parse system accent color change HSL:", e);
                }
            }
        });
        return () => {
            unlisten.then((fn) => fn());
        };
    }, []);
    // ── City search debounce ──
    useEffect(() => {
        if (cityName.trim().length < 2) {
            setCitySearchResults([]);
            setShowCityDropdown(false);
            return;
        }
        const timeout = setTimeout(async () => {
            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=en&format=json`);
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    setCitySearchResults(data.results.map((r: any) => ({
                        name: r.name,
                        country: r.country || "",
                        latitude: r.latitude,
                        longitude: r.longitude,
                    })));
                    setShowCityDropdown(true);
                }
                else {
                    setCitySearchResults([]);
                }
            }
            catch {
                setCitySearchResults([]);
            }
        }, 300);
        return () => clearTimeout(timeout);
    }, [cityName]);
    // ── Update checker ──
    const checkForUpdates = async (manual = true) => {
        setUpdateStatus("checking");
        try {
            const result = await invoke<UpdateCheckResult>("check_for_updates", { force: manual });
            if (result.available) {
                setUpdateStatus("available");
                setUpdateVersion(result.version ?? "");
            }
            else {
                setUpdateStatus("uptodate");
            }
        }
        catch (e) {
            console.error("Updater error:", e);
            setUpdateStatus("error");
        }
    };
    const installUpdate = async () => {
        try {
            setUpdateStatus("downloading");
            await invoke("install_update");
            setUpdateStatus("idle");
        }
        catch (e) {
            console.error(e);
            setUpdateStatus("error");
        }
    };
    // Reflect install progress triggered from any window (including auto-update).
    useEffect(() => {
        const unlisten = listen<{
            status: string;
            progress?: number;
        }>("auto-update-status", (event) => {
            switch (event.payload.status) {
                case "downloading":
                    setUpdateStatus("downloading");
                    break;
                case "installing":
                    setUpdateStatus("installing");
                    break;
                case "error":
                    setUpdateStatus("error");
                    break;
                case "done":
                    setUpdateStatus((prev) => (prev === "downloading" || prev === "installing" ? "idle" : prev));
                    break;
            }
        });
        return () => {
            unlisten.then((fn) => fn());
        };
    }, []);
    // ── Autostart ──
    const toggleAutostart = () => {
        autostartRevision.current++;
        return persistence.current!.run('autostart', async () => {
        const currentlyEnabled = await isEnabled();
        if (currentlyEnabled) await disable();
        else await enable();
        const actual = await isEnabled();
        setAutostart(actual);
        if (actual === currentlyEnabled) throw new Error('Windows did not apply the autostart change');
        }, () => {});
    };
    // ── Simple boolean toggles ──
    const toggleWeather = () => {
        const next = !weatherEnabled;
        return saveSetting("bloom-weather-enabled", String(next), () => setWeatherEnabled(next));
    };
    const toggleCalendar = () => {
        const next = !calendarEnabled;
        return saveSetting("bloom-calendar-enabled", String(next), () => setCalendarEnabled(next));
    };
    const toggleMusicMode = () => {
        const next = !musicModeEnabled;
        return saveSetting("bloom-music-mode-enabled", String(next), () => setMusicModeEnabled(next));
    };
    const toggleMusicCompactNotch = () => {
        const next = !musicCompactNotch;
        return saveSetting("bloom-music-compact-notch", String(next), () => setMusicCompactNotch(next));
    };
    const toggleMediaLayout = (layout: "classic" | "compact") => {
        return saveSetting("bloom-media-layout", layout, () => setMediaLayout(layout));
    };
    const toggleVolumeOverlay = () => {
        const next = !volumeOverlayEnabled;
        return saveSetting("bloom-volume-overlay-enabled", String(next), () => setVolumeOverlayEnabled(next));
    };
    const toggleVolumeEdge = () => {
        const next = !volumeEdgeEnabled;
        return saveSetting("bloom-volume-edge-enabled", String(next), () => setVolumeEdgeEnabled(next));
    };
    const toggleBrightnessOverlay = () => {
        const next = !brightnessOverlayEnabled;
        return saveSetting("bloom-brightness-overlay-enabled", String(next), () => setBrightnessOverlayEnabled(next));
    };
    const toggleBrightnessEdge = () => {
        const next = !brightnessEdgeEnabled;
        return saveSetting("bloom-brightness-edge-enabled", String(next), () => setBrightnessEdgeEnabled(next));
    };
    const toggleAmbience = () => {
        const next = !mediaAmbienceEnabled;
        return saveSetting("bloom-media-ambience-enabled", String(next), () => setMediaAmbienceEnabled(next));
    };
    const toggleCompactGlow = () => {
        const next = !mediaCompactGlowEnabled;
        return saveSetting("bloom-media-compact-glow-enabled", String(next), () => setMediaCompactGlowEnabled(next));
    };
    const toggleCorners = () => {
        const next = !cornersEnabled;
        return saveSetting("bloom-corners-enabled", String(next), () => setCornersEnabled(next));
    };
    const toggleUpdateIndicator = () => {
        const next = !showUpdateIndicator;
        return saveSetting("bloom-show-update-indicator", String(next), () => setShowUpdateIndicator(next));
    };
    const toggleTimeFormat24h = () => {
        const next = !timeFormat24h;
        return saveSetting("bloom-time-format-24h", String(next), () => setTimeFormat24h(next));
    };
    const toggleTempUnit = () => {
        const next = !tempUnitFahrenheit;
        return saveSetting("bloom-temp-unit", next ? "fahrenheit" : "celsius", () => setTempUnitFahrenheit(next));
    };
    const toggleDock = () => {
        const next = !dockEnabled;
        return saveSetting("bloom-dock-enabled", String(next), () => setDockEnabled(next));
    };
    const toggleDockPreview = () => {
        const next = !dockPreviewEnabled;
        return saveSetting("bloom-dock-preview-enabled", String(next), () => setDockPreviewEnabled(next));
    };
    const toggleDockIconOnly = () => {
        const next = !dockIconOnly;
        return saveSetting("bloom-dock-icon-only", String(next), () => setDockIconOnly(next));
    };
    const toggleAutoUpdate = () => saveSetting('dinox-auto-update', String(!autoUpdate), () => setAutoUpdate(!autoUpdate));
    // ── Value setters ──
    const setDockModeValue = (newMode: string) => {
        return saveSetting("bloom-dock-mode", newMode, () => setDockMode(newMode));
    };
    const setNotchModeValue = (newMode: string) => {
        return saveSetting("bloom-notch-mode", newMode, () => setNotchMode(newMode));
    };
    const handleThresholdChange = (val: number) => {
        return saveSetting("bloom-low-battery-threshold", val.toString(), () => setLowBatteryThreshold(val));
    };
    const handleScaleChange = (val: number) => {
        return saveSetting("bloom-scale", val.toString(), () => setScale(val));
    };
    const handleWidgetsChange = (config: WidgetConfig) => {
        return saveSetting("bloom-status-widgets", JSON.stringify(config), () => setStatusWidgets(config));
    };
    // ── Theme handlers ──
    const handleThemeModeChange = async (mode: string) => {
        // Resolve the accent inside the tracked operation so discovery errors are visible too.
        const values: SettingValues = {'bloom-theme-mode': mode};
        settingsRevision.current++;
        return persistence.current!.run('theme', async () => {
            if (mode === 'adaptive') {
                const accentHex = await invoke<string>('get_system_accent_color');
                const hsl = hexToHsl(accentHex);
                values['bloom-theme-saturation'] = String(hsl.s / 100);
                values['bloom-theme-brightness'] = String(hsl.l / 100);
            }
            await invoke('save_settings', {values});
        }, () => {
            setThemeMode(mode);
            if (mode === 'adaptive') {
                setThemeSaturation(Number(values['bloom-theme-saturation']));
                setThemeBrightness(Number(values['bloom-theme-brightness']));
            }
            try { cacheConfirmedSettings(localStorage, values); } catch (error) { console.warn(error); }
        });
    };
    const handleThemeColorChange = (color: string) => {
        const hsl = hexToHsl(color);
        return saveValues({
            'bloom-theme-color': color,
            'bloom-theme-saturation': String(hsl.s / 100),
            'bloom-theme-brightness': String(hsl.l / 100),
        }, () => {
            setThemeColor(color);
            setThemeSaturation(hsl.s / 100);
            setThemeBrightness(hsl.l / 100);
        }, 'theme');
    };
    const handleOpacityChange = (value: number) => {
        return saveSetting("bloom-theme-opacity", String(value), () => setThemeOpacity(value));
    };
    const handleSaturationChange = (value: number) => {
        return saveSetting("bloom-theme-saturation", String(value), () => setThemeSaturation(value));
    };
    const handleBrightnessChange = (value: number) => {
        return saveSetting("bloom-theme-brightness", String(value), () => setThemeBrightness(value));
    };
    // ── City search ──
    const selectCity = async (city: {
        name: string;
        country: string;
        latitude: number;
        longitude: number;
    }) => {
        const confirmed = await saveValues({
            'bloom-weather-city': city.name,
            'bloom-weather-lat': String(city.latitude),
            'bloom-weather-lon': String(city.longitude),
        }, () => {
            confirmedCity.current = city.name;
            setCityName(city.name);
            setShowCityDropdown(false);
            setCitySearchResults([]);
        }, 'weather-location');
        if (confirmed) void emit('weather-refresh', {lat: city.latitude, lon: city.longitude}).catch(console.error);
        else setCityName(confirmedCity.current);
    };
    const handleCityClear = async () => {
        const confirmed = await saveValues({
            'bloom-weather-city': null,
            'bloom-weather-lat': null,
            'bloom-weather-lon': null,
        }, () => {
            confirmedCity.current = '';
            setCityName('');
            setShowCityDropdown(false);
            setCitySearchResults([]);
        }, 'weather-location');
        if (confirmed) void emit('weather-refresh', true).catch(console.error);
        else setCityName(confirmedCity.current);
    };
    // ── Export / Import ──
    const handleExportSettings = async () => {
        setExportStatus("exporting");
        try {
            const { save: saveDialog } = await import("@tauri-apps/plugin-dialog");
            const settingsJson = await invoke<string>("export_settings");
            const filePath = await saveDialog({
                get title() {
                    return tr("Export Dinox Settings");
                },
                defaultPath: "bloom-settings.json",
                filters: [{ name: "JSON", extensions: ["json"] }],
            });
            if (filePath) {
                await invoke("write_settings_to_path", { path: filePath, content: settingsJson });
                setExportStatus("success");
                setTimeout(() => setExportStatus("idle"), 2000);
            }
            else {
                setExportStatus("idle");
            }
        }
        catch (e) {
            console.error("Export failed:", e);
            setExportStatus("error");
            setTimeout(() => setExportStatus("idle"), 3000);
        }
    };
    const handleImportSettings = async () => {
        setImportStatus("importing");
        try {
            const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
            const filePath = await openDialog({
                get title() {
                    return tr("Import Dinox Settings");
                },
                filters: [{ name: "JSON", extensions: ["json"] }],
                multiple: false,
            });
            if (filePath) {
                const content = await invoke<string>("read_settings_from_path", { path: filePath as string });
                await invoke("import_settings", { settings: content });
                await loadAllSettings();
                setImportStatus("success");
                setTimeout(() => setImportStatus("idle"), 2000);
            }
            else {
                setImportStatus("idle");
            }
        }
        catch (e) {
            console.error("Import failed:", e);
            setImportStatus("error");
            setTimeout(() => setImportStatus("idle"), 3000);
        }
    };
    return {
        persistenceStatus,
        dismissSaveError: persistence.current.dismiss,
        // System
        autostart,
        toggleAutostart,
        autoUpdate,
        toggleAutoUpdate,
        lowBatteryThreshold,
        handleThresholdChange,
        timeFormat24h,
        toggleTimeFormat24h,
        showUpdateIndicator,
        toggleUpdateIndicator,
        scale,
        handleScaleChange,
        cornersEnabled,
        toggleCorners,
        // Theme
        themeMode,
        handleThemeModeChange,
        themeColor,
        handleThemeColorChange,
        themeOpacity,
        handleOpacityChange,
        themeSaturation,
        handleSaturationChange,
        themeBrightness,
        handleBrightnessChange,
        // Notch
        notchMode,
        setNotchModeValue,
        calendarEnabled,
        toggleCalendar,
        musicModeEnabled,
        toggleMusicMode,
        musicCompactNotch,
        toggleMusicCompactNotch,
        mediaLayout,
        toggleMediaLayout,
        mediaAmbienceEnabled,
        toggleAmbience,
        mediaCompactGlowEnabled,
        toggleCompactGlow,
        // Weather
        weatherEnabled,
        toggleWeather,
        tempUnitFahrenheit,
        toggleTempUnit,
        cityName,
        setCityName,
        citySearchResults,
        showCityDropdown,
        setShowCityDropdown,
        selectCity,
        handleCityClear,
        // Widgets
        statusWidgets,
        handleWidgetsChange,
        // Dock
        dockEnabled,
        toggleDock,
        dockMode,
        setDockModeValue,
        dockPreviewEnabled,
        toggleDockPreview,
        dockIconOnly,
        toggleDockIconOnly,
        // Overlays
        volumeOverlayEnabled,
        toggleVolumeOverlay,
        volumeEdgeEnabled,
        toggleVolumeEdge,
        brightnessOverlayEnabled,
        toggleBrightnessOverlay,
        brightnessEdgeEnabled,
        toggleBrightnessEdge,
        // Updates
        updateStatus,
        updateVersion,
        appVersion,
        checkForUpdates,
        installUpdate,
        // Import / Export
        exportStatus,
        importStatus,
        handleExportSettings,
        handleImportSettings,
        // Utilities
        restartBloom: () => invoke("restart_bloom"),
        quitBloom: () => invoke("quit_bloom"),
    };
}
