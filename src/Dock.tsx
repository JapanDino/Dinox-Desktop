import {useLiveReducedMotion} from './hooks/useLiveReducedMotion';
import {contentDefaults,parseDockContent} from './dock/content';
import './dock/content.css';
import {tr} from './i18n/core';
import { useShellHeartbeat } from './hooks/useShellHeartbeat';
import { useBloomAppearance } from './appearance/BloomAppearance';
import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePersonalSetting } from './components/PersonalFeatures';
import { parseDockDesign, dockDefaults, dockVariables, bloomDockDesign } from './dockDesign';
import './components/DockDesign.css';
import { listen, emit } from '@tauri-apps/api/event';
import './Dock.css';
import { useDockAttention } from './hooks/useDockAttention';
import { useEcoMode } from './components/PersonalOptions';
import { initTheme } from './theme';
import { useSettingsSync } from './hooks/useSettingsSync';
import { SystemControls } from './system/SystemControls';
import { parseSystemOptions, systemDefaults, systemStripWidth } from './system/model';
interface AppInfo {
    name: string;
    path: string;
    icon: string | null;
    is_running: boolean;
    is_pinned?: boolean;
    hwnd?: number;
    executable?: string;
    all_hwnds?: [
        number,
        string
    ][];
}
// Stable identity for a dock item. Host processes (Edge/Chrome/ApplicationFrameHost)
// run every PWA, so their window title must be part of the identity — otherwise two
// PWAs running under the same browser collapse into a single dock item.
export function appIdentity(p: string, executable?: string, name?: string) {
    if (!p)
        return "";
    const normalized = p.toLowerCase().replace(/\\/g, '/');
    // Shell application ids (AUMIDs) and bare names are unique on their own.
    if (!normalized.includes('/'))
        return normalized;
    if (name && (normalized.includes('msedge.exe') || normalized.includes('chrome.exe') || normalized.includes('applicationframehost.exe'))) {
        return `${normalized}:${name.toLowerCase()}`;
    }
    if (executable)
        return `${normalized}:${executable.toLowerCase()}`;
    return normalized;
}
const itemKey = (app: AppInfo) => appIdentity(app.path, app.executable, app.name);
// Shell application ids (AUMIDs) identify one specific app; two different PWAs
// running in the same browser must never be matched by their shared exe name.
const isIdentifier = (p: string) => !p.includes('/') && !p.includes('\\');
// Stable module-level constants so object references never change between renders,
// preventing Framer Motion from re-triggering animations on every re-render.
const ITEM_ENTRY_TRANSITION = {
    opacity: { duration: 0.15, delay: 0.15 },
    scale: { type: 'spring' as const, stiffness: 400, damping: 25, delay: 0.15 }
};
const ITEM_INITIAL = { opacity: 0, scale: 0 };
const ITEM_ANIMATE = { opacity: 1, scale: 1 };
const ITEM_EXIT = { opacity: 0, scale: 0 };
const Dock = memo(function Dock() {
    useShellHeartbeat();
    useEffect(() => {
        return initTheme();
    }, []);
    const [designRaw] = usePersonalSetting('bloom-dock-design', JSON.stringify(dockDefaults));
    const unified = useBloomAppearance();
    const design = useMemo(() => unified ? bloomDockDesign(parseDockDesign(designRaw)) : parseDockDesign(designRaw), [designRaw, unified]);
    const [systemRaw] = usePersonalSetting('bloom-system-controls', JSON.stringify(systemDefaults));
    const systemOptions = useMemo(() => parseSystemOptions(systemRaw), [systemRaw]);
    const [systemOpen, setSystemOpen] = useState(false);
    const systemPanelRef = useRef<HTMLDivElement>(null);
    const [unread, setUnread] = useState(0);
    const [availableWidth, setAvailableWidth] = useState(window.innerWidth);
    useEffect(() => { const change = () => setAvailableWidth(window.innerWidth); window.addEventListener('resize', change); return () => window.removeEventListener('resize', change); }, []);
    useEffect(() => { const off = listen<number>('bloom-notification-count', e => setUnread(e.payload)); void emit('notification-count-request'); return () => { void off.then(f => f()); }; }, []);
    const [contentRaw]=usePersonalSetting('bloom-dock-content',JSON.stringify(contentDefaults));
    const content=parseDockContent(contentRaw);
    const pinLoad=content.mode==='personal'?'load_personal_pins':'load_pinned_apps';
    const pinSave=content.mode==='personal'?'save_personal_pins':'save_pinned_apps';
    const attention = useDockAttention();
    const eco = useEcoMode();
    const reducedMotion = useLiveReducedMotion() || eco;
    const [pinsLoaded,setPinsLoaded]=useState(false);
    const [pinnedApps, setPinnedApps] = useState<AppInfo[]>([]);
    const [activeApps, setActiveApps] = useState<AppInfo[]>([]);
    const iconsRef = useRef<Record<string, string>>({});
    const [, setIconsTick] = useState(0);
    const [dockMode, setDockMode] = useState(() => {
        const raw = localStorage.getItem("bloom-dock-mode") || "fixed";
        if (raw === "auto-hide")
            return "smart";
        return raw;
    });
    const [dockPreviewEnabled, setDockPreviewEnabled] = useState(() => localStorage.getItem("bloom-dock-preview-enabled") !== "false");
    const [dockIconOnly, setDockIconOnly] = useState(() => localStorage.getItem("bloom-dock-icon-only") === "true");
    const [previewData, setPreviewData] = useState<{
        id: string;
        previews: {
            hwnd: number;
            title: string;
            image: string;
        }[];
    } | null>(null);
    const [isDockHovered, setIsDockHovered] = useState(false);
    const [isEdgeHovered, setIsEdgeHovered] = useState(false);
    const [isOverlapped, setIsOverlapped] = useState(false);
    const [isVisible, setIsVisible] = useState(true);
    const [showAddPopup, setShowAddPopup] = useState(false);
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        app: AppInfo | null;
    } | null>(null);
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
    const [activeOrder, setActiveOrder] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [hoveredApp, setHoveredApp] = useState<string | null>(null);
    const [pressedApp, setPressedApp] = useState<string | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isImpacted, setIsImpacted] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [startupAnimating, setStartupAnimating] = useState(false);
    const [customIcons, setCustomIcons] = useState<Record<string, string>>({});
    const [toast, setToast] = useState<string | null>(null);
    const iconPickerTargetRef = useRef<string | null>(null);
    const toastTimerRef = useRef<any>(null);
    const dockRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(() => parseFloat(localStorage.getItem("bloom-scale") || "1.0"));
    const isCurrentlyHovered = isDockHovered || isEdgeHovered;
    const [interactionState, setInteractionState] = useState<'active' | 'grace' | 'none'>('none');
    const isAnyInteraction = isCurrentlyHovered || !!contextMenu || showAddPopup || systemOpen;
    useEffect(() => { if (!isVisible || !systemOptions.enabled)
        setSystemOpen(false); }, [isVisible, systemOptions.enabled]);
    const previewTimerRef = useRef<any>(null);
    const isPreviewHoveredRef = useRef(false);
    const hoveredAppRef = useRef<string | null>(null);
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
    const hasAttention = [...pinnedApps, ...activeApps].some(attention.has);
    const isHidden = !startupAnimating && !hasAttention && ((dockMode === 'smart' && isOverlapped && interactionState === 'none') ||
        (dockMode === 'peek' && interactionState === 'none'));
    useEffect(() => {
        let cleared = false;
        const checkVisibility = async (): Promise<boolean> => {
            try {
                const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                const visible = await getCurrentWebviewWindow().isVisible();
                if (visible) {
                    setStartupAnimating(true);
                    setIsReady(true);
                    setTimeout(() => setIsImpacted(true), 280);
                    setTimeout(() => setIsExpanded(true), 350);
                    setTimeout(() => setStartupAnimating(false), 1500);
                    return true;
                }
            }
            catch (_) { }
            return false;
        };
        // Keep polling until visible — no time cap, since the dock can be
        // enabled at runtime from settings after any delay.
        const interval = setInterval(async () => {
            if (cleared)
                return;
            if (await checkVisibility()) {
                clearInterval(interval);
                cleared = true;
            }
        }, 200);
        // Also attempt immediately
        checkVisibility().then(ok => { if (ok) {
            clearInterval(interval);
            cleared = true;
        } });
        return () => { clearInterval(interval); cleared = true; };
    }, []);
    useEffect(() => {
        const updateRect = () => {
            if (dockRef.current) {
                const rect = dockRef.current.getBoundingClientRect();
                const hasPreview = !!previewData;
                invoke('update_dock_rect', {
                    rect: {
                        x: Math.round(rect.x) - (hasPreview ? 500 : 0),
                        y: Math.round(rect.y) - (hasPreview ? 320 : 0),
                        width: Math.round(rect.width) + (hasPreview ? 1000 : 0),
                        height: Math.round(rect.height) + (hasPreview ? 320 : 0)
                    }
                }).catch(() => { });
            }
        };
        updateRect();
        window.addEventListener('resize', updateRect);
        const observer = new ResizeObserver(updateRect);
        if (dockRef.current)
            observer.observe(dockRef.current);
        return () => {
            window.removeEventListener('resize', updateRect);
            observer.disconnect();
        };
    }, [pinnedApps, activeApps, isHidden, previewData, scale, designRaw, availableWidth]);
    useEffect(() => {
        const init = async () => {
            const settings: any = await invoke('load_settings').catch(() => ({}));
            const getVal = (key: string, fallback: string | null = null) => {
                const val = settings[key];
                if (val !== undefined && val !== null)
                    return String(val);
                const local = localStorage.getItem(key);
                if (local !== null)
                    return local;
                return fallback;
            };
            const dMode = getVal("bloom-dock-mode", "fixed");
            if (dMode) {
                const mapped = dMode === "auto-hide" ? "smart" : dMode;
                setDockMode(mapped);
            }
            const preview = getVal("bloom-dock-preview-enabled", "true");
            setDockPreviewEnabled(preview === "true");
            const iconOnly = getVal("bloom-dock-icon-only", "false");
            setDockIconOnly(iconOnly === "true");
            const scaleVal = getVal("bloom-scale");
            if (scaleVal !== null)
                setScale(parseFloat(scaleVal));

            // Load custom icons
            try {
                const icons = await invoke<Record<string, string>>('get_custom_icons');
                setCustomIcons(icons);
            }
            catch (_) { }
        };
        init();
        const unlistenOverlap = listen<boolean>("dock-overlap", (event) => {
            setIsOverlapped(event.payload);
        });
        const unlistenEdgeHover = listen<boolean>("dock-edge-hover", (event) => {
            setIsEdgeHovered(event.payload);
        });
        const unlistenVisibility = listen<boolean>("visibility-change", (event) => {
            setIsVisible(event.payload);
        });
        return () => {
            unlistenOverlap.then(f => f());
            unlistenEdgeHover.then(f => f());
            unlistenVisibility.then(f => f());
        };
    }, []);
    useSettingsSync({
        "bloom-dock-mode": setDockMode,
        "bloom-dock-preview-enabled": setDockPreviewEnabled,
        "bloom-dock-icon-only": setDockIconOnly,
        "bloom-scale": setScale,
    });
    useEffect(() => {
        let pollSeq = 0;
        const poll = async () => {
            if (isDragging)
                return;
            const seq = ++pollSeq;
            const running = await invoke<AppInfo[]>('get_active_windows');
            // Ignore responses that arrive out of order: an older poll must never
            // overwrite a newer state, which would resurrect closed apps.
            if (seq !== pollSeq)
                return;
            setActiveApps(running);
            setActiveOrder(prev => {
                const newPaths = running.map(r => appIdentity(r.path, r.executable, r.name));
                const existingPaths = prev.filter(p => newPaths.includes(p));
                const addedPaths = newPaths.filter(p => !prev.includes(p));
                return [...existingPaths, ...addedPaths];
            });
            running.forEach(app => fetchIcon(app.path, app.name, app.hwnd));
        };
        poll();
        const unlistenWindowChange = listen("windows-changed", () => {
            poll();
        });
        // Safety net: even if a window event is missed, converge on the real state
        const interval = setInterval(poll, 10000);
        return () => {
            clearInterval(interval);
            unlistenWindowChange.then(f => f());
        };
    }, [isDragging]);
    const fetchIcon = async (path: string, name?: string, hwnd?: number, retryCount = 0) => {
        const isHost = path.toLowerCase().includes("msedge.exe") || path.toLowerCase().includes("chrome.exe") || path.toLowerCase().includes("applicationframehost.exe");
        const cacheKey = isHost && name ? `${path}:${name.toLowerCase()}` : (hwnd ? `${path}-${hwnd}` : path);
        if (iconsRef.current[cacheKey])
            return;
        try {
            const icon = await invoke<string | null>('get_app_icon', { path, name: name || null, hwnd: hwnd || null });
            if (icon) {
                iconsRef.current[cacheKey] = icon;
                if (!isHost)
                    iconsRef.current[path] = icon;
                setIconsTick(t => t + 1);
            }
            else if (retryCount < 3 && !hwnd) {
                setTimeout(() => fetchIcon(path, name, undefined, retryCount + 1), 3000 * (retryCount + 1));
            }
        }
        catch (e) {
            console.error(`Failed to fetch icon for ${path}:`, e);
            if (retryCount < 3 && !hwnd) {
                setTimeout(() => fetchIcon(path, name, undefined, retryCount + 1), 3000 * (retryCount + 1));
            }
        }
    };
    const handleClearIconCache = async () => {
        try {
            await invoke('clear_icon_cache');
            iconsRef.current = {};
            setIconsTick(t => t + 1);
            pinnedApps.forEach(app => fetchIcon(app.path));
        }
        catch (e) {
            console.error("Failed to clear icon cache:", e);
        }
    };
    const handleIconFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const target = iconPickerTargetRef.current;
        if (!file || !target)
            return;
        const reader = new FileReader();
        reader.onload = async () => {
            const dataUri = reader.result as string;
            try {
                const newIcon = await invoke<string>('set_custom_icon', {
                    cacheKey: target,
                    iconData: dataUri
                });
                setCustomIcons(prev => ({ ...prev, [target]: newIcon }));
            }
            catch (err) {
                const msg = typeof err === 'string' ? err : tr("Failed to set icon");
                if (toastTimerRef.current)
                    clearTimeout(toastTimerRef.current);
                setToast(msg);
                toastTimerRef.current = setTimeout(() => setToast(null), 4000);
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };
    const handleRemoveCustomIcon = async (app: AppInfo) => {
        try {
            await invoke('remove_custom_icon', { path: app.path, name: app.name || null });
            const isHost = app.path.toLowerCase().includes("msedge.exe") || app.path.toLowerCase().includes("chrome.exe") || app.path.toLowerCase().includes("applicationframehost.exe");
            const ck = isHost && app.name ? `${app.path}:${app.name.toLowerCase()}` : (app.hwnd ? `${app.path}-${app.hwnd}` : app.path);
            setCustomIcons(prev => {
                const next = { ...prev };
                delete next[ck];
                delete next[app.path];
                return next;
            });
            // Invalidate only this app's cached icon and re-fetch only this app
            delete iconsRef.current[ck];
            delete iconsRef.current[app.path];
            if (app.hwnd)
                delete iconsRef.current[`${app.path}-${app.hwnd}`];
            setIconsTick(t => t + 1);
            fetchIcon(app.path, app.name, app.hwnd);
        }
        catch (err) {
            console.error("Failed to remove custom icon:", err);
        }
    };
    const handleClosePreview = async (e: React.MouseEvent, hwnd: number) => {
        e.stopPropagation();
        try {
            await invoke('close_window', { hwnd });
            setPreviewData(prev => {
                if (!prev)
                    return null;
                const remaining = prev.previews.filter(p => p.hwnd !== hwnd);
                if (remaining.length === 0) {
                    setHoveredApp(null);
                    return null;
                }
                return { ...prev, previews: remaining };
            });
        }
        catch (err) {
            console.error("Failed to close window:", err);
        }
    };
    const handleAppClick = async (app: AppInfo) => {
        attention.clear(app);
        try {
            if (app.path === 'start') {
                await invoke('open_app', { appName: 'start' });
            }
            else if (app.hwnd) {
                await invoke('focus_window', { hwnd: app.hwnd });
            }
            else {
                await invoke('open_app', { appName: app.path });
            }
        }
        catch (e) {
            console.error(`Failed to interact with ${app.name}:`, e);
            setToast(tr("Не удалось открыть приложение"));
        }
    };
    useEffect(()=>{
        let live=true;setPinsLoaded(false);
        const reload=()=>invoke<AppInfo[]>(pinLoad).then(pins=>{if(live){setPinsLoaded(true);setPinnedApps(pins.map(a=>({...a,is_pinned:true})));pins.forEach(a=>fetchIcon(a.path));}}).catch(()=>{if(live){setPinsLoaded(false);setPinnedApps([]);setToast(tr('Не удалось загрузить закрепления'));}});
        void reload();const stop=listen<string>('dock-pins-changed',e=>{if(e.payload===content.mode)void reload();});
        return()=>{live=false;void stop.then(f=>f());};
    },[pinLoad,content.mode]);
    const togglePin = async (app: AppInfo) => {
        if(app.path==='start')return;
        if(!pinsLoaded){setToast(tr('Не удалось загрузить закрепления'));return;}
        let newPinned;
        if (app.is_pinned) {
            newPinned = pinnedApps.filter(a => a.path !== app.path);
        }
        else {
            if (pinnedApps.find(a => a.path === app.path))
                return;
            newPinned = [...pinnedApps, { ...app, is_pinned: true, is_running: false, hwnd: undefined }];
            fetchIcon(app.path, app.name);
        }
        try{await invoke(pinSave, { apps: newPinned });setPinnedApps(newPinned);closeMenu();}
        catch{setToast(tr('Не удалось сохранить закрепления'));}
    };
    const menuRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const handleContextMenu = (e: React.MouseEvent, app: AppInfo | null) => {
        e.stopPropagation();
        e.preventDefault();
        setSystemOpen(false);
        setContextMenu({ x: e.clientX, y: e.clientY, app });
    };
    const closeMenu = () => {
        setSystemOpen(false);
        setContextMenu(null);
        setActiveSubmenu(null);
        invoke('set_menu_open', { open: false, rect: null }).catch(() => { });
    };
    const closePopup = () => {
        setShowAddPopup(false);
        invoke('set_menu_open', { open: false, rect: null }).catch(() => { });
    };
    useEffect(() => {
        const update = () => {
            let open = false;
            let rect = null;
            if (contextMenu && menuRef.current) {
                const r = menuRef.current.getBoundingClientRect();
                rect = {
                    x: Math.round(r.x),
                    y: Math.round(r.y),
                    width: Math.round(r.width + (activeSubmenu ? 160 : 0)),
                    height: Math.round(r.height)
                };
                open = true;
            }
            else if (showAddPopup && popupRef.current) {
                const r = popupRef.current.getBoundingClientRect();
                rect = {
                    x: Math.round(r.x),
                    y: Math.round(r.y),
                    width: Math.round(r.width),
                    height: Math.round(r.height)
                };
                open = true;
            }
            if (systemOpen && systemPanelRef.current) {
                const r = systemPanelRef.current.getBoundingClientRect();
                rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
                open = true;
            }
            invoke('set_menu_open', { open, rect }).catch(() => { });
        };
        update();
        window.addEventListener('system-panel-bounds', update);
        window.addEventListener('resize', update);
        const observer = new ResizeObserver(update);
        if (systemPanelRef.current)
            observer.observe(systemPanelRef.current);
        return () => { window.removeEventListener('system-panel-bounds', update); window.removeEventListener('resize', update); observer.disconnect(); };
    }, [contextMenu, showAddPopup, pinnedApps, activeApps, activeSubmenu, scale, systemOpen]);
    const dockItems = useMemo(() => {
        const runningMap = new Map();
        activeApps.forEach(a => {
            const id = appIdentity(a.path, a.executable, a.name);
            if (!runningMap.has(id))
                runningMap.set(id, a);
        });
        const matchedRunningKeys = new Set<string>();
        const findRunningApp = (p: AppInfo) => {
            // 1. Try exact match by identity
            const id = appIdentity(p.path, p.executable, p.name);
            let running = runningMap.get(id);
            if (running) {
                matchedRunningKeys.add(appIdentity(running.path, running.executable, running.name));
                return running;
            }
            // 2. Try match by path (without executable)
            const pathId = appIdentity(p.path);
            running = runningMap.get(pathId);
            if (running) {
                matchedRunningKeys.add(appIdentity(running.path, running.executable, running.name));
                return running;
            }
            // 3. Try fallback match by executable name if defined
            if (p.executable) {
                const targetExe = p.executable.toLowerCase();
                const found = activeApps.find(a => !isIdentifier(a.path) && a.executable?.toLowerCase() === targetExe);
                if (found) {
                    matchedRunningKeys.add(appIdentity(found.path, found.executable, found.name));
                    return found;
                }
            }
            // 4. Try fallback match by path's file name (e.g., if path is "msedge" and running app's executable is "msedge.exe")
            const pinFilename = p.path.split('/').pop()?.split('\\').pop()?.toLowerCase() || "";
            if (pinFilename) {
                const found = activeApps.find(a => {
                    if (isIdentifier(a.path))
                        return false;
                    const runExe = a.executable?.toLowerCase() || a.path.split('/').pop()?.split('\\').pop()?.toLowerCase() || "";
                    return runExe === pinFilename || runExe === `${pinFilename}.exe` || `${runExe}.exe` === pinFilename;
                });
                if (found) {
                    matchedRunningKeys.add(appIdentity(found.path, found.executable, found.name));
                    return found;
                }
            }
            return undefined;
        };
        const pinned: AppInfo[] = [
            { get name() {
                    return tr("Start");
                }, path: 'start', icon: null, is_running: false, is_pinned: true, hwnd: undefined, all_hwnds: undefined, executable: undefined },
            ...pinnedApps.map(p => {
                const running = findRunningApp(p);
                return { ...p, is_running: !!running, hwnd: running?.hwnd, all_hwnds: running?.all_hwnds };
            })
        ];
        const unpinned = activeOrder
            .map(id => activeApps.find(a => appIdentity(a.path, a.executable, a.name) === id))
            .filter((a): a is AppInfo => !!a && !matchedRunningKeys.has(appIdentity(a.path, a.executable, a.name)));
        return [...pinned, ...(content.mode==='classic'||content.showRunning?unpinned:[])];
    }, [pinnedApps, activeApps, activeOrder,content.mode,content.showRunning]);
    const startItem = useMemo(() => dockItems.find(i => i.path === 'start') as AppInfo, [dockItems]);
    const [dockPage,setDockPage]=useState(0);
    const appsOnly=dockItems.filter(i=>i.path!=='start');
    const reservedWidth=systemStripWidth(systemOptions)+(systemOptions.enabled?design.gap+10:0)+design.padding*2+30+(design.showBell?design.size+design.gap:0)+(design.showStart?design.size+design.gap:0);
    const capacity=Math.max(1,Math.floor(((availableWidth-32)/Math.min(scale,1)-reservedWidth-76)/(design.size+design.gap)));
    const pages=Math.max(1,Math.ceil(appsOnly.length/capacity));
    const currentPage=Math.min(dockPage,pages-1);
    const visibleApps=appsOnly.slice(currentPage*capacity,(currentPage+1)*capacity);
    const pinnedItems=visibleApps.filter(i=>i.is_pinned),unpinnedItems=visibleApps.filter(i=>!i.is_pinned);
    const attentionKey=appsOnly.filter(attention.has).map(a=>a.path).join('|');
    useEffect(()=>{const index=appsOnly.findIndex(attention.has);if(index>=0)setDockPage(Math.floor(index/capacity));},[attentionKey,capacity]);
    useEffect(()=>{setDockPage(p=>Math.min(p,pages-1));},[pages]);
    const handleReorder = (newPaths: string[]) => {
        const oldPaths = pinnedApps.map(p => p.path);
        if (JSON.stringify(newPaths) !== JSON.stringify(oldPaths)) {
            // Reordering one visible page must never drop pins on other pages.
            const remaining=[...newPaths];
            const reordered=pinnedApps.map(p=>newPaths.includes(p.path)?pinnedApps.find(a=>a.path===remaining.shift())!:p);
            setPinnedApps(reordered);
        }
    };
    const handleDragEnd = () => {
        setIsDragging(false);
        setPressedApp(null);
        if(!pinsLoaded)return;
        invoke(pinSave, { apps: pinnedApps }).catch(async()=>{setToast(tr('Не удалось сохранить закрепления'));try{const pins=await invoke<AppInfo[]>(pinLoad);setPinnedApps(pins.map(a=>({...a,is_pinned:true})));}catch{}});
    };
    useEffect(() => {
        // Only report true dock-window hover, not the edge-hover from Rust,
        // to avoid a feedback loop that keeps the dock open.
        invoke('set_dock_hovered', { hovered: isDockHovered }).catch(() => { });
    }, [isDockHovered]);
    useEffect(() => {
        const handleBlur = () => {
            closeMenu();
            closePopup();
        };
        window.addEventListener('blur', handleBlur);
        return () => window.removeEventListener('blur', handleBlur);
    }, []);
    useEffect(() => {
        if (previewTimerRef.current)
            clearTimeout(previewTimerRef.current);
        isPreviewHoveredRef.current = false;
        hoveredAppRef.current = hoveredApp;
        if (!hoveredApp) {
            const timer = setTimeout(() => setPreviewData(null), 100);
            return () => clearTimeout(timer);
        }
        if (hoveredApp && !isDragging) {
            const app = dockItems.find(a => itemKey(a) === hoveredApp);
            if (app && app.is_running) {
                const hwndsToCapture = app.all_hwnds || (app.hwnd ? [[app.hwnd, app.name]] : []);
                previewTimerRef.current = setTimeout(async () => {
                    try {
                        const results = await Promise.all(hwndsToCapture.map(async ([hwnd, title]) => {
                            try {
                                const res = await invoke<[
                                    string,
                                    number
                                ] | null>("capture_window_thumbnail", { hwnd, maxWidth: 320, maxHeight: 200 });
                                if (res) {
                                    const [image, lastFocused] = res;
                                    return { hwnd, title, image, lastFocused };
                                }
                            }
                            catch { }
                            return null;
                        }));
                        const captured = results
                            .filter((r): r is {
                            hwnd: number;
                            title: string;
                            image: string;
                            lastFocused: number;
                        } => r !== null)
                            .sort((a, b) => b.lastFocused - a.lastFocused)
                            .map(({ hwnd, title, image }) => ({ hwnd, title, image }));
                        const currentHovered = hoveredAppRef.current;
                        if (captured.length > 0 && currentHovered === itemKey(app)) {
                            setPreviewData({ id: itemKey(app), previews: captured });
                        }
                        else if (currentHovered === itemKey(app)) {
                            setPreviewData(null);
                        }
                    }
                    catch (e) {
                        console.error("Failed to capture thumbnails:", e);
                        setPreviewData(null);
                    }
                }, 300);
            }
            else {
                setPreviewData(null);
            }
        }
        return () => {
            if (previewTimerRef.current)
                clearTimeout(previewTimerRef.current);
        };
    }, [hoveredApp, isDragging, dockItems]);
    const desiredWidth = (visibleApps.length + 1 + (design.showBell ? 1 : 0) - (design.showStart ? 0 : 1)) * (design.size + design.gap) + design.padding * 2 + 30 + systemStripWidth(systemOptions) + (systemOptions.enabled ? design.gap + 10 : 0);
    const displayScale = Math.min(scale, (availableWidth - 32) / Math.max(100, desiredWidth+(pages>1?76:0)));
    const iconVariants = {
        attention: { y: reducedMotion ? 0 : [0, -18, 0, -11, 0], scale: 1, transition: { duration: 1.2, repeat: Math.max(0, Math.ceil(attention.duration / 1200) - 1), ease: "easeInOut" as const } },
        idle: { y: 0, scale: 1 },
        hover: { y: reducedMotion || design.hover !== 'lift' ? 0 : -6, scale: reducedMotion || design.hover !== 'zoom' ? 1 : 1.18 },
        drag: { y: -10, scale: 1.1, opacity: 0.8 },
        tap: { scale: 0.95 }
    };
    return (<div className={`dock-container dock-personal indicator-${design.indicator} ${design.labels ? 'with-labels' : ''} ${isDragging ? 'dragging' : ''}`} style={dockVariables(design) as React.CSSProperties} onClick={closeMenu}>
      <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: design.align === 'left' ? 'flex-start' : design.align === 'right' ? 'flex-end' : 'center', alignItems: 'flex-end', padding: '0 16px', boxSizing: 'border-box' }}>
        <motion.div ref={dockRef} 
    // CSS transforms do not trigger ResizeObserver: refresh native hit bounds
    // after alignment/scale animations so newly positioned icons stay clickable.
    onLayoutAnimationComplete={() => window.dispatchEvent(new Event('resize'))} onAnimationComplete={() => window.dispatchEvent(new Event('resize'))} layout className={`dock ${isExpanded && !isHidden ? 'dock-expanded' : ''} ${isImpacted && !isExpanded && !isHidden ? 'dock-impacted' : ''} ${dockIconOnly ? 'dock-icon-only' : ''}`} onMouseEnter={() => setIsDockHovered(true)} onMouseLeave={() => { setIsDockHovered(false); setHoveredApp(null); setPressedApp(null); }} initial={{ y: -800, opacity: 1, width: 34, height: 34, borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomLeftRadius: 17, borderBottomRightRadius: 17 }} animate={{
            y: !isReady ? -800 : (isVisible ? (isHidden ? 100 : 0) : 150),
            width: isExpanded && !isHidden && isVisible ? 'auto' : 34,
            height: isExpanded && !isHidden && isVisible ? 'auto' : 34,
            borderTopLeftRadius: (isImpacted || isExpanded) && !isHidden && isVisible ? design.radius : 17,
            borderTopRightRadius: (isImpacted || isExpanded) && !isHidden && isVisible ? design.radius : 17,
            borderBottomLeftRadius: (isImpacted || isExpanded) && !isHidden && isVisible ? design.radius : 17,
            borderBottomRightRadius: (isImpacted || isExpanded) && !isHidden && isVisible ? design.radius : 17,
            opacity: isVisible ? 1 : 0,
            scale: displayScale,
        }} transition={{
            y: { type: "spring", stiffness: 400, damping: 35, mass: 0.8 },
            width: { type: "spring", stiffness: 250, damping: 22, mass: 0.8 },
            height: { type: "spring", stiffness: 250, damping: 22, mass: 0.8 },
            layout: isDragging ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 25 },
            borderTopLeftRadius: { type: "spring", stiffness: 500, damping: 30 },
            borderTopRightRadius: { type: "spring", stiffness: 500, damping: 30 },
            borderBottomLeftRadius: { type: "spring", stiffness: 500, damping: 30 },
            borderBottomRightRadius: { type: "spring", stiffness: 500, damping: 30 },
            opacity: { type: "tween", duration: 0.2 },
            scale: { duration: 0 },
        }} style={{ originX: design.align === 'left' ? 0 : design.align === 'right' ? 1 : .5, originY: 1, minWidth: 34, flexShrink: 0 }} onContextMenu={(e) => handleContextMenu(e, null)}>
        <AnimatePresence>
          {isExpanded && (<motion.div key="dock-content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="dock-reorder-container">
              {startItem && design.showStart && (<motion.div initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ opacity: { duration: 0.15, delay: 0.15 }, scale: { type: "spring", stiffness: 400, damping: 25, delay: 0.15 } }} className="dock-icon-wrapper" onContextMenu={(e) => handleContextMenu(e, startItem)} onMouseEnter={() => setHoveredApp(itemKey(startItem))} onMouseLeave={() => { setHoveredApp(null); setPressedApp(null); }}>
                  {(!dockPreviewEnabled || (dockPreviewEnabled && hoveredApp === itemKey(startItem))) && (<div className="tooltip">{startItem.name}</div>)}
                  <motion.div className="dock-icon" variants={iconVariants} role="button" tabIndex={0} aria-label={startItem.name} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void handleAppClick(startItem);}}} animate={pressedApp === itemKey(startItem) ? "tap" : (hoveredApp === itemKey(startItem) ? "hover" : "idle")} onPointerDown={() => setPressedApp(itemKey(startItem))} onPointerUp={() => setPressedApp(null)} onPointerCancel={() => setPressedApp(null)} onClick={(e) => {
                    e.stopPropagation();
                    handleAppClick(startItem);
                }}>
                    <img src="/dinox.svg" alt="Dinox" className="bloom-icon-img" draggable={false}/>
                  </motion.div>
                </motion.div>)}
              
              {design.separators && design.showStart && pinnedItems.length > 0 && <span className="dock-divider"/>}
              {pages>1&&<button className="dock-page-button" aria-label={tr('Предыдущие приложения')} disabled={currentPage===0} onClick={e=>{e.stopPropagation();setDockPage(currentPage-1);}}><ChevronLeft size={17}/></button>}
              <Reorder.Group as="div" axis="x" values={pinnedItems.map(i => i.path)} onReorder={handleReorder} className="dock-reorder-group">
                {pinnedItems.map((app) => (<Reorder.Item as="div" key={app.path} value={app.path} style={{ position: 'relative' }} onDragStart={() => { setIsDragging(true); setHoveredApp(null); setPressedApp(null); }} onDragEnd={handleDragEnd} onContextMenu={(e) => handleContextMenu(e, app)} onClick={(e) => {
                    e.stopPropagation();
                    if (!isDragging)
                        handleAppClick(app);
                }}>
                    <motion.div className="dock-icon-wrapper" initial={ITEM_INITIAL} animate={ITEM_ANIMATE} exit={ITEM_EXIT} transition={ITEM_ENTRY_TRANSITION} onMouseEnter={() => setHoveredApp(itemKey(app))} onMouseLeave={() => { if (!isPreviewHoveredRef.current) {
                setHoveredApp(null);
                setPressedApp(null);
            } }}>
                <AnimatePresence>
                  {dockPreviewEnabled && previewData && previewData.id === itemKey(app) && hoveredApp === itemKey(app) && (<motion.div className={`preview-tooltip ${previewData.previews.length > 1 ? 'multi' : ''}`} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }} onMouseEnter={() => { isPreviewHoveredRef.current = true; }} onMouseLeave={() => { isPreviewHoveredRef.current = false; setHoveredApp(null); setPressedApp(null); }}>
                      <div className="preview-items">
                        {previewData.previews.map((prev, idx) => (<div key={prev.hwnd} className="preview-item" onClick={() => invoke('focus_window', { hwnd: prev.hwnd })}>
                            <img src={prev.image} alt={tr("Preview {0}", idx)}/>
                            <div className="preview-label">{prev.title || app.name}</div>
                            <button className="preview-close-btn" onClick={(e) => handleClosePreview(e, prev.hwnd)} title={tr("Close Window")}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                              </svg>
                            </button>
                          </div>))}
                      </div>
                    </motion.div>)}
                </AnimatePresence>
                
                {/* Fallback to text tooltip if previews are disabled, app isn't running, or preview failed to load */}
                {(!dockPreviewEnabled || (dockPreviewEnabled && hoveredApp === itemKey(app) && !previewData)) && (<div className="tooltip">{app.name}</div>)}
                <motion.div className="dock-icon" data-attention={attention.has(app)||undefined} variants={iconVariants} role="button" tabIndex={0} aria-label={app.name} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void handleAppClick(app);}}} animate={pressedApp === itemKey(app) ? "tap" : (isDragging && !app.is_pinned ? "idle" : (hoveredApp === itemKey(app) && !isDragging ? "hover" : (!isDragging && attention.has(app) ? "attention" : "idle")))} whileDrag="drag" onPointerDown={() => setPressedApp(itemKey(app))} onPointerUp={() => setPressedApp(null)} onPointerCancel={() => setPressedApp(null)}>
                  {(() => {
                    const isHost = app.path.toLowerCase().includes("msedge.exe") || app.path.toLowerCase().includes("chrome.exe") || app.path.toLowerCase().includes("applicationframehost.exe");
                    const cacheKey = isHost ? `${app.path}:${app.name.toLowerCase()}` : (app.hwnd ? `${app.path}-${app.hwnd}` : app.path);
                    const icon = customIcons[cacheKey] || customIcons[app.path] || iconsRef.current[cacheKey] || iconsRef.current[app.path] || app.icon;
                    const isBloomOrSettings = app.name.toLowerCase() === 'settings' ||
                        app.name.toLowerCase() === 'bloom' ||
                        app.path.toLowerCase().includes('bloom.exe');
                    return icon ? (<img src={icon} alt={app.name} className={isBloomOrSettings ? "bloom-icon-img" : ""} draggable={false}/>) : (<div className="fallback-icon">{app.name[0]}</div>);
                })()}
                </motion.div>
                  {attention.has(app)&&<span className="dock-attention-dot" aria-label={tr("Новое уведомление")}/>}
                  {app.is_running && <div className="active-indicator"/>}{design.labels && <span className="dock-label">{app.name}</span>}
                    </motion.div>
                  </Reorder.Item>))}
              </Reorder.Group>

              {design.separators && pinnedItems.length > 0 && unpinnedItems.length > 0 && <span className="dock-divider"/>}
              {unpinnedItems.map((app) => (<motion.div key={app.path} layout initial={{ opacity: 0, scale: 0 }} animate={{
                    opacity: 1,
                    scale: 1,
                    transition: { opacity: { duration: 0.15, delay: 0.15 }, scale: { type: "spring", stiffness: 400, damping: 25, delay: 0.15 } }
                }} exit={{ opacity: 0, scale: 0, transition: { duration: 0.12 } }} className="dock-icon-wrapper" onContextMenu={(e) => handleContextMenu(e, app)} onMouseEnter={() => setHoveredApp(itemKey(app))} onMouseLeave={() => { if (!isPreviewHoveredRef.current) {
                setHoveredApp(null);
                setPressedApp(null);
            } }} onClick={(e) => {
                    e.stopPropagation();
                    handleAppClick(app);
                }}>
                  <AnimatePresence>
                    {dockPreviewEnabled && previewData && previewData.id === itemKey(app) && hoveredApp === itemKey(app) && (<motion.div className={`preview-tooltip ${previewData.previews.length > 1 ? 'multi' : ''}`} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }} onMouseEnter={() => { isPreviewHoveredRef.current = true; }} onMouseLeave={() => { isPreviewHoveredRef.current = false; setHoveredApp(null); setPressedApp(null); }}>
                        <div className="preview-items">
                          {previewData.previews.map((prev, idx) => (<div key={prev.hwnd} className="preview-item" onClick={() => invoke('focus_window', { hwnd: prev.hwnd })}>
                              <img src={prev.image} alt={tr("Preview {0}", idx)}/>
                              <div className="preview-label">{prev.title || app.name}</div>
                              <button className="preview-close-btn" onClick={(e) => handleClosePreview(e, prev.hwnd)} title={tr("Close Window")}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                  <line x1="18" y1="6" x2="6" y2="18"></line>
                                  <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                              </button>
                            </div>))}
                        </div>
                      </motion.div>)}
                  </AnimatePresence>
                  {(!dockPreviewEnabled || (dockPreviewEnabled && hoveredApp === itemKey(app) && !previewData)) && (<div className="tooltip">{app.name}</div>)}
                  <motion.div className="dock-icon" data-attention={attention.has(app)||undefined} variants={iconVariants} role="button" tabIndex={0} aria-label={app.name} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void handleAppClick(app);}}} animate={pressedApp === itemKey(app) ? "tap" : (hoveredApp === itemKey(app) && !isDragging ? "hover" : (!isDragging && attention.has(app) ? "attention" : "idle"))} onPointerDown={() => setPressedApp(itemKey(app))} onPointerUp={() => setPressedApp(null)} onPointerCancel={() => setPressedApp(null)}>
                    {(() => {
                    const isHost = app.path.toLowerCase().includes("msedge.exe") || app.path.toLowerCase().includes("chrome.exe") || app.path.toLowerCase().includes("applicationframehost.exe");
                    const cacheKey = isHost ? `${app.path}:${app.name.toLowerCase()}` : (app.hwnd ? `${app.path}-${app.hwnd}` : app.path);
                    const icon = customIcons[cacheKey] || customIcons[app.path] || iconsRef.current[cacheKey] || iconsRef.current[app.path] || app.icon;
                    const isBloomOrSettings = app.name.toLowerCase() === 'settings' || app.name.toLowerCase() === 'bloom' || app.path.toLowerCase().includes('bloom.exe');
                    return icon ? (<img src={icon} alt={app.name} className={isBloomOrSettings ? "bloom-icon-img" : ""} draggable={false}/>) : (<div className="fallback-icon">{app.name[0]}</div>);
                })()}
                  </motion.div>
                  {attention.has(app)&&<span className="dock-attention-dot" aria-label={tr("Новое уведомление")}/>}
                  {app.is_running && <div className="active-indicator"/>}{design.labels && <span className="dock-label">{app.name}</span>}
                </motion.div>))}
              {pages>1&&<button className="dock-page-button" aria-label={tr('Следующие приложения')} title={tr('Страница {0} из {1}',currentPage+1,pages)} disabled={currentPage===pages-1} onClick={e=>{e.stopPropagation();setDockPage(currentPage+1);}}><ChevronRight size={17}/><small>{currentPage+1}/{pages}</small></button>}
              {design.showBell && <><span className="dock-divider"/><button className="dock-icon dock-bell" aria-label={tr("Уведомления Dinox")} title={tr("Уведомления Dinox")} onClick={e => { e.stopPropagation(); void invoke('open_bloom_notifications'); }}><Bell />{unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}</button></>}
              {systemOptions.enabled && <><span className="dock-divider"/><SystemControls options={systemOptions} design={design} open={systemOpen} onOpen={open => { setSystemOpen(open); if (open) {
            setContextMenu(null);
            setShowAddPopup(false);
            setPreviewData(null);
        } }} panelRef={systemPanelRef} eco={eco}/></>}
            </motion.div>)}
        </AnimatePresence>
      </motion.div>
    </div>

      {contextMenu && (<div ref={menuRef} className="context-menu" style={{
                left: Math.max(8, Math.min(contextMenu.x,availableWidth-260*scale)),
                top: Math.max(8, contextMenu.y - (contextMenu.app ? 280 : 120) * scale),
                zoom: scale
            }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.app ? (<>
              {contextMenu.app.path !== 'start' && <div className="menu-item" onClick={() => {
                        attention.toggleMuted(contextMenu.app!).catch(() => setToast(tr("Не удалось сохранить настройку")));
                        closeMenu();
                    }}>{attention.isMuted(contextMenu.app) ? tr("Включить внимание для приложения") : tr("Не подпрыгивать для приложения")}</div>}
              <div className="menu-item" onClick={() => togglePin(contextMenu.app!)}>
                {contextMenu.app.is_pinned ? tr("Unpin from Dock") : tr("Pin to Dock")}
              </div>
              {contextMenu.app.is_pinned && contextMenu.app.path !== 'start' && (<>
                  <div className="menu-divider"/>
                  <div className="menu-item" onClick={() => {
                        const isHost = contextMenu.app!.path.toLowerCase().includes("msedge.exe") || contextMenu.app!.path.toLowerCase().includes("chrome.exe") || contextMenu.app!.path.toLowerCase().includes("applicationframehost.exe");
                        const ck = isHost ? `${contextMenu.app!.path}:${contextMenu.app!.name.toLowerCase()}` : contextMenu.app!.path;
                        iconPickerTargetRef.current = ck;
                        closeMenu();
                        setTimeout(() => {
                            document.getElementById('icon-file-input')?.click();
                        }, 50);
                    }}>{tr("Change Icon...")}</div>
                  {(() => {
                        const isHost = contextMenu.app!.path.toLowerCase().includes("msedge.exe") || contextMenu.app!.path.toLowerCase().includes("chrome.exe") || contextMenu.app!.path.toLowerCase().includes("applicationframehost.exe");
                        const ck = isHost ? `${contextMenu.app!.path}:${contextMenu.app!.name.toLowerCase()}` : contextMenu.app!.path;
                        return customIcons[ck] ? (<div className="menu-item" onClick={() => {
                                handleRemoveCustomIcon(contextMenu.app!);
                                closeMenu();
                            }}>{tr("Reset Icon")}</div>) : null;
                    })()}
                </>)}
              <div className="menu-divider"/>
              <div className="menu-item" onClick={() => { setShowAddPopup(true); closeMenu(); }}>{tr("Add App to Dock...")}</div>
              <div className="menu-item has-submenu" onMouseEnter={() => setActiveSubmenu('bloom')} onMouseLeave={() => setActiveSubmenu(null)}>{tr("Dinox Options")}<span className="submenu-arrow">▶</span>
                <div className="submenu">
                  <div className="menu-item" onClick={() => { invoke('open_settings_window'); closeMenu(); }}>{tr("Open Settings")}</div>
                  <div className="menu-item" onClick={() => invoke('restart_bloom')}>{tr("Restart Dinox")}</div>
                  <div className="menu-item" onClick={() => { handleClearIconCache(); closeMenu(); }}>{tr("Clear Icon Cache")}</div>
                  <div className="menu-divider"/>
                  <div className="menu-item quit" onClick={() => invoke('quit_bloom')}>{tr("Quit Dinox")}</div>
                </div>
              </div>
              {contextMenu.app.is_running && (<>
                  <div className="menu-divider"/>
                  <div className="menu-item quit" onClick={async () => {
                        if (contextMenu.app?.hwnd) {
                            await invoke('close_window', { hwnd: contextMenu.app.hwnd });
                            closeMenu();
                        }
                    }}>{tr("Quit")}{contextMenu.app.name}
                  </div>
                </>)}
            </>) : (<>
              <div className="menu-item" onClick={() => { setShowAddPopup(true); closeMenu(); }}>{tr("Add App to Dock...")}</div>
              <div className="menu-item has-submenu" onMouseEnter={() => setActiveSubmenu('bloom')} onMouseLeave={() => setActiveSubmenu(null)}>{tr("Dinox Options")}<span className="submenu-arrow">▶</span>
                <div className="submenu">
                  <div className="menu-item" onClick={() => { invoke('open_settings_window'); closeMenu(); }}>{tr("Open Settings")}</div>
                  <div className="menu-item" onClick={() => invoke('restart_bloom')}>{tr("Restart Dinox")}</div>
                  <div className="menu-item" onClick={() => { handleClearIconCache(); closeMenu(); }}>{tr("Clear Icon Cache")}</div>
                  <div className="menu-divider"/>
                  <div className="menu-item quit" onClick={() => invoke('quit_bloom')}>{tr("Quit Dinox")}</div>
                </div>
              </div>
            </>)}
        </div>)}

      <input id="icon-file-input" type="file" accept=".png,.ico,.jpg,.jpeg,.svg,.bmp" style={{ display: 'none' }} onChange={handleIconFileSelect}/>

      <AnimatePresence>
        {showAddPopup && (<AddAppPopup containerRef={popupRef} onClose={closePopup} onAdd={(app: AppInfo) => { togglePin(app); closePopup(); }} scale={scale}/>)}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (<motion.div className="dock-toast" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.2 }} style={{ zoom: scale }}>
            {toast}
          </motion.div>)}
      </AnimatePresence>
    </div>);
});
function AddAppPopup({ onClose, onAdd, containerRef, scale }: {
    onClose: () => void;
    onAdd: (app: AppInfo) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    scale: number;
}) {
    const [apps, setApps] = useState<AppInfo[]>([]);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [listIcons, setListIcons] = useState<Record<string, string>>({});
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 150);
        return () => clearTimeout(timer);
    }, [search]);
    useEffect(() => {
        inputRef.current?.focus();
    }, []);
    // Reset selection when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [debouncedSearch]);
    // Scroll selected item into view
    useEffect(() => {
        if (!listRef.current)
            return;
        const row = listRef.current.children[selectedIndex] as HTMLElement | undefined;
        if (row)
            row.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);
    useEffect(() => {
        const load = async () => {
            try {
                const res = await invoke<AppInfo[]>('get_installed_apps');
                setApps(res.sort((a, b) => a.name.localeCompare(b.name)));
            }
            finally {
                setLoading(false);
            }
        };
        load();
    }, []);
    const filtered = useMemo(() => {
        const s = debouncedSearch.toLowerCase();
        if (!s)
            return apps.slice(0, 20);
        return apps.filter(a => a.name.toLowerCase().includes(s)).slice(0, 50);
    }, [apps, debouncedSearch]);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(i => Math.max(i - 1, 0));
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered[selectedIndex]) {
                    onAdd(filtered[selectedIndex]);
                }
            }
        };
        const handleMouseDown = (e: MouseEvent) => {
            const popup = containerRef.current;
            if (popup && !popup.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleBlur = () => onClose();
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('mousedown', handleMouseDown, true);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('mousedown', handleMouseDown, true);
        };
    }, [onClose, containerRef, filtered, selectedIndex, onAdd]);
    useEffect(() => {
        let active = true;
        const fetchVisibleIcons = async () => {
            let batch: Record<string, string> = {};
            let count = 0;
            for (const app of filtered) {
                if (!active)
                    break;
                if (!listIcons[app.path]) {
                    await new Promise(r => setTimeout(r, 20));
                    try {
                        const icon = await invoke<string | null>('get_app_icon', { path: app.path });
                        if (icon && active) {
                            batch[app.path] = icon;
                            count++;
                            if (count >= 6) {
                                setListIcons(prev => ({ ...prev, ...batch }));
                                batch = {};
                                count = 0;
                            }
                        }
                    }
                    catch (err) {
                        console.error(err);
                    }
                }
            }
            if (active && count > 0)
                setListIcons(prev => ({ ...prev, ...batch }));
        };
        fetchVisibleIcons();
        return () => { active = false; };
    }, [filtered]);
    return (<div className="add-popup-anchor" style={{ zoom: scale }}>
      <motion.div ref={containerRef} className="add-app-popup" style={{ transformOrigin: "bottom center" }} initial={{ opacity: 0, scaleY: 0 }} animate={{ opacity: 1, scaleY: 1 }} exit={{ opacity: 0, scaleY: 0 }} transition={{
            opacity: { duration: 0.15 },
            scaleY: { type: "spring", stiffness: 500, damping: 30, mass: 0.8 },
        }} onClick={(e) => e.stopPropagation()}>
        <div className="popup-search-row">
          <svg className="popup-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input ref={inputRef} type="text" className="popup-search-input" placeholder={tr("Search apps...")} value={search} onChange={(e) => setSearch(e.target.value)}/>
        </div>
        <div className="popup-apps-scroll" ref={listRef}>
          {loading ? (<div className="popup-loading">
              <div className="popup-spinner"/>
            </div>) : filtered.length > 0 ? (filtered.map((app, idx) => {
            const icon = listIcons[app.path];
            return (<div key={app.path} className={`popup-app-row${idx === selectedIndex ? ' selected' : ''}`} onClick={() => onAdd(app)} onMouseEnter={() => setSelectedIndex(idx)}>
                  <div className="popup-app-icon">
                    {icon ? (<img src={icon} alt="" draggable={false}/>) : (<span className="popup-app-initial">{app.name[0]}</span>)}
                  </div>
                  <span className="popup-app-name">{app.name}</span>
                  <span className="popup-app-pin">+</span>
                </div>);
        })) : (<div className="popup-empty">{tr("No results")}</div>)}
        </div>
      </motion.div>
    </div>);
}
export default Dock;

