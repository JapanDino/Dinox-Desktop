import {useDoNotDisturb} from './notifications/useDoNotDisturb';
import {tx} from './desktopText';
import {useAiLimits} from './aiLimits/useAiLimits';
import {AiLimitsPanel,LimitsChip} from './aiLimits/AiLimits';
import {tr,trError,locale,getLanguage} from './i18n/core';
import {confirmedAdjustment} from './system/confirmedAdjustment';
import { useShellHeartbeat } from './hooks/useShellHeartbeat';
import { useBloomAppearance } from './appearance/BloomAppearance';
import { useNotifications } from './notifications/useNotifications';
import { NotificationPanel } from './notifications/NotificationPanel';
import { motion, AnimatePresence, useAnimation, useReducedMotion } from "framer-motion";
import { useEffect, useState, useCallback, useRef, memo } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getVersion } from "@tauri-apps/api/app";
import type { UpdateCheckResult } from "./updater";
import "./App.css";
import './island/island.css';
import {IslandSections,type IslandSection} from './island/IslandSections';
import {SystemControls,type SystemPage} from './system/SystemControls';
import {systemDefaults} from './system/model';
import {parseDockDesign} from './dockDesign';
import { CalendarPanel, UpcomingEvent, ReminderCard } from "./calendar/CalendarPanel";
import { useCalendar, useReminders } from "./calendar/useCalendar";
import { dayStart } from "./calendar/model";
import { useEcoMode, ProfilePicker } from "./components/PersonalOptions";
import { usePersonalSetting } from "./components/PersonalFeatures";
import { PersonalActions } from "./components/PersonalFeatures";
import { shiftMonth, wheelStep } from "./personalLogic";
import { PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, VolumeLowIcon, VolumeHighIcon, MusicNoteIcon, HeadphonesIcon } from "./icons";
import { CompactMediaPlayer } from "./CompactMediaPlayer";
import { useWeather } from "./hooks/useWeather";
import { useSettingsSync } from "./hooks/useSettingsSync";
import {islandPosition,islandInsets,clampIslandSize} from './settings/islandGeometry';
import type { WidgetConfig } from "./components/StatusWidgetConfig";
import { Cpu, MemoryStick, HardDrive, ArrowUpDown, } from "lucide-react";
// Simple SVG icons


function BatteryIcon({ charging, level, threshold = 20 }: {
    charging: boolean;
    level: number;
    threshold?: number;
}) {
    const percentage = Math.min(Math.max(level, 0), 100);
    return (<div style={{
            display: 'flex',
            alignItems: 'center',
            position: 'relative',
            height: '14px',
            justifyContent: 'center'
        }}>
      <svg width="20" height="10" viewBox="0 0 20 10" fill="none">
        {/* Battery Shell - Centered at 9px within 20px width, ignoring the tip's offset */}
        <rect x="2" y="0.75" width="14" height="8.5" rx="2.4" stroke="currentColor" strokeOpacity={0.7} strokeWidth="1.1"/>
        {/* Battery Tip */}
        <path d="M17.5 3.5V6.5" stroke="currentColor" strokeOpacity={0.7} strokeWidth="1.2" strokeLinecap="round"/>
        {/* Fill */}
        <rect x="3.8" y="2.5" width={Math.max(0.5, (percentage / 100) * 10.4)} height="5" rx="1" fill={charging ? "#32D74B" : (percentage <= threshold ? "#FF453A" : "currentColor")}/>
      </svg>
      {/* Charging Bolt - Centered on the battery body */}
      {charging && (<div style={{
                position: 'absolute',
                top: '50%',
                left: '9px',
                transform: 'translate(-50%, -50%)',
                color: 'white',
                filter: 'drop-shadow(0px 0px 1.5px rgba(0,0,0,0.8))'
            }}>
          <svg width="7" height="10" viewBox="0 0 8 12" fill="currentColor">
            <path d="M4.5 0L0 7H3.5L2.5 12L8 5H4.5L5.5 0H4.5Z"/>
          </svg>
        </div>)}
    </div>);
}
function GreenDownArrowIcon() {
    return (<div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'rgba(50, 215, 75, 0.15)',
            border: '1px solid rgba(50, 215, 75, 0.35)',
            boxShadow: '0 0 8px rgba(50, 215, 75, 0.25)',
            flexShrink: 0,
            verticalAlign: 'middle'
        }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#32D74B" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="4" x2="12" y2="16"></line>
        <polyline points="18 10 12 16 6 10"></polyline>
        <line x1="6" y1="20" x2="18" y2="20"></line>
      </svg>
    </div>);
}
export const Visualizer = memo(function Visualizer({ isPlaying, bars = 5, height = 20 }: {
    isPlaying: boolean;
    bars?: number;
    height?: number;
}) {
    const [audioData, setAudioData] = useState<number[]>(new Array(bars).fill(0.18));
    useEffect(() => {
        if (!isPlaying) {
            setAudioData(new Array(bars).fill(0.18));
            return;
        }
        const unlisten = listen<{
            frequencies: number[];
        }>("audio-visualization", (event) => {
            // If we receive fewer frequencies than bars, repeat or interpolate
            // If more, slice
            let data = event.payload.frequencies;
            if (data.length > bars)
                data = data.slice(0, bars);
            while (data.length < bars)
                data.push(0.18);
            setAudioData(data);
        });
        return () => {
            unlisten.then(fn => fn());
        };
    }, [isPlaying, bars]);
    return (<div className="visualizer-horizontal" style={{ height: `${height}px`, width: `${bars * 6}px` }}>
      {audioData.map((value, i) => (<motion.div key={i} className="bar-horizontal" animate={{
                scaleY: isPlaying ? Math.max(0.2, value) : 0.1,
                opacity: isPlaying ? 0.95 : 0.5
            }} transition={{
                type: "spring",
                stiffness: 600,
                damping: 30,
                mass: 0.5
            }}/>))}
    </div>);
});
interface MediaInfo {
    title: string;
    artist: string;
    is_playing: boolean;
    has_media: boolean;
    artwork?: string[];
    position_ms?: number;
    duration_ms?: number;
    seek_enabled?: boolean;
    position_updated_at?: number;
}
const MARQUEE_SPEED = 30; // px/s — constant for all titles
const MARQUEE_MIN_DURATION = 5; // floor so short titles don't flicker
const TitleMarquee = ({ title }: {
    title: string;
}) => {
    const textRef = useRef<HTMLSpanElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [scrollDistance, setScrollDistance] = useState(0);
    const [scrollDuration, setScrollDuration] = useState(8);
    useEffect(() => {
        const check = () => {
            if (textRef.current && containerRef.current) {
                const textWidth = textRef.current.scrollWidth;
                const containerWidth = containerRef.current.clientWidth;
                const overflow = textWidth > containerWidth;
                setIsOverflowing(overflow);
                if (overflow) {
                    const distance = textWidth - containerWidth;
                    setScrollDistance(distance);
                    setScrollDuration(Math.max(distance / MARQUEE_SPEED, MARQUEE_MIN_DURATION));
                }
            }
        };
        check();
        const observer = new ResizeObserver(check);
        if (containerRef.current)
            observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [title]);
    return (<div ref={containerRef} className="premium-title-wrap" style={{ width: '100%', overflow: 'hidden' }}>
      <span ref={textRef} className={`premium-title ${isOverflowing ? 'marquee' : ''}`} style={{
            '--scroll-distance': isOverflowing ? `-${scrollDistance}px` : undefined,
            '--scroll-duration': `${scrollDuration}s`,
        } as React.CSSProperties}>
        {title}
      </span>
    </div>);
};
function App() {
    useShellHeartbeat();
    useBloomAppearance();
    const dnd = useDoNotDisturb();
    const dndActive = dnd.enabled;
    const notifications = useNotifications(dndActive);
    const [noticeContentHeight,setNoticeContentHeight]=useState<number|null>(null);
    const reducedMotion = useReducedMotion();
    const [time, setTime] = useState("");
    const [isHovered, setIsHovered] = useState(false);
    const [controlPage,setControlPage]=useState<SystemPage>('quick');
    const islandControlsRef=useRef<HTMLDivElement|null>(null);
    const hoverExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {if(hoverExitTimer.current)clearTimeout(hoverExitTimer.current);}, []);
    const [calendarComposerOpen, setCalendarComposerOpen] = useState(false);
    const aiLimits=useAiLimits();
    const [aiLimitsOpen,setAiLimitsOpen]=useState(false);
    const showAiLimits=aiLimitsOpen && !calendarComposerOpen;
    const openAiLimits=()=>{if(calendarComposerOpenRef.current)return;setAiLimitsOpen(true);setIsHovered(true);};
    useEffect(()=>{if(!aiLimits.codex&&!aiLimits.claude)setAiLimitsOpen(false);},[aiLimits.codex,aiLimits.claude]);
    const calendarComposerOpenRef = useRef(false);
    const onCalendarComposerChange = useCallback((open:boolean) => {
        calendarComposerOpenRef.current = open;
        setCalendarComposerOpen(open);
        if (hoverExitTimer.current) clearTimeout(hoverExitTimer.current);
        if (open) setIsHovered(true);
    }, []);
    const showNotifications = notifications.visible && !calendarComposerOpen && !showAiLimits;
    const [calendarPinned, setCalendarPinned] = useState(false);
    const [calendarDate, setCalendarDate] = useState(() => dayStart(new Date()));
    const eco = useEcoMode();
    const [profile] = usePersonalSetting('bloom-personal-profile', 'work');
    const [islandDate] = usePersonalSetting('bloom-island-date', 'false');
    const [islandBattery] = usePersonalSetting('bloom-island-battery', 'true');
    const [islandCpu] = usePersonalSetting('bloom-island-cpu', 'true');
    const [islandPositionRaw] = usePersonalSetting('bloom-island-position', 'top-center');
    const [islandDockRaw] = usePersonalSetting('bloom-dock-design', '{}');
    const [islandDockEnabled] = usePersonalSetting('bloom-dock-enabled', 'true');
    const placement = islandPosition(islandPositionRaw);
    const [showUpcoming] = usePersonalSetting(`bloom-profile-${profile}-upcoming`, profile === 'relax' ? 'false' : 'true');
    const [showActions] = usePersonalSetting(`bloom-profile-${profile}-actions`, 'true');
    const [reminderLead] = usePersonalSetting('bloom-calendar-reminder', '10');
    const calendar = useCalendar(Math.min(+calendarDate - 45 * 86400000, +dayStart(new Date()) - 86400000), Math.max(+calendarDate + 50 * 86400000, +dayStart(new Date()) + 30 * 86400000), eco);
    const reminder = useReminders(calendar.events, Math.max(0, Math.min(30, Number(reminderLead) || 0)), dndActive);
    const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
    useEffect(() => { const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight }); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
    const [isReady, setIsReady] = useState(false);
    const [scale, setScale] = useState(() => parseFloat(localStorage.getItem("bloom-scale") || "1.0"));
    const [dockLayout,setDockLayout]=useState<{edge:string;thickness:number;scale:number;width:number;height:number}|null>(null);
    useEffect(()=>{
        const off=listen<typeof dockLayout>('dock-workspace-layout',event=>{
            const value=event.payload;
            if(value&&['left','right','bottom'].includes(value.edge)&&[value.thickness,value.scale,value.width,value.height].every(v=>Number.isFinite(v)&&v>0)&&value.thickness<=Math.max(value.width,value.height))setDockLayout(value);
        });
        void off.then(()=>emit('dock-workspace-layout-request')).catch(()=>{});
        return()=>{void off.then(f=>f());};
    },[]);
    const measuredDock=dockLayout&&dockLayout.scale===scale&&Math.abs(dockLayout.width-viewport.width)<2&&Math.abs(dockLayout.height-viewport.height)<2?{edge:dockLayout.edge,thickness:dockLayout.thickness/scale}:undefined;
    const panelInsets = islandInsets(placement, islandDockRaw, islandDockEnabled !== 'false', viewport.height/scale,measuredDock);
    const [timeFormat24h, setTimeFormat24h] = useState(() => localStorage.getItem("bloom-time-format-24h") === "true");
    const [batteryLevel, setBatteryLevel] = useState(100);
    const [isCharging, setIsCharging] = useState(false);
    const [showPowerPulse, setShowPowerPulse] = useState(false);
    const [showLowBatteryPulse, setShowLowBatteryPulse] = useState(false);
    const [lowBatteryThreshold, setLowBatteryThreshold] = useState(() => parseInt(localStorage.getItem("bloom-low-battery-threshold") || "20"));
    const prevChargingRef = useRef<boolean | null>(null);
    const powerPulseTimeoutRef = useRef<any>(null);
    const lowBatteryPulseShownRef = useRef<boolean>(false);
    const [eventPeek, setEventPeek] = useState(false);
    const eventPeekTimeoutRef = useRef<any>(null);
    const updatePulseTimerRef = useRef<any>(null);
    const triggerEventPeek = useCallback((duration = 3000) => {
        setEventPeek(true);
        if (eventPeekTimeoutRef.current)
            clearTimeout(eventPeekTimeoutRef.current);
        eventPeekTimeoutRef.current = setTimeout(() => setEventPeek(false), duration);
    }, []);
    const [notchMode, setNotchMode] = useState(() => {
        const raw = localStorage.getItem("bloom-notch-mode") || "fixed";
        if (raw === "auto-hide")
            return "smart";
        return raw;
    });
    useEffect(() => {
        if (isReady && prevChargingRef.current !== null && prevChargingRef.current !== isCharging) {
            setShowPowerPulse(true);
            if (notchMode === 'peek')
                triggerEventPeek(4000);
            if (powerPulseTimeoutRef.current)
                clearTimeout(powerPulseTimeoutRef.current);
            powerPulseTimeoutRef.current = setTimeout(() => {
                setShowPowerPulse(false);
            }, 4000);
        }
        prevChargingRef.current = isCharging;
    }, [isCharging, isReady, notchMode, triggerEventPeek]);
    useEffect(() => {
        // Trigger pulse when dropping below threshold while discharging
        if (isReady && batteryLevel <= lowBatteryThreshold && !isCharging && !lowBatteryPulseShownRef.current) {
            setShowLowBatteryPulse(true);
            if (notchMode === 'peek')
                triggerEventPeek(5000);
            lowBatteryPulseShownRef.current = true;
            setTimeout(() => setShowLowBatteryPulse(false), 5000);
        }
        // Reset the "shown" state if battery is charged or threshold is lowered
        if (isCharging || batteryLevel > lowBatteryThreshold) {
            lowBatteryPulseShownRef.current = false;
        }
    }, [batteryLevel, isCharging, lowBatteryThreshold, isReady, notchMode, triggerEventPeek]);
    // Weather state (managed by useWeather hook)
    // Media state
    const [isPlaying, setIsPlaying] = useState(false);
    const [mediaInfo, setMediaInfo] = useState<MediaInfo>({
        title: "",
        artist: "",
        is_playing: false,
        has_media: false
    });
    const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
    const [albumArtKey, setAlbumArtKey] = useState(0);
    const [volume, setVolume] = useState(0.5);




    const [adjustmentError,setAdjustmentError]=useState('');
    const volumeAdjustment=useRef<ReturnType<typeof confirmedAdjustment>|null>(null);

    if(!volumeAdjustment.current)volumeAdjustment.current=confirmedAdjustment(.5,async value=>{
        const actual=await invoke<unknown>('set_volume',{volume:value});return typeof actual==='number'?actual:value;
    },setVolume,e=>setAdjustmentError(e?trError(String(e)):''));

    useEffect(()=>()=>{volumeAdjustment.current?.cancelTimer();},[]);
    // System metrics for status widgets
    const [cpuUsage, setCpuUsage] = useState<number|null>(null);
    const [ramUsage, setRamUsage] = useState<number|null>(null);
    const [diskSpace, setDiskSpace] = useState<number|null>(null);
    const [networkReady,setNetworkReady]=useState(false);
    const [netUpSpeed, setNetUpSpeed] = useState(0);
    const [netDownSpeed, setNetDownSpeed] = useState(0);
    const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({ left: ["weather"], right: ["battery"] });
    const [windowLabel, setWindowLabel] = useState<string>("");
    useEffect(() => {
        setWindowLabel(getCurrentWebviewWindow().label);
    }, []);
    // Update state
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [showUpdateIndicator, setShowUpdateIndicator] = useState(() => localStorage.getItem("bloom-show-update-indicator") !== "false");
    const [showUpdatePulse, setShowUpdatePulse] = useState(false);
    useEffect(() => {
        if (windowLabel !== 'main')
            return;
        let unlisten: (() => void) | undefined;
        let disposed = false;
        listen<UpdateCheckResult>("update-available", (event) => {
            setUpdateAvailable(event.payload.available);
            if (!event.payload.available)
                return;
            setShowUpdatePulse(true);
            if (notchMode === 'peek')
                triggerEventPeek(6000);
            if (updatePulseTimerRef.current)
                clearTimeout(updatePulseTimerRef.current);
            updatePulseTimerRef.current = setTimeout(() => {
                setShowUpdatePulse(false);
            }, 6000);
        }).then((fn) => {
            if (disposed)
                fn();
            else
                unlisten = fn;
        });
        invoke<UpdateCheckResult>("get_update_state")
            .then((state) => {
            if (state.available)
                setUpdateAvailable(true);
        })
            .catch((e) => console.error("Failed to read update state:", e));
        return () => {
            disposed = true;
            unlisten?.();
            if (updatePulseTimerRef.current)
                clearTimeout(updatePulseTimerRef.current);
        };
    }, [windowLabel, notchMode, triggerEventPeek]);
    const [isVisible, setIsVisible] = useState(true);
    const [isImpacted, setIsImpacted] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [startupAnimating, setStartupAnimating] = useState(false);
    const [dockMode, setDockMode] = useState(() => {
        const raw = localStorage.getItem("bloom-dock-mode") || "fixed";
        if (raw === "auto-hide")
            return "smart";
        return raw;
    });
    const [dockEnabled, setDockEnabled] = useState(() => localStorage.getItem("bloom-dock-enabled") !== "false");
    const [isNotchHovered, setIsNotchHovered] = useState(false);
    const [isEdgeHovered, setIsEdgeHovered] = useState(false);
    const [isOverlapped, setIsOverlapped] = useState(false);
    const [interactionState, setInteractionState] = useState<'active' | 'grace' | 'none'>('none');
    const bloomRef = useRef<HTMLDivElement>(null);
    const dockEnabledInitial = useRef(true);
    const dockModeInitial = useRef(true);
    const notchModeInitial = useRef(true);
    const isAnyInteraction = calendarComposerOpen || isHovered || isNotchHovered || isEdgeHovered || (notchMode !== 'hover' && (calendarPinned || !!reminder.active || showNotifications));
    const isHidden = notchMode === 'hover' ? interactionState === 'none' && !isAnyInteraction : !startupAnimating && ((notchMode === 'smart' && isOverlapped && interactionState === 'none') ||
        (notchMode === 'peek' && interactionState === 'none' && !eventPeek));
    useEffect(() => {
        if (isAnyInteraction) {
            setInteractionState('active');
        }
        else if (interactionState !== 'none') {
            setInteractionState('grace');
            const timer = setTimeout(() => setInteractionState('none'), 800);
            return () => clearTimeout(timer);
        }
    }, [isAnyInteraction]);
    useEffect(() => {
        if (windowLabel === 'main') {
            invoke('set_notch_hovered', { hovered: isNotchHovered || calendarComposerOpen }).catch(() => { });
        }
    }, [isNotchHovered, calendarComposerOpen, windowLabel]);
    useEffect(() => {
        const updateRect = () => {
            if (bloomRef.current && windowLabel === 'main') {
                const rect = bloomRef.current.getBoundingClientRect();
                invoke('update_notch_rect', {
                    visible: isVisible && !isHidden,
                    rect: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        width: Math.round(rect.width),
                        height: Math.round(rect.height)
                    }
                }).catch(() => { });
            }
        };
        updateRect();
        window.addEventListener('resize', updateRect);
        const observer = new ResizeObserver(updateRect);
        if (bloomRef.current)
            observer.observe(bloomRef.current);
        return () => {
            window.removeEventListener('resize', updateRect);
            observer.disconnect();
        };
    }, [isExpanded, isHidden, isVisible, windowLabel, scale, placement, panelInsets.left, panelInsets.right, panelInsets.top, panelInsets.bottom]);
    useEffect(() => {
        if (!windowLabel)
            return;
        // Only animate the main top-bar
        if (windowLabel !== 'main') {
            setIsReady(true);
            setIsImpacted(true);
            setIsExpanded(true);
            return;
        }
        const proceedWithStartup = () => {
            const checkVisibility = async () => {
                try {
                    const win = getCurrentWebviewWindow();
                    const visible = await win.isVisible();
                    if (visible) {
                        setStartupAnimating(true);
                        setIsReady(true);
                        setTimeout(() => {
                            setIsImpacted(true);
                            setIsExpanded(true);
                        }, 240);
                        setTimeout(() => setStartupAnimating(false), 1500);
                        return true;
                    }
                }
                catch (e) { }
                return false;
            };
            const interval = setInterval(async () => {
                if (await checkVisibility())
                    clearInterval(interval);
            }, 100);
            checkVisibility();
            return interval;
        };
        // Mirror Overlay.tsx's splash decision so we only wait when a splash will actually fire.
        // Overlay always emits splash-done, but on a normal relaunch it emits it near-instantly
        // (after one async getVersion() call) — before this listener would be registered.
        // By making the same decision here we avoid a race and avoid any unnecessary delay.
        const firstRun = localStorage.getItem("bloom-first-run") === null;
        const storedVersion = localStorage.getItem("bloom-app-version");
        const waitForSplash = () => {
            // Splash is definitely coming — register listener now (2800ms animation gives us plenty of time)
            let started = false;
            let interval: any;
            const unlistenSplash = listen("splash-done", () => {
                if (started)
                    return;
                started = true;
                interval = proceedWithStartup();
                unlistenSplash.then(fn => fn());
            });
            const safetyTimer = setTimeout(() => {
                if (started)
                    return;
                started = true;
                interval = proceedWithStartup();
                unlistenSplash.then(fn => fn());
            }, 6000);
            return () => {
                clearTimeout(safetyTimer);
                if (interval)
                    clearInterval(interval);
                unlistenSplash.then(fn => fn());
            };
        };
        if (firstRun || storedVersion === null) {
            // Splash is definitely showing — wait for it
            return waitForSplash();
        }
        // Has a version key — need async check to know if version changed
        let interval: any;
        getVersion().then(currentVersion => {
            if (storedVersion !== currentVersion) {
                // Version changed — splash is coming, wait for it
                // (splash takes 2800ms so there's plenty of time to register the listener)
                waitForSplash();
            }
            else {
                // Same version — no splash, start immediately
                interval = proceedWithStartup();
            }
        }).catch(() => {
            interval = proceedWithStartup();
        });
        return () => { if (interval)
            clearInterval(interval); };
    }, [windowLabel]);
    // Settings state
    const [settingsWeatherEnabled, setSettingsWeatherEnabled] = useState(() => localStorage.getItem("bloom-weather-enabled") !== "false");
    const [settingsCalendarEnabled, setSettingsCalendarEnabled] = useState(() => localStorage.getItem("bloom-calendar-enabled") !== "false");
    const [settingsMusicModeEnabled, setSettingsMusicModeEnabled] = useState(() => localStorage.getItem("bloom-music-mode-enabled") !== "false");
    const [settingsMusicCompactNotch, setSettingsMusicCompactNotch] = useState(() => localStorage.getItem("bloom-music-compact-notch") !== "false");
    const [settingsVisualizerEnabled, setSettingsVisualizerEnabled] = useState(() => localStorage.getItem("bloom-visualizer-enabled") !== "false");
    const [settingsAlbumArtEnabled, setSettingsAlbumArtEnabled] = useState(() => localStorage.getItem("bloom-media-album-art-enabled") !== "false");
    const [settingsAmbienceEnabled, setSettingsAmbienceEnabled] = useState(() => localStorage.getItem("bloom-media-ambience-enabled") !== "false");
    const [settingsCompactGlowEnabled, setSettingsCompactGlowEnabled] = useState(() => localStorage.getItem("bloom-media-compact-glow-enabled") !== "false");
    const [settingsCornersEnabled, setSettingsCornersEnabled] = useState(() => localStorage.getItem("bloom-corners-enabled") === "true");
    const [mediaLayout, setMediaLayout] = useState<'classic' | 'compact'>(() => (localStorage.getItem("bloom-media-layout") as 'classic' | 'compact') || 'classic');
    const [compactVolumeExpanded, setCompactVolumeExpanded] = useState(false);
    // Weather hook
    const { temperature, weatherCondition, weatherIcon: WeatherIcon, cityName, tempUnit } = useWeather(settingsWeatherEnabled);
    useEffect(() => {
        if (!windowLabel)
            return;
        invoke("load_settings").then((settings: any) => {
            const getVal = (key: string, fallback: string | null = null) => {
                const val = settings[key];
                if (val !== undefined && val !== null)
                    return String(val);
                const local = localStorage.getItem(key);
                if (local !== null)
                    return local;
                return fallback;
            };
            setSettingsWeatherEnabled(getVal("bloom-weather-enabled", "true") !== "false");
            setSettingsCalendarEnabled(getVal("bloom-calendar-enabled", "true") !== "false");
            setSettingsMusicModeEnabled(getVal("bloom-music-mode-enabled", "true") !== "false");
            setSettingsMusicCompactNotch(getVal("bloom-music-compact-notch", "true") !== "false");
            const viz = getVal("bloom-media-visualizer-enabled") ?? getVal("bloom-visualizer-enabled", "true");
            setSettingsVisualizerEnabled(viz !== "false");
            setSettingsAlbumArtEnabled(getVal("bloom-media-album-art-enabled", "true") !== "false");
            setSettingsAmbienceEnabled(getVal("bloom-media-ambience-enabled", "true") !== "false");
            setSettingsCompactGlowEnabled(getVal("bloom-media-compact-glow-enabled", "true") !== "false");
            setSettingsCornersEnabled(getVal("bloom-corners-enabled", "false") === "true");
            setTimeFormat24h(getVal("bloom-time-format-24h") === "true");
            const thresholdStr = getVal("bloom-low-battery-threshold", "20");
            if (thresholdStr)
                setLowBatteryThreshold(parseInt(thresholdStr as string));
            const nMode = getVal("bloom-notch-mode", "fixed");
            if (nMode) {
                const mapped = nMode === "auto-hide" ? "smart" : nMode;
                setNotchMode(mapped);
            }
            if (windowLabel === 'main') {
                const firstRun = localStorage.getItem("bloom-first-run") === null;
                if (firstRun) {
                    import("@tauri-apps/plugin-autostart").then(({ enable, isEnabled }) => {
                        isEnabled().then(enabled => {
                            if (!enabled)
                                enable().catch(() => { });
                        });
                    });
                    localStorage.setItem("bloom-first-run", "done");
                }
                const rawDockMode = getVal("bloom-dock-mode", "fixed") as string;
                const dockMode = rawDockMode === "auto-hide" ? "smart" : rawDockMode;
                const syncWindows = async () => {
                    const dockEnabled = getVal("bloom-dock-enabled", "true") === "true";
                    if (dockEnabled) {
                        await invoke("init_dock", { mode: dockMode });
                    }
                    await invoke("change_notch_mode", { mode: nMode });
                    await invoke("sync_appbar");
                };
                const dockEnabled = getVal("bloom-dock-enabled", "true") === "true";
                const runDockInit = () => {
                    // 1. Snappy initial sync
                    setTimeout(syncWindows, 400);
                    // 2. Safety-net dock retry
                    if (dockEnabled) {
                        setTimeout(() => invoke("init_dock", { mode: dockMode }).catch(() => { }), 1500);
                    }
                    // 3. Layout corrections
                    setTimeout(() => invoke("sync_appbar"), 1000);
                    setTimeout(() => invoke("sync_appbar"), 2500);
                    setTimeout(() => invoke("sync_appbar"), 5000);
                };
                // Mirror Overlay.tsx's splash decision for dock init too — only wait when
                // a splash is actually coming, otherwise init immediately.
                const runDockInitAfterSplash = () => {
                    let dockStarted = false;
                    const unlistenDock = listen("splash-done", () => {
                        if (dockStarted)
                            return;
                        dockStarted = true;
                        runDockInit();
                        unlistenDock.then(fn => fn());
                    });
                    setTimeout(() => {
                        if (dockStarted)
                            return;
                        dockStarted = true;
                        runDockInit();
                        unlistenDock.then(fn => fn());
                    }, 6000);
                };
                const storedVersion = localStorage.getItem("bloom-app-version");
                if (firstRun || storedVersion === null) {
                    runDockInitAfterSplash();
                }
                else {
                    getVersion().then(currentVersion => {
                        if (storedVersion !== currentVersion) {
                            runDockInitAfterSplash();
                        }
                        else {
                            runDockInit();
                        }
                    }).catch(() => runDockInit());
                }
            }
            const scaleVal = getVal("bloom-scale");
            if (scaleVal !== null)
                setScale(parseFloat(scaleVal));
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
        }).catch(console.error);
    }, [windowLabel]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        // Disable context menu globally
        const preventContext = (e: MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', preventContext);
        const unlistenVisibility = listen<boolean>("visibility-change", (event) => {
            setIsVisible(event.payload);
        });
        const unlistenNotchOverlap = listen<boolean>("notch-overlap", (event) => {
            setIsOverlapped(event.payload);
        });
        const unlistenNotchEdgeHover = listen<boolean>("notch-edge-hover", (event) => {
            setIsEdgeHovered(event.payload);
        });
        const unlistenDisplay=listen('display-layout-changed',()=>window.dispatchEvent(new Event('resize')));
        return () => {
            void unlistenDisplay.then(f=>f());
            unlistenVisibility.then(f => f());
            unlistenNotchOverlap.then(f => f());
            unlistenNotchEdgeHover.then(f => f());
            document.removeEventListener('contextmenu', preventContext);
        };
    }, [windowLabel]);
    // Settings sync — consolidated dispatch for all settings events
    useSettingsSync({
        "bloom-weather-enabled": setSettingsWeatherEnabled,
        "bloom-calendar-enabled": setSettingsCalendarEnabled,
        "bloom-music-mode-enabled": setSettingsMusicModeEnabled,
        "bloom-music-compact-notch": setSettingsMusicCompactNotch,
        "bloom-media-visualizer-enabled": setSettingsVisualizerEnabled,
        "bloom-visualizer-enabled": setSettingsVisualizerEnabled,
        "bloom-media-album-art-enabled": setSettingsAlbumArtEnabled,
        "bloom-media-ambience-enabled": setSettingsAmbienceEnabled,
        "bloom-media-compact-glow-enabled": setSettingsCompactGlowEnabled,
        "bloom-media-layout": setMediaLayout,
        "bloom-corners-enabled": setSettingsCornersEnabled,
        "bloom-scale": setScale,
        "bloom-low-battery-threshold": setLowBatteryThreshold,
        "bloom-dock-enabled": setDockEnabled,
        "bloom-dock-mode": setDockMode,
        "bloom-notch-mode": setNotchMode,
        "bloom-status-widgets": (value) => {
            try {
                const parsed = JSON.parse(value);
                if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
                    setStatusWidgets(parsed);
                }
            }
            catch { }
        },
        "bloom-show-update-indicator": (value) => setShowUpdateIndicator(String(value) === "true"),
        "bloom-time-format-24h": setTimeFormat24h,
    }, [windowLabel]);
    // Side effects: dock-enabled (skip first render — startup code handles initial state)
    useEffect(() => {
        if (windowLabel !== 'main')
            return;
        if (dockEnabledInitial.current) {
            dockEnabledInitial.current = false;
            return;
        }
        if (dockEnabled) {
            invoke("init_dock", { mode: localStorage.getItem("bloom-dock-mode") || "fixed" });
        }
        else {
            invoke("toggle_dock", { enable: false });
        }
        setTimeout(() => invoke("sync_appbar"), 200);
    }, [dockEnabled, windowLabel]);
    // Side effects: dock-mode (skip first render)
    useEffect(() => {
        if (windowLabel !== 'main')
            return;
        if (dockModeInitial.current) {
            dockModeInitial.current = false;
            return;
        }
        invoke("change_dock_mode", { mode: dockMode });
        setTimeout(() => invoke("sync_appbar"), 200);
    }, [dockMode, windowLabel]);
    // Side effects: notch-mode (skip first render)
    useEffect(() => {
        if (windowLabel !== 'main')
            return;
        if (notchModeInitial.current) {
            notchModeInitial.current = false;
            return;
        }
        invoke("change_notch_mode", { mode: notchMode });
    }, [notchMode, windowLabel]);
    // Bloom mode state: 'music', 'calendar', 'command-center', or 'status'
    const [bloomMode, setBloomMode] = useState<'music' | 'calendar' | 'command-center' | 'status'>('status');
    useEffect(() => {
        if (bloomMode === 'calendar') setCalendarDate(dayStart(new Date()));
    }, [bloomMode]);
    // Window height is now kept constant to prevent rendering layout lag and sharp corners
    const lastScrollTime = useRef(0);
    const handleWheel = (e: React.WheelEvent) => {
        if (calendarComposerOpenRef.current || showAiLimits) return;
        const target = e.target as HTMLElement;
        if (target.closest('.bloom-calendar') || target.closest('.calendar-container') || target.closest('.timer-column')) {
            return;
        }
        if (!isHovered)
            return;
        const now = Date.now();
        if (now - lastScrollTime.current < 250)
            return;
        // Use absolute values to detect horizontal swipe gestures on trackpad
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        if (Math.abs(delta) < 5)
            return; // Ignore tiny movements
        // Music shifts position based on playing state:
        // Playing: command-center в†’ music в†’ status в†’ calendar (active, near command-center)
        // Paused:  command-center в†’ status в†’ music в†’ calendar (secondary, after status)
        const musicBeforeStatus = isPlaying && mediaInfo.has_media && settingsMusicModeEnabled;
        const modes: ('command-center' | 'status' | 'music' | 'calendar')[] = musicBeforeStatus
            ? ['command-center', 'music', 'status', 'calendar']
            : ['command-center', 'status', 'music', 'calendar'];
        const availableModes = modes.filter(m => {
            if (m === 'music' && (!settingsMusicModeEnabled || !mediaInfo.has_media))
                return false;
            if (m === 'calendar' && !settingsCalendarEnabled)
                return false;
            return true;
        });
        const currentIndex = availableModes.indexOf(bloomMode);
        if (currentIndex === -1)
            return;
        if (delta > 0) {
            const nextIndex = (currentIndex + 1) % availableModes.length;
            const nextMode = availableModes[nextIndex];
            manualMusicRef.current = nextMode === 'music';
            setBloomMode(nextMode);
            lastScrollTime.current = now;
        }
        else if (delta < 0) {
            const prevIndex = (currentIndex - 1 + availableModes.length) % availableModes.length;
            const prevMode = availableModes[prevIndex];
            manualMusicRef.current = prevMode === 'music';
            setBloomMode(prevMode);
            lastScrollTime.current = now;
        }
    };
    // Timer state
    const [timerSeconds, setTimerSeconds] = useState(0);
    const [isTimerRunning, setIsTimerRunning] = useState(false);
    const [isCompactTimerVisible, setIsCompactTimerVisible] = useState(false);
    const [isTimerFinished, setIsTimerFinished] = useState(false);
    const timerIntervalRef = useRef<any>(null);
    const formatTimerTime = (totalSeconds: number) => {
        const mins = Math.floor(Math.abs(totalSeconds) / 60);
        const secs = Math.abs(totalSeconds) % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    const startTimer = (mins: number) => {
        setTimerSeconds(mins * 60);
        setIsTimerRunning(true);
        setIsTimerFinished(false);
    };
    const toggleTimer = () => setIsTimerRunning(!isTimerRunning);
    const resetTimer = () => {
        setIsTimerRunning(false);
        setTimerSeconds(0);
        setIsTimerFinished(false);
    };
    useEffect(() => {
        if (isTimerRunning && timerSeconds > 0) {
            timerIntervalRef.current = setInterval(() => {
                setTimerSeconds(s => s - 1);
            }, 1000);
        }
        else if (isTimerRunning && timerSeconds === 0) {
            setIsTimerRunning(false);
            setIsTimerFinished(true);
        }
        return () => {
            if (timerIntervalRef.current)
                clearInterval(timerIntervalRef.current);
        };
    }, [isTimerRunning, timerSeconds === 0]);
    const lastTrackRef = useRef<string | null>(null);
    const lastPlayingRef = useRef<boolean>(false);
    const manualMusicRef = useRef<boolean>(false);
    // Auto-switch to music mode only when a *new* track starts while playing,
    // or when playback transitions from paused to playing.
    useEffect(() => {
        const isNewTrackWhilePlaying = mediaInfo.title !== lastTrackRef.current && isPlaying;
        const justStartedPlaying = isPlaying && !lastPlayingRef.current;
        // Peek notch on media events (play start or track change)
        if (notchMode === 'peek' && (isNewTrackWhilePlaying || justStartedPlaying)) {
            triggerEventPeek(3000);
        }
        // Only auto-switch if music mode is enabled
        if (settingsMusicModeEnabled && mediaInfo.has_media && isPlaying && bloomMode !== 'calendar' && bloomMode !== 'command-center' && !isHovered && !calendarPinned && !calendarComposerOpen && (isNewTrackWhilePlaying || justStartedPlaying)) {
            // Switch if compact notch display is enabled OR we are hovered
            if (settingsMusicCompactNotch || isHovered) {
                manualMusicRef.current = false;
                setBloomMode('music');
            }
        }
        lastTrackRef.current = mediaInfo.title;
        lastPlayingRef.current = isPlaying;
    }, [mediaInfo.has_media, isPlaying, mediaInfo.title, settingsMusicModeEnabled, settingsMusicCompactNotch, isHovered, bloomMode, notchMode, triggerEventPeek, calendarPinned, calendarComposerOpen]);
    // Auto-switch back from music if music stops for 5 seconds
    // Skip if user manually scrolled to music mode
    useEffect(() => {
        let timer: any;
        if (!isPlaying && bloomMode === 'music' && !manualMusicRef.current) {
            timer = setTimeout(() => {
                setBloomMode('status');
            }, 5000);
        }
        return () => clearTimeout(timer);
    }, [isPlaying, bloomMode]);
    // Reset bloom mode when calendar setting is disabled
    useEffect(() => {
        if (!settingsCalendarEnabled && bloomMode === 'calendar') {
            setBloomMode('status');
        }
    }, [settingsCalendarEnabled, bloomMode]);
    // Reset bloom mode when music mode setting is disabled
    useEffect(() => {
        if (!settingsMusicModeEnabled && bloomMode === 'music') {
            setBloomMode('status');
        }
    }, [settingsMusicModeEnabled, bloomMode]);
    // Reset bloom mode when compact notch display is disabled while collapsed
    useEffect(() => {
        if (!settingsMusicCompactNotch && bloomMode === 'music' && !isHovered) {
            setBloomMode('status');
        }
    }, [settingsMusicCompactNotch, bloomMode, isHovered]);
    // Synchronize bloom mode immediately when music settings are toggled and music is playing
    useEffect(() => {
        if (settingsMusicModeEnabled && settingsMusicCompactNotch && mediaInfo.has_media && isPlaying && bloomMode === 'status' && !isHovered) {
            setBloomMode('music');
        }
    }, [settingsMusicModeEnabled, settingsMusicCompactNotch, mediaInfo.has_media, isPlaying, bloomMode, isHovered]);
    // Update time
    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setTime(now.toLocaleTimeString(locale(), {
                hour: "2-digit",
                minute: "2-digit",
                hour12: !timeFormat24h,
            }));
        };
        updateTime();
        const interval = setInterval(updateTime, 1000);
        // Toggle compact timer view every 5 seconds if running
        let timerToggleInterval: any;
        if (isTimerRunning && bloomMode !== 'calendar') {
            timerToggleInterval = setInterval(() => {
                setIsCompactTimerVisible(prev => !prev);
            }, 5000);
        }
        else {
            setIsCompactTimerVisible(false);
        }
        return () => {
            clearInterval(interval);
            if (timerToggleInterval)
                clearInterval(timerToggleInterval);
        };
    }, [isTimerRunning, bloomMode, timeFormat24h, getLanguage()]);
    // Battery API
    useEffect(() => {
        let battery: any = null;
        const initBattery = async () => {
            try {
                battery = await (navigator as any).getBattery();
                const updateBattery = () => {
                    setBatteryLevel(Math.round(battery.level * 100));
                    setIsCharging(battery.charging);
                };
                updateBattery();
                battery.addEventListener("levelchange", updateBattery);
                battery.addEventListener("chargingchange", updateBattery);
                return () => {
                    battery.removeEventListener("levelchange", updateBattery);
                    battery.removeEventListener("chargingchange", updateBattery);
                };
            }
            catch (e) {
                // Battery API not supported
            }
        };
        initBattery();
    }, []);
    // Listen for Volume Changes
    useEffect(() => {
        const unlisten = listen<{
            volume: number;
            is_muted: boolean;
        }>("volume-change", (event) => {
            volumeAdjustment.current?.receive(event.payload.volume);
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);
    useEffect(()=>{void invoke<number>('get_volume').then(setVolume).catch(()=>{});},[]);
    // Hidden metrics have no polling timer. A single in-flight sample avoids request buildup.
    const visibleMetrics = [...new Set([
        ...(islandCpu === 'true' ? ['cpu'] : []),
        ...(isHovered && !(mediaInfo.has_media && bloomMode === 'music' && settingsMusicModeEnabled)
            ? [...statusWidgets.left, ...statusWidgets.right] : []),
    ].filter(id => ['cpu', 'ram', 'disk', 'net'].includes(id)))].sort().join(',');
    useEffect(() => {
        if (!visibleMetrics) return;
        let alive = true, running = false;
        const fetchMetrics = async () => {
            if (running) return;
            running = true;
            const ids = visibleMetrics.split(',');
            await Promise.allSettled(ids.map(async id => {
                if (id === 'net') {
                    const [up, down] = await invoke<[number, number]>('get_network_speed');
                    if (alive&&Number.isFinite(up)&&Number.isFinite(down)&&up>=0&&down>=0) { setNetUpSpeed(up); setNetDownSpeed(down);setNetworkReady(true); }
                } else if (id === 'cpu' || id === 'ram' || id === 'disk') {
                    const command = {cpu: 'get_cpu_usage', ram: 'get_ram_usage', disk: 'get_disk_space'}[id];
                    if (!command) return;
                    const value = await invoke<number>(command);
                    if (alive&&Number.isFinite(value)&&value>=0&&(id==='disk'||value<=100)) ({cpu: setCpuUsage, ram: setRamUsage, disk: setDiskSpace}[id])?.(value);
                }
            }));
            running = false;
        };
        void fetchMetrics();
        const interval = setInterval(fetchMetrics, eco ? 10000 : 3000);
        return () => { alive = false; clearInterval(interval); };
    }, [visibleMetrics, eco]);
    // Native Windows Media Controls - Listen for updates from background worker
    useEffect(() => {
        const unlisten = listen<MediaInfo>("media-update", (event) => {
            const info = event.payload;
            if (!info)
                return;
            setMediaInfo(prev => {
                // Find if artwork changed by checking the first element
                const prevArt = prev.artwork?.[0];
                const nextArt = info.artwork?.[0];
                const artChanged = prevArt !== nextArt;
                if (prev.title === info.title &&
                    prev.artist === info.artist &&
                    prev.is_playing === info.is_playing &&
                    prev.has_media === info.has_media &&
                    !artChanged &&
                    prev.position_ms === info.position_ms &&
                    prev.duration_ms === info.duration_ms) {
                    return prev;
                }
                // Update playing state separately for the hook triggers
                setIsPlaying(info.is_playing);
                if (info.artwork && info.artwork.length > 0) {
                    const newArt = info.artwork[0];
                    setAlbumArtUrl(prev => {
                        if (prev !== newArt) {
                            setAlbumArtKey(k => k + 1);
                            return newArt;
                        }
                        return prev;
                    });
                }
                else {
                    setAlbumArtUrl(null);
                }
                return info;
            });
        });
        return () => {
            unlisten.then(fn => fn());
        };
    }, []);
    // Media controls via Tauri commands
    /* Unused saveAndBroadcast removed to fix TS build error */
    const togglePlayPause = useCallback(async () => {
        try {
            await invoke("media_play_pause");
            setIsPlaying(!isPlaying);
        }
        catch (e) {
            console.error("Failed to toggle play/pause:", e);
        }
    }, [isPlaying]);
    const skipNext = useCallback(async () => {
        try {
            await invoke("media_next");
        }
        catch (e) {
            console.error("Failed to skip next:", e);
        }
    }, []);
    const skipPrevious = useCallback(async () => {
        try {
            await invoke("media_previous");
        }
        catch (e) {
            console.error("Failed to skip previous:", e);
        }
    }, []);
    // Slide-push animation for prev/next buttons
    const prevFront = useAnimation();
    const prevBack = useAnimation();
    const nextFront = useAnimation();
    const nextBack = useAnimation();
    const animatePrev = useCallback(async () => {
        prevFront.set({ x: 0 });
        prevBack.set({ x: 30 });
        prevFront.start({ x: -30, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
        await prevBack.start({ x: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
        skipPrevious();
    }, [skipPrevious, prevFront, prevBack]);
    const animateNext = useCallback(async () => {
        nextFront.set({ x: 0 });
        nextBack.set({ x: -30 });
        nextFront.start({ x: 30, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
        await nextBack.start({ x: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
        skipNext();
    }, [skipNext, nextFront, nextBack]);
    const handleVolumeChange = useCallback((newVol: number) => {
        volumeAdjustment.current?.change(newVol);
    }, []);
    // Open WiFi settings

    // WiFi toggle

    // Bluetooth toggle

    // Battery Saver - opens settings (no public API to toggle without admin)


    // Open system tray (unhide taskbar and invoke Win+B)

    const openSettingsWindow = useCallback(async () => {
        try {
            await invoke("open_settings_window");
        }
        catch (e) {
            console.error("Failed to open settings window:", e);
        }
    }, []);




    const toggleCalendarMode = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (calendarComposerOpenRef.current) return;
        setAiLimitsOpen(false);
        if (isTimerFinished) {
            resetTimer();
            return;
        }
        if (!settingsCalendarEnabled)
            return;
        setBloomMode(prev => {
            if (prev === 'calendar') {
                // Return to music mode if media is present and playing and music mode is enabled, otherwise status
                return (settingsMusicModeEnabled && mediaInfo.has_media && isPlaying) ? 'music' : 'status';
            }
            return 'calendar';
        });
    };
    // Render a status widget by ID
    const renderStatusWidget = (id: string) => {
        switch (id) {
            case "weather":
                if (!settingsWeatherEnabled || temperature === null)
                    return null;
                return (<div className="passive-feature" key="weather" title={cityName ? `${tr(weatherCondition)} — ${cityName}` : tr(weatherCondition)}>
            <WeatherIcon size={12} strokeWidth={2.2}/>
            <span className="label">{temperature}°{tempUnit === "fahrenheit" ? "F" : "C"}</span>
          </div>);
            case "battery":
                return (<div className="passive-feature" key="battery">
            <BatteryIcon charging={isCharging} level={batteryLevel} threshold={lowBatteryThreshold}/>
            <span className="label">{batteryLevel}%</span>
          </div>);
            case "cpu":
                return (<div className="passive-feature" key="cpu" title={tr("CPU Usage")}>
            <Cpu size={12} strokeWidth={2}/>
            <span className="label">{cpuUsage===null?'—':`${cpuUsage}%`}</span>
          </div>);
            case "ram":
                return (<div className="passive-feature" key="ram" title={tr("RAM Usage")}>
            <MemoryStick size={12} strokeWidth={2}/>
            <span className="label">{ramUsage===null?'—':`${Math.round(ramUsage)}%`}</span>
          </div>);
            case "disk":
                return (<div className="passive-feature" key="disk" title={tr("Free Disk Space")}>
            <HardDrive size={12} strokeWidth={2}/>
            <span className="label">{diskSpace===null?'—':`${diskSpace}${tr('GB')}`}</span>
          </div>);
            case "net":
                return (<div className="passive-feature" key="net" title={tr("Network Speed")}>
            <ArrowUpDown size={12} strokeWidth={2}/>
            <span className="label">{networkReady?`↑${formatBytes(netUpSpeed)} ↓${formatBytes(netDownSpeed)}`:'—'}</span>
          </div>);
            default:
                return null;
        }
    };
    const formatBytes = (bytes: number) => {
        if (bytes < 1024)
            return `${bytes}B`;
        if (bytes < 1024 * 1024)
            return `${(bytes / 1024).toFixed(1)}K`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
    };
    // Music mode shows any time we have media info (playing or paused) and music mode setting is enabled
    const isMusicMode = mediaInfo.has_media && bloomMode === 'music' && settingsMusicModeEnabled;
    // Keep the clock and persistent indicators on one fixed rail while the shell expands.
    const compactHeaderWidth = clampIslandSize(Math.min(
        140 + (isMusicMode && settingsVisualizerEnabled && isPlaying ? 30 : 0)
        + (isMusicMode && settingsAlbumArtEnabled ? 30 : 0)
        + (islandDate === 'true' ? 90 : 0) + (islandBattery === 'true' ? 65 : 0) + (islandCpu === 'true' ? 65 : 0),
        viewport.width / scale - 24),36,{width:viewport.width/scale,height:viewport.height/scale},panelInsets).width;
    const headerStacksDate=islandDate==='true'&&compactHeaderWidth<340;
    const headerMinimal=compactHeaderWidth<150;
    const baseHeaderHeight=headerMinimal?60:headerStacksDate?44:36;
    const headerHeight=baseHeaderHeight+(aiLimits.codex||aiLimits.claude?24:0);
    const showReminder = !!reminder.active && !showNotifications && !calendarComposerOpen && bloomMode !== 'calendar' && bloomMode !== 'command-center';
    const extraLeft = statusWidgets.left.filter(id => !(id === 'cpu' && islandCpu === 'true'));
    const extraRight = statusWidgets.right.filter(id => !(id === 'battery' && islandBattery === 'true'));
    const overviewMetrics=[...new Set([...extraLeft,...extraRight])].filter(id=>['weather','cpu','ram','disk','net','battery'].includes(id)&&(id!=='weather'||(settingsWeatherEnabled&&temperature!==null)));
    const metricLabels:Record<string,string>={weather:tx('Погода','Weather'),cpu:'CPU',ram:tx('Память','Memory'),disk:tx('Свободное место','Free space'),net:tx('Сеть','Network'),battery:tx('Заряд','Charge')};
    const showSectionNav=(isHovered||bloomMode==='calendar')&&!showAiLimits&&!showNotifications&&!showReminder;
    const selectSection=(section:IslandSection)=>{setAiLimitsOpen(false);setIsHovered(true);if(section==='command-center')setControlPage('quick');setBloomMode(section);};
    const openControl=(page:SystemPage)=>{setControlPage(page);setBloomMode('command-center');setIsHovered(true);};
    // Calculate width dynamically based on enabled features
    const getDynamicWidth = () => {
        if (showAiLimits) return Math.min(420, viewport.width / scale - 24);
        if (showNotifications)
            return Math.min(440, viewport.width / scale - 24);
        if (isCalendarMode)
            return Math.max(300, Math.min(820, viewport.width / scale - 24));
        if (showReminder)
            return Math.min(400, viewport.width / scale - 24);
        if (bloomMode === 'command-center' && isHovered)
            return 390;
        if (bloomMode === 'status' && isHovered) {
            const totalWidgets = statusWidgets.left.length + statusWidgets.right.length;
            return Math.max(330, Math.min(250 + totalWidgets * 30, 390));
        }
        if (isMusicMode && isHovered)
            return mediaLayout === 'compact' ? 360 : 380;
        if ((showPowerPulse || showLowBatteryPulse || showUpdatePulse) && !isHovered)
            return 200;
        return compactHeaderWidth;
    };
    const getPanelHeight = () => {
        if (!isExpanded || !isVisible || isHidden) {
            return isImpacted ? 28.9 : 44.2;
        }
        if (showAiLimits) return Math.min(520, viewport.height / scale - 16);
        if (showNotifications)
            return Math.min(notifications.center ? 460 : (noticeContentHeight??(104 + notifications.popups.length * 205)) + 36, viewport.height / scale - 16);
        if (bloomMode === 'calendar')
            return Math.max(250, Math.min(650, viewport.height / scale - 16));
        if (showReminder)
            return Math.min(230, viewport.height / scale - 16);
        if (bloomMode === 'command-center')
            return isHovered ? 600 : 36;
        if (bloomMode === 'status')
            return isHovered ? 80 + Math.ceil(overviewMetrics.length/2)*78 + (showActions === 'true' ? 44 : 0) + (showUpcoming === 'true' ? 84 : 0) : 36;
        if (isMusicMode && isHovered) {
            const hasProgressBar = (mediaInfo.duration_ms ?? 0) > 0;
            let h = mediaLayout === 'compact' ? (hasProgressBar ? 132 : 116) : 120;
            if (mediaLayout === 'compact') {
                if (compactVolumeExpanded)
                    h += 36;
            }
            return h + 68;
        }
        return 36;
    };
    const getDynamicHeight=()=>{const height=getPanelHeight();return height>=36?height+headerHeight-36+(showSectionNav?40:0):height;};
    const isCalendarMode = bloomMode === 'calendar';
    const composerWasOpen = useRef(false);
    useEffect(() => {
        const closed = composerWasOpen.current && !calendarComposerOpen;
        composerWasOpen.current = calendarComposerOpen;
        if (closed && !bloomRef.current?.matches(':hover') && !(calendarPinned && notchMode !== 'hover')) {
            setIsHovered(false);
            setBloomMode(mediaInfo.has_media && isPlaying && settingsMusicCompactNotch ? 'music' : 'status');
        }
    }, [calendarComposerOpen, calendarPinned, notchMode, mediaInfo.has_media, isPlaying, settingsMusicCompactNotch]);

    // Close compact media player expansions when notch is unhovered or mode changes
    useEffect(() => {
        if (mediaLayout === 'compact') {
            setCompactVolumeExpanded(false);
        }
    }, [isHovered, mediaLayout, bloomMode]);
    return (<div className="screen" style={{ overflow: 'hidden' }}>
      {/* Screen Corners (Top) */}
      <AnimatePresence>
        {isVisible && settingsCornersEnabled && (<>
            <motion.div className="screen-corner top-left" initial={{ opacity: 0 }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(10px)" }}/>
            <motion.div className="screen-corner top-right" initial={{ opacity: 0 }} animate={{ opacity: 1, filter: "blur(0px)" }} exit={{ opacity: 0, filter: "blur(10px)" }}/>
          </>)}
      </AnimatePresence>

      <div className={`island-anchor island-anchor-${placement}`} style={{ zoom: scale, width: viewport.width/scale, height: viewport.height/scale, paddingLeft: panelInsets.left, paddingRight: panelInsets.right, paddingTop: panelInsets.top, paddingBottom: panelInsets.bottom }}>
        <motion.div ref={bloomRef} className={`bloom island-designed bloom-placement-${placement} ${isHovered ? 'expanded' : ''} ${isImpacted ? 'is-impacted' : ''}`} onMouseEnter={() => setIsNotchHovered(true)} onMouseLeave={() => setIsNotchHovered(false)} onWheel={handleWheel} initial={{ y: -44, width: 30.6, height: 44.2, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18, scaleX: 1, scaleY: 1, opacity: 0 }} animate={{
            y: placement.startsWith('top') ? (!isReady ? -44 : (isVisible ? (isHidden ? -100 : 0) : -150)) : 0,
            width: clampIslandSize(!isReady ? 34 : (isExpanded && isVisible && !isHidden ? Math.max(compactHeaderWidth,getDynamicWidth()) : (isImpacted ? 39.1 : 30.6)), getDynamicHeight(), {width:viewport.width/scale,height:viewport.height/scale}, panelInsets).width,
            height: !isReady ? 34 : clampIslandSize(getDynamicWidth(),getDynamicHeight(),{width:viewport.width/scale,height:viewport.height/scale},panelInsets).height,
            opacity: isVisible && !isHidden ? 1 : 0,
            scaleX: 1,
            scaleY: 1,
            borderTopLeftRadius: isImpacted ? 0 : 18,
            borderTopRightRadius: isImpacted ? 0 : 18,
            borderBottomLeftRadius: isCalendarMode ? 28 : 18,
            borderBottomRightRadius: isCalendarMode ? 28 : 18,
            filter: isVisible ? "blur(0px)" : "blur(8px)",
            pointerEvents: isVisible && !isHidden ? 'auto' : 'none'
        }} onClick={(e) => {
            e.stopPropagation();
        }} onHoverStart={() => {
            if(hoverExitTimer.current)clearTimeout(hoverExitTimer.current);
            setIsHovered(true);
            // Hover expands the current section; it never replaces a pending clock click.
        }} onHoverEnd={() => {
            setAiLimitsOpen(false);
            if (calendarComposerOpenRef.current || (calendarPinned && notchMode !== 'hover'))
                return;
            if(hoverExitTimer.current)clearTimeout(hoverExitTimer.current);
            hoverExitTimer.current=setTimeout(()=>{
            if (calendarComposerOpenRef.current) return;
            setIsHovered(false);
            const targetMode = mediaInfo.has_media && isPlaying && settingsMusicCompactNotch ? 'music' : 'status';
            if (bloomMode === 'music') {
                setBloomMode(targetMode);
            }
            else if (bloomMode === 'command-center' || bloomMode === 'calendar' || bloomMode === 'status') {
                setBloomMode(targetMode);
            }
            },140);
        }} style={{ originY: 0 }} transition={{
            default: {type:'tween',duration:reducedMotion ? 0 : eco ? .16 : .32,ease:[.22,1,.36,1]},
            opacity: {duration:reducedMotion?0:.14},
            filter: {duration:reducedMotion?0:.14}
        }}>

        <AnimatePresence>
          {!showNotifications && isMusicMode && settingsAmbienceEnabled && !eco && albumArtUrl && isHovered && !isCalendarMode && (<motion.div className="notch-ambient-glow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
              <AnimatePresence mode="wait">
                <motion.img key={albumArtUrl} src={albumArtUrl} alt="" draggable={false} initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1.8 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}/>
              </AnimatePresence>
            </motion.div>)}
        </AnimatePresence>
        <AnimatePresence mode="wait">
          {isExpanded && (<motion.div key="bloom-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }} style={{ width: '100%', height: '100%', display: 'flex', flexDirection: placement==='bottom'?'column-reverse':'column', alignItems: 'center', position: 'relative', borderRadius: 'inherit', overflow:'hidden' }}>
                  <motion.div key="standard-view-group" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} style={{ width: compactHeaderWidth - 24, maxWidth: '100%', flexShrink: 0, alignSelf: placement==='left'||placement==='top-left'?'flex-start':placement==='right'||placement==='top-right'?'flex-end':undefined }}>
                    <div className="main-row" style={{height:baseHeaderHeight}}>
                      <AnimatePresence mode="wait">
                        {(showPowerPulse || showLowBatteryPulse || showUpdatePulse) && !isHovered ? (showUpdatePulse ? (<motion.div key="update-pulse-view" initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }} className="power-pulse-content">
                              <GreenDownArrowIcon />
                              <span className="label" style={{ color: "#32D74B" }}>{tr("Update Available")}</span>
                            </motion.div>) : (<motion.div key="pulse-view" initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }} className="power-pulse-content">
                              {updateAvailable && <GreenDownArrowIcon />}
                              <BatteryIcon charging={isCharging} level={batteryLevel} threshold={lowBatteryThreshold}/>
                              <span className="label" style={{ color: showLowBatteryPulse ? "#FF453A" : "inherit" }}>
                                {showLowBatteryPulse ? tr("Low Battery") : (isCharging ? tr("Charging") : tr("On Battery"))} • {batteryLevel}%
                              </span>
                            </motion.div>)) : (<motion.div key="standard-view" className={`main-row-inner${headerStacksDate?' header-stacked-date':''}${compactHeaderWidth<240?' header-tight':''}${headerMinimal?' header-minimal':''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {/* Left: visualizer (music) or weather (command-center, calendar) */}
                            <div className="side-content left">
                              {islandCpu === 'true' && renderStatusWidget('cpu')}
                              {isMusicMode && settingsVisualizerEnabled && !eco ? (<AnimatePresence>
                                  {settingsVisualizerEnabled && (<motion.div key="visualizer" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }}>
                                      <Visualizer isPlaying={isPlaying}/>
                                    </motion.div>)}
                                </AnimatePresence>) : null}
                            </div>

                            {/* Center - Time (always visible) */}
                            <div className="time-center">
                              {islandDate === 'true' && <span className="island-date">{new Date().toLocaleDateString(locale(), {day:'numeric', month:'short'})}</span>}
                              <button type="button" className="time-flip-container" aria-label={tr("Открыть календарь")} aria-expanded={isCalendarMode} onClick={toggleCalendarMode}>
                                <AnimatePresence initial={false}>
                                  {isCompactTimerVisible || isTimerFinished ? (<motion.span key="timer" className={`time compact-timer ${isTimerFinished ? 'timer-finished' : ''}`} initial={{ rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 90, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 30 }}>
                                      {formatTimerTime(timerSeconds)}
                                    </motion.span>) : (<motion.span key="clock" className="time" initial={{ rotateX: -90, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }} exit={{ rotateX: 90, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 30 }}>
                                      {time}
                                    </motion.span>)}
                                </AnimatePresence>
                              </button>
                              {updateAvailable && showUpdateIndicator && <div className="update-dot"/>}
                            </div>

                            {/* Right: album art (music) or battery (command-center, calendar) */}
                            <div className="side-content right">
                              {islandBattery === 'true' && renderStatusWidget('battery')}
                              {isMusicMode && settingsAlbumArtEnabled ? (<AnimatePresence mode="wait">
                                  <motion.div key="album-art" className="album-art-glow-wrapper" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.8, filter: "blur(8px)" }} transition={{ duration: 0.12 }}>
                                    {albumArtUrl && settingsCompactGlowEnabled && (<img src={albumArtUrl} alt="" className="album-art-glow-bg" draggable={false}/>)}
                                    <button className={`album-art${isHovered ? ' album-art-large' : ''}${!isPlaying ? ' paused' : ''}`} onClick={(e) => {
                        e.stopPropagation();
                        togglePlayPause();
                    }} onDoubleClick={(e) => {
                        e.stopPropagation();
                        skipNext();
                    }} onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        skipPrevious();
                    }}>
                                      <div className="album-art-inner">
                                        <AnimatePresence mode="wait" initial={false}>
                                          {albumArtUrl ? (<motion.img key={`compact-art-${albumArtKey}`} src={albumArtUrl} alt={tr("Art")} draggable={false} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>) : (<motion.div key="compact-placeholder" className="album-art-placeholder" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }}>
                                              <MusicNoteIcon className="music-placeholder-svg-small"/>
                                          </motion.div>)}
                                      </AnimatePresence>
                                      <div className="album-art-overlay">
                                        <div className="control-icon-small">
                                          {isPlaying ? <PauseIcon /> : <PlayIcon />}
                                        </div>
                                      </div>
                                    </div>
                                  </button>
                                  </motion.div>
                                </AnimatePresence>) : null}
                            </div>
                          </motion.div>)}
                      </AnimatePresence>
                    </div>
                    {(aiLimits.codex||aiLimits.claude)&&<div className="ai-limits-rail">
                      {aiLimits.codex&&<LimitsChip limits={aiLimits.snapshot.codex} onOpen={openAiLimits}/>}
                      {aiLimits.claude&&<LimitsChip limits={aiLimits.snapshot.claude} onOpen={openAiLimits}/>}
                    </div>}
                  </motion.div>
              {showAiLimits ? <AiLimitsPanel model={aiLimits} onClose={()=>setAiLimitsOpen(false)}/> : <>
              {showSectionNav&&<IslandSections current={bloomMode} calendar={settingsCalendarEnabled} music={mediaInfo.has_media&&settingsMusicModeEnabled} onSelect={selectSection}/>}
              <AnimatePresence mode="wait">
                {!showNotifications && !showReminder && isHovered && isMusicMode && !isCalendarMode && (<motion.div key="expanded-music" className="expanded-music-container" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }} transition={{ type: "spring", stiffness: 500, damping: 30 }}>

                    {mediaLayout === 'compact' ? (<CompactMediaPlayer onOutput={()=>openControl('audio')} mediaInfo={mediaInfo} albumArtUrl={albumArtUrl} albumArtKey={albumArtKey} isPlaying={isPlaying} volume={volume} volumeExpanded={compactVolumeExpanded} onVolumeExpandedChange={setCompactVolumeExpanded} onTogglePlayPause={togglePlayPause} onVolumeChange={handleVolumeChange} prevFront={prevFront} prevBack={prevBack} nextFront={nextFront} nextBack={nextBack} onAnimatePrev={animatePrev} onAnimateNext={animateNext} onLayoutChange={(layout) => {
                        setMediaLayout(layout);
                        localStorage.setItem("bloom-media-layout", layout);
                        window.dispatchEvent(new CustomEvent("settings-changed", { detail: { key: "media-layout", value: layout } }));
                    }}/>) : (<div className="compact-premium-layout">
                      <div className="album-art-section">
                        <motion.div className="premium-album-art" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={(e) => {
                        e.stopPropagation();
                        setMediaLayout('compact');
                        localStorage.setItem("bloom-media-layout", "compact");
                        window.dispatchEvent(new CustomEvent("settings-changed", { detail: { key: "media-layout", value: "compact" } }));
                    }} style={{ cursor: 'pointer' }}>
                          <AnimatePresence mode="wait" initial={false}>
                            {albumArtUrl ? (<motion.img key={`art-${albumArtKey}`} src={albumArtUrl} alt={tr("Art")} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>) : (<motion.div key="placeholder" className="art-placeholder-mini" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} exit={{ rotateY: -90, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}>
                                <MusicNoteIcon size={32} className="music-placeholder-svg"/>
                              </motion.div>)}
                          </AnimatePresence>
                        </motion.div>
                      </div>

                      <div className="metadata-controls-section-middle">
                        <div className="track-header-row">
                          <div className="track-info-middle">
                            <TitleMarquee title={mediaInfo.title}/>
                            <span className="premium-artist">{mediaInfo.artist}</span>
                          </div>
                          <div className="header-visualizer-wrap">
                            <div className="header-visualizer">
                              <Visualizer isPlaying={isPlaying} bars={5} height={18}/>
                            </div>
                            <motion.button className="classic-audio-output-btn" onClick={(e) => { e.stopPropagation(); openControl('audio'); }} whileTap={{ scale: 0.9 }} title={tr("Audio Output")}>
                              <HeadphonesIcon size={20} style={{ opacity: 0.5 }}/>
                            </motion.button>
                          </div>
                        </div>

                        <div className="controls-row-sleek">
                          <motion.button className="sleek-btn previous-btn" onClick={(e) => { e.stopPropagation(); animatePrev(); }} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                            <div style={{ position: 'relative', width: 32, height: 16, overflow: 'hidden' }}>
                              <motion.div animate={prevBack} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SkipBackIcon size={32}/>
                              </motion.div>
                              <motion.div animate={prevFront} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SkipBackIcon size={32}/>
                              </motion.div>
                            </div>
                          </motion.button>

                          <motion.button className="sleek-btn play-pause-btn-floating" onClick={(e) => { e.stopPropagation(); togglePlayPause(); }} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.95 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.div key={isPlaying ? "pause" : "play"} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isPlaying ? <PauseIcon size={26}/> : <PlayIcon size={26}/>}
                              </motion.div>
                            </AnimatePresence>
                          </motion.button>

                          <motion.button className="sleek-btn next-btn" onClick={(e) => { e.stopPropagation(); animateNext(); }} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
                            <div style={{ position: 'relative', width: 32, height: 16, overflow: 'hidden' }}>
                              <motion.div animate={nextBack} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SkipForwardIcon size={32}/>
                              </motion.div>
                              <motion.div animate={nextFront} style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <SkipForwardIcon size={32}/>
                              </motion.div>
                            </div>
                          </motion.button>
                        </div>

                        <div className="volume-slider-container">
                          <VolumeLowIcon size={12} style={{ opacity: 0.5 }}/>
                          <div className="slider-track-premium">
                            <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => handleVolumeChange(parseFloat(e.target.value))} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} className="premium-slider"/>
                            <div className="slider-progress-fill" style={{ width: `${volume * 100}%` }}/>
                          </div>
                          <VolumeHighIcon size={14} style={{ opacity: 0.5 }}/>
                        </div>
                      </div>

                    </div>)}
                  </motion.div>)}
              </AnimatePresence>

              <AnimatePresence>{showNotifications && <NotificationPanel key="notifications" model={notifications} onContentHeight={setNoticeContentHeight}/>}</AnimatePresence>
              {!showNotifications && !showReminder && bloomMode === 'status' && isHovered && <section className="island-overview" aria-label={tx('Обзор','Overview')}><details className="island-profile"><summary>{tx('Профиль','Profile')}: {profile==='study'?tx('Учёба','Study'):profile==='relax'?tx('Отдых','Relax'):tx('Работа','Work')}</summary><ProfilePicker /></details>{!!overviewMetrics.length&&<div className="island-metrics">{overviewMetrics.map(id=><div className="island-metric" key={id} data-metric={id}><small>{metricLabels[id]}</small>{renderStatusWidget(id)}{(id==='ram'&&ramUsage!==null||id==='cpu'&&cpuUsage!==null)&&<meter min={0} max={100} value={(id==='ram'?ramUsage:cpuUsage)??0} aria-label={metricLabels[id]}/>}</div>)}</div>}{showActions === 'true' && <PersonalActions onAction={id=>{if(id==='wifi')openControl('wifi');else if(id==='sound')openControl('audio');else if(id==='battery')openControl('power');else if(id==='notifications')notifications.showCenter();else if(id==='settings')openSettingsWindow();}}/>}{showUpcoming === 'true' && <div className="island-schedule"><h2>{tx('Ближайшее событие','Up next')}</h2><UpcomingEvent events={calendar.events} onOpen={() => setBloomMode('calendar')}/></div>}</section>}
              {showReminder && <ReminderCard reminder={reminder}/>}
              {adjustmentError&&isMusicMode&&<p className="island-action-error" role="alert">{adjustmentError}</p>}
              {dnd.error && <p role="alert" className="notice-error">{tx("Не удалось сохранить режим «Не беспокоить».", dnd.error)}</p>}

              {!showNotifications&&!showReminder&&bloomMode==='command-center'&&isHovered&&<SystemControls key={controlPage} inline initialPage={controlPage} options={systemDefaults} design={parseDockDesign(islandDockRaw)} open onOpen={open=>{if(!open)setBloomMode('status');}} panelRef={islandControlsRef} eco={eco}/>}

              {/* Calendar & Timer Split View */}
              <AnimatePresence>
                {!showNotifications && settingsCalendarEnabled && isCalendarMode && (<CalendarPanel onComposerOpenChange={onCalendarComposerChange} model={calendar} date={calendarDate} onDate={setCalendarDate} pinned={calendarPinned} onPinned={() => setCalendarPinned(p => !p)} eco={eco} timer={<div className="timer-section-new">
                        <div className="timer-display-large">
                          <span className="timer-time-large">{formatTimerTime(timerSeconds)}</span>
                        </div>

                        <div className="timer-controls-new">
                          <button onClick={toggleTimer} className="timer-btn primary">
                            {isTimerRunning ? tr("Pause") : tr("Start")}
                          </button>
                          <button onClick={resetTimer} className="timer-btn secondary">{tr("Reset")}</button>
                        </div>

                        <div className="timer-presets-new">
                          {[5, 15, 25, 50].map(mins => (<button key={mins} onClick={() => startTimer(mins)} className="preset-btn-small">
                              {mins} {tr('мин')}
                            </button>))}
                        </div>
                      </div>}/>)}
              </AnimatePresence>

              </>}
            </motion.div>)}
        </AnimatePresence>

      </motion.div>
    </div>

    </div>);
}
export function Calendar() {
    const [date, setDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const wheel = useRef({ total: 0, last: -Infinity, previous: -Infinity });
    const navigate = (delta: number) => setDate(current => shiftMonth(current, delta));
    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
    const currentMonth = date.getMonth();
    const currentYear = date.getFullYear();
    const monthName = date.toLocaleString(locale(), { month: 'long' });
    const totalDays = daysInMonth(currentYear, currentMonth);
    const startDay = firstDayOfMonth(currentYear, currentMonth);
    const days = [];
    // Padding for start of month
    for (let i = 0; i < startDay; i++) {
        days.push(<div key={`empty-${i}`} className="calendar-day empty"/>);
    }
    // Actual days
    const today = new Date().getDate();
    const isCurrentMonth = new Date().getMonth() === currentMonth && new Date().getFullYear() === currentYear;
    for (let i = 1; i <= totalDays; i++) {
        days.push(<div key={i} className={`calendar-day ${isCurrentMonth && i === today ? 'today' : ''}`}>
        {i}
      </div>);
    }
    return (<div className="calendar-container" tabIndex={0} aria-label={tr("Календарь: стрелки влево и вправо переключают месяц")} onWheel={e => {
            e.stopPropagation();
            const result = wheelStep(wheel.current, e.deltaY, e.deltaMode, performance.now());
            wheel.current = result.state;
            if (result.step)
                navigate(result.step);
        }} onKeyDown={e => {
            if (e.target !== e.currentTarget)
                return;
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                navigate(e.key === 'ArrowLeft' ? -1 : 1);
            }
            if (e.key === 'Home') {
                e.preventDefault();
                setDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
            }
        }}>
      <div className="calendar-header">
        <button className="calendar-nav" aria-label={tr("Предыдущий месяц")} onClick={() => navigate(-1)}>‹</button>
        <button className="month-year calendar-nav" title={tr("Вернуться к текущему месяцу")} onClick={() => setDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>{monthName} {currentYear}</button>
        <button className="calendar-nav" aria-label={tr("Следующий месяц")} onClick={() => navigate(1)}>›</button>
      </div>
      <div className="calendar-grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (<div key={`${d}-${i}`} className="day-name">{d}</div>))}
        {days}
      </div>
    </div>);
}









export default App;
