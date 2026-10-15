import {useLiveReducedMotion} from './hooks/useLiveReducedMotion';
import {useFileDragBridge} from './dock/useFileDragBridge';
import {useMagnification} from './dock/useMagnification';
import {contentDefaults,parseDockContent} from './dock/content';
import {DockContentSettings} from './dock/DockContentSettings';
import {dockEdge,reorderVisible,moveTo,clampPopup} from './dock/geometry';
import {appIdentity,mergeWindowGroups} from './dock/identity';
export {appIdentity} from './dock/identity';
import './dock/content.css';
import {tr} from './i18n/core';
import {tx} from './desktopText';
import { useShellHeartbeat } from './hooks/useShellHeartbeat';
import { useBloomAppearance } from './appearance/BloomAppearance';
import { useState, useEffect, useLayoutEffect, useMemo, useRef, memo } from 'react';
import { motion, AnimatePresence, Reorder, MotionConfig } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { Bell, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
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
    const edge=dockEdge(design.edge),vertical=edge!=='bottom';
    const [systemRaw] = usePersonalSetting('bloom-system-controls', JSON.stringify(systemDefaults));
    const systemOptions = useMemo(() => parseSystemOptions(systemRaw), [systemRaw]);
    const [systemOpen, setSystemOpen] = useState(false);
    const [searchError,setSearchError]=useState('');
    const systemPanelRef = useRef<HTMLDivElement>(null);
    const [unread, setUnread] = useState(0);
    const [availableWidth, setAvailableWidth] = useState(window.innerWidth);
    const [availableHeight,setAvailableHeight]=useState(window.innerHeight);
    const [naturalDockLength,setNaturalDockLength]=useState(0);
    const [workInsets,setWorkInsets]=useState({left:0,top:0,right:0,bottom:0});
    useEffect(()=>{
        const update=(value:typeof workInsets)=>{if(value&&Object.values(value).every(v=>Number.isFinite(v)&&v>=0))setWorkInsets(value);};
        const off=listen<typeof workInsets>('dock-workarea-insets',e=>update(e.payload));
        void invoke<{dockInsets?:typeof workInsets}>('shell_status').then(s=>{if(s.dockInsets)update(s.dockInsets);}).catch(()=>{});
        return()=>{void off.then(f=>f());};
    },[]);
    useEffect(() => { const change = () => {setAvailableWidth(window.innerWidth);setAvailableHeight(window.innerHeight);}; window.addEventListener('resize', change); const off=listen('display-layout-changed',()=>window.dispatchEvent(new Event('resize'))); return () => {window.removeEventListener('resize', change);void off.then(f=>f());}; }, []);
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
    const fileDrag=useFileDragBridge(isDragging,message=>{if(toastTimerRef.current)clearTimeout(toastTimerRef.current);setToast(message);toastTimerRef.current=setTimeout(()=>setToast(null),8000);},setHoveredApp);
    useEffect(()=>()=>{if(toastTimerRef.current)clearTimeout(toastTimerRef.current);},[]);
    const magnify=useMagnification(dockRef,design.hover==='magnify'&&!reducedMotion&&!isDragging&&!fileDrag.active,vertical,design.size,design.gap);
    const workspaceLayoutRef=useRef('');
    const menuTrigger=useRef<HTMLElement|null>(null);
    const [scale, setScale] = useState(() => parseFloat(localStorage.getItem("bloom-scale") || "1.0"));
    const isCurrentlyHovered = isDockHovered || isEdgeHovered;
    const [interactionState, setInteractionState] = useState<'active' | 'grace' | 'none'>('none');
    const isAnyInteraction = isCurrentlyHovered || fileDrag.active || !!contextMenu || showAddPopup || systemOpen;
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
                const natural=vertical?dockRef.current.offsetHeight:dockRef.current.offsetWidth;
                setNaturalDockLength(old=>Math.abs(old-natural)>1?natural:old);
                const rect = dockRef.current.getBoundingClientRect();
                if(isReady&&isExpanded&&!startupAnimating&&rect.width>0&&rect.height>0){
                    // Report the fitted dock, not its requested size at high zoom.
                    // Both webviews use desktop CSS pixels; the island converts
                    // this measurement to its own logical zoom coordinates.
                    const ratio=rect.width/Math.max(1,dockRef.current.offsetWidth);
                    const value={edge,thickness:(vertical?rect.width:rect.height)+(design.offset+12)*ratio+workInsets[edge],scale,width:window.innerWidth,height:window.innerHeight};
                    const key=JSON.stringify(value);
                    if(key!==workspaceLayoutRef.current){workspaceLayoutRef.current=key;void emit('dock-workspace-layout',value).catch(()=>{});}
                }
                const regions=[rect,...Array.from(document.querySelectorAll<HTMLElement>('.preview-tooltip')).map(el=>el.getBoundingClientRect())];
                const x=Math.max(0,Math.min(...regions.map(r=>r.left))),y=Math.max(0,Math.min(...regions.map(r=>r.top)));
                const right=Math.min(window.innerWidth,Math.max(...regions.map(r=>r.right))),bottom=Math.min(window.innerHeight,Math.max(...regions.map(r=>r.bottom)));
                invoke('update_dock_rect', {
                    rect: {
                        x: Math.round(x),y:Math.round(y),width:Math.max(0,Math.round(right-x)),height:Math.max(0,Math.round(bottom-y))
                    }
                }).catch(() => { });
            }
        };
        updateRect();
        window.addEventListener('resize', updateRect);
        const request=listen('dock-workspace-layout-request',()=>{workspaceLayoutRef.current='';updateRect();});
        const observer = new ResizeObserver(updateRect);
        if (dockRef.current)
            observer.observe(dockRef.current);
        return () => {
            window.removeEventListener('resize', updateRect);
            void request.then(off=>off());
            observer.disconnect();
        };
    }, [pinnedApps, activeApps, isHidden, previewData, scale, designRaw, availableWidth,availableHeight,workInsets.left,workInsets.top,workInsets.right,workInsets.bottom,isReady,isExpanded,startupAnimating]);
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
            const running = mergeWindowGroups(await invoke<AppInfo[]>('get_active_windows'));
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
                await invoke('focus_window', { hwnd: app.hwnd, toggle:true });
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
    const activatePreview = async (hwnd:number) => {
        try {await invoke('focus_window',{hwnd,toggle:false});setHoveredApp(null);setPreviewData(null);}
        catch {setToast(tx('Не удалось активировать окно. Возможно, оно уже закрыто.','Could not activate the window. It may have already closed.'));}
    };
    useEffect(()=>{
        let live=true;setPinsLoaded(false);
        const reload=()=>invoke<AppInfo[]>(pinLoad).then(pins=>{if(live){setPinsLoaded(true);setPinnedApps(mergeWindowGroups(pins).map(a=>({...a,is_pinned:true})));pins.forEach(a=>fetchIcon(a.path));}}).catch(()=>{if(live){setPinsLoaded(false);setPinnedApps([]);setToast(tr('Не удалось загрузить закрепления'));}});
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
        menuTrigger.current=(e.currentTarget as HTMLElement).querySelector<HTMLElement>('[role=button]')||(document.activeElement as HTMLElement);
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
        menuTrigger.current?.focus();
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
    const systemLength=vertical?(systemOptions.enabled?(Number(systemOptions.layout)+Number(systemOptions.tray)+1)*(design.size+4):0):systemStripWidth(systemOptions);
    const availableLength=vertical?availableHeight-workInsets.top-workInsets.bottom:availableWidth-workInsets.left-workInsets.right;
    const reservedWidth=systemLength+(systemOptions.enabled?design.gap+10:0)+design.padding*2+30+(design.showBell?design.size+design.gap:0)+(design.showStart?design.size+design.gap:0)+(design.showSearch?design.size+design.gap:0);
    const capacity=Math.max(1,Math.floor(((availableLength-32)/Math.max(scale,.1)-reservedWidth-76)/(design.size+design.gap)));
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
            setPinnedApps(reorderVisible(pinnedApps,newPaths));
        }
    };
    const handleDragEnd = () => {
        setIsDragging(false);
        setPressedApp(null);
        if(!pinsLoaded)return;
        invoke(pinSave, { apps: pinnedApps }).catch(async()=>{setToast(tr('Не удалось сохранить закрепления'));try{const pins=await invoke<AppInfo[]>(pinLoad);setPinnedApps(mergeWindowGroups(pins).map(a=>({...a,is_pinned:true})));}catch{}});
    };
    useLayoutEffect(()=>{if(contextMenu)menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();},[contextMenu]);
    useEffect(()=>{if(!toast)return;const id=setTimeout(()=>setToast(null),5000);return()=>clearTimeout(id);},[toast]);
    // Preview placement follows the actual icon and available screen, including
    // side docks and scaled UIs. Restrict the native hit region to visible bounds.
    useEffect(()=>{const id=requestAnimationFrame(()=>{
        document.querySelectorAll<HTMLElement>('.preview-tooltip').forEach(el=>{
            const parent=el.closest('.dock-icon-wrapper')?.getBoundingClientRect();if(!parent)return;
            const factor=displayScaleRef.current,box=el.getBoundingClientRect();
            const desired={x:edge==='left'?parent.right+12:edge==='right'?parent.left-box.width-12:parent.left+(parent.width-box.width)/2,y:vertical?parent.top+(parent.height-box.height)/2:parent.top-box.height-12};
            const fit=clampPopup(desired,{width:box.width,height:box.height},{width:window.innerWidth,height:window.innerHeight});
            el.style.setProperty('transform','none','important');el.style.bottom='auto';el.style.right='auto';el.style.left=`${(fit.x-parent.left)/factor}px`;el.style.top=`${(fit.y-parent.top)/factor}px`;
        });window.dispatchEvent(new Event('resize'));
    });return()=>cancelAnimationFrame(id);},[previewData,hoveredApp,edge,vertical,availableWidth,availableHeight]);
    useEffect(() => {
        // Only report true dock-window hover, not the edge-hover from Rust,
        // to avoid a feedback loop that keeps the dock open.
        invoke('set_dock_hovered', { hovered: isDockHovered || fileDrag.active }).catch(() => { });
    }, [isDockHovered,fileDrag.active]);
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
    const desiredWidth = (visibleApps.length + 1 + (design.showBell ? 1 : 0) + (design.showSearch ? 1 : 0) - (design.showStart ? 0 : 1)) * (design.size + design.gap) + design.padding * 2 + 30 + systemLength + (systemOptions.enabled ? design.gap + 10 : 0);
    const displayScale = Math.max(.3,Math.min(scale, (availableLength - 32) / Math.max(100, naturalDockLength,desiredWidth+(pages>1?76:0))));
    const displayScaleRef=useRef(displayScale);displayScaleRef.current=displayScale;
    const movePinned=async(app:AppInfo,delta:number)=>{const from=pinnedApps.findIndex(a=>a.path===app.path);const to=from+delta;const next=moveTo(pinnedApps,from,to);if(next===pinnedApps)return;try{await invoke(pinSave,{apps:next});setPinnedApps(next);setDockPage(Math.floor(to/capacity));}catch{setToast(tr('Не удалось сохранить закрепления'));}};
    const iconKeys=(e:React.KeyboardEvent,app:AppInfo)=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();e.stopPropagation();menuTrigger.current=e.currentTarget as HTMLElement;const r=e.currentTarget.getBoundingClientRect();setContextMenu({x:r.left,y:r.top,app});return;}if(e.altKey&&app.is_pinned&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();e.stopPropagation();void movePinned(app,['ArrowLeft','ArrowUp'].includes(e.key)?-1:1);return;}if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void handleAppClick(app);}};
    const iconVariants = {
        attention: { y: reducedMotion ? 0 : [0, -18, 0, -11, 0], scale: 1, transition: { duration: reducedMotion?0:1.2, repeat: reducedMotion?0:Math.max(0, Math.ceil(attention.duration / 1200) - 1), ease: "easeInOut" as const } },
        idle: { y: 0, scale: 1 },
        hover: { y: reducedMotion || design.hover !== 'lift' ? 0 : -6, scale: reducedMotion || design.hover !== 'zoom' ? 1 : 1.18 },
        drag: { y: reducedMotion?0:-10, scale: reducedMotion?1:1.1, opacity: reducedMotion?1:.8 },
        tap: { scale: reducedMotion?1:.95 }
    };
    return (<MotionConfig reducedMotion={reducedMotion?'always':'user'} transition={reducedMotion?{duration:0}:undefined}><div data-dock-edge={edge} className={`dock-container dock-personal hover-${design.hover} ${fileDrag.active?'file-drag':''} dock-edge-${edge} ${vertical?'dock-vertical':''} indicator-${design.indicator} ${design.labels ? 'with-labels' : ''} ${isDragging ? 'dragging' : ''}`} style={{...dockVariables(design),paddingLeft:workInsets.left,paddingTop:workInsets.top,paddingRight:workInsets.right,paddingBottom:workInsets.bottom} as React.CSSProperties} onClick={closeMenu}>
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection:vertical?'column':'row', justifyContent: design.align === 'left' ? 'flex-start' : design.align === 'right' ? 'flex-end' : 'center', alignItems: vertical?(edge==='left'?'flex-start':'flex-end'):'flex-end', padding:vertical?'16px 0':'0 16px', boxSizing: 'border-box' }}>
        <motion.div ref={dockRef} 
    // CSS transforms do not trigger ResizeObserver: refresh native hit bounds
    // after alignment/scale animations so newly positioned icons stay clickable.
    onLayoutAnimationComplete={() => window.dispatchEvent(new Event('resize'))} onAnimationComplete={() => window.dispatchEvent(new Event('resize'))} layout onPointerMove={magnify.move} onPointerLeave={magnify.reset} onDragEnter={fileDrag.over} onDragOver={fileDrag.over} onDragLeave={fileDrag.leave} onDrop={fileDrag.drop} className={`dock ${isExpanded && !isHidden ? 'dock-expanded' : ''} ${isImpacted && !isExpanded && !isHidden ? 'dock-impacted' : ''} ${dockIconOnly ? 'dock-icon-only' : ''}`} onMouseEnter={() => setIsDockHovered(true)} onMouseLeave={() => { setIsDockHovered(false); setHoveredApp(null); setPressedApp(null); }} initial={{ y: -800, opacity: 1, width: 34, height: 34, borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomLeftRadius: 17, borderBottomRightRadius: 17 }} animate={{
            x:vertical?(isReady&&isVisible&&!isHidden?0:edge==='left'?-150:150):0,
            y:vertical?0:(!isReady ? 150 : (isVisible ? (isHidden ? 100 : 0) : 150)),
            width: isExpanded && !isHidden && isVisible ? 'auto' : 34,
            height: isExpanded && !isHidden && isVisible ? 'auto' : 34,
            borderTopLeftRadius: (isImpacted || isExpanded) && !isHidden && isVisible ? design.radius : 17,
            borderTopRightRadius: (isImpacted || isExpanded) && !isHidden && isVisible ? design.radius : 17,
            borderBottomLeftRadius: (isImpacted || isExpanded) && !isHidden && isVisible ? design.radius : 17,
            borderBottomRightRadius: (isImpacted || isExpanded) && !isHidden && isVisible ? design.radius : 17,
            opacity: isVisible ? 1 : 0,
            scale: displayScale,
        }} transition={reducedMotion?{duration:0}:{
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
        }} style={{ originX: vertical?(edge==='left'?0:1):design.align === 'left' ? 0 : design.align === 'right' ? 1 : .5, originY: vertical?(design.align==='left'?0:design.align==='right'?1:.5):1, minWidth: 34, flexShrink: 0 }} onContextMenu={(e) => handleContextMenu(e, null)}>
        <AnimatePresence>
          {isExpanded && (<motion.div key="dock-content" initial={reducedMotion?false:{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion?0:.15 }} className="dock-reorder-container">
              {startItem && design.showStart && (<motion.div initial={reducedMotion?false:{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={reducedMotion?{duration:0}:{ opacity: { duration: 0.15, delay: 0.15 }, scale: { type: "spring", stiffness: 400, damping: 25, delay: 0.15 } }} className="dock-icon-wrapper" data-drag-app={itemKey(startItem)} onContextMenu={(e) => handleContextMenu(e, startItem)} onMouseEnter={() => setHoveredApp(itemKey(startItem))} onMouseLeave={() => { setHoveredApp(null); setPressedApp(null); }}>
                  {(!dockPreviewEnabled || (dockPreviewEnabled && hoveredApp === itemKey(startItem))) && (<div className="tooltip">{startItem.name}</div>)}
                  <motion.div className="dock-icon" variants={iconVariants} role="button" tabIndex={0} aria-label={startItem.name} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();void handleAppClick(startItem);}}} animate={pressedApp === itemKey(startItem) ? "tap" : (hoveredApp === itemKey(startItem) ? "hover" : "idle")} onPointerDown={() => setPressedApp(itemKey(startItem))} onPointerUp={() => setPressedApp(null)} onPointerCancel={() => setPressedApp(null)} onClick={(e) => {
                    e.stopPropagation();
                    handleAppClick(startItem);
                }}>
                    <img src="/dinox.svg" alt="Dinox" className="bloom-icon-img" draggable={false}/>
                  </motion.div>
                </motion.div>)}
              
              {design.separators && design.showStart && pinnedItems.length > 0 && <span className="dock-divider"/>}
              {searchError&&<span role="alert" className="tooltip">{searchError}</span>}
              {design.showSearch&&<button className="dock-search-button" title={tx('Поиск Dinox','Dinox search')} aria-label={tx('Поиск Dinox','Dinox search')} onClick={e=>{e.stopPropagation();setSearchError('');void invoke('launcher_show').catch(()=>setSearchError(tx('Не удалось открыть поиск','Could not open search')));}}><Search size={Math.round(design.size*.52)}/></button>}
              {pages>1&&<button className="dock-page-button" aria-label={tr('Предыдущие приложения')} disabled={currentPage===0} onClick={e=>{e.stopPropagation();setDockPage(currentPage-1);}}><ChevronLeft size={17}/></button>}
              <Reorder.Group as="div" axis={vertical?'y':'x'} values={pinnedItems.map(i => i.path)} onReorder={handleReorder} className="dock-reorder-group">
                {pinnedItems.map((app) => (<Reorder.Item as="div" key={app.path} value={app.path} style={{ position: 'relative' }} onDragStart={() => { setIsDragging(true); setHoveredApp(null); setPressedApp(null); }} onDragEnd={handleDragEnd} onContextMenu={(e) => handleContextMenu(e, app)} onClick={(e) => {
                    e.stopPropagation();
                    if (!isDragging)
                        handleAppClick(app);
                }}>
                    <motion.div className="dock-icon-wrapper" data-drag-app={itemKey(app)} initial={reducedMotion?false:ITEM_INITIAL} animate={ITEM_ANIMATE} exit={ITEM_EXIT} transition={reducedMotion?{duration:0}:ITEM_ENTRY_TRANSITION} onMouseEnter={() => setHoveredApp(itemKey(app))} onMouseLeave={() => { if (!isPreviewHoveredRef.current) {
                setHoveredApp(null);
                setPressedApp(null);
            } }}>
                <AnimatePresence>
                  {dockPreviewEnabled && previewData && previewData.id === itemKey(app) && hoveredApp === itemKey(app) && (<motion.div className={`preview-tooltip ${previewData.previews.length > 1 ? 'multi' : ''}`} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: reducedMotion?0:.15 }} onMouseEnter={() => { isPreviewHoveredRef.current = true; }} onMouseLeave={() => { isPreviewHoveredRef.current = false; setHoveredApp(null); setPressedApp(null); }}>
                      <div className="preview-items">
                        {previewData.previews.map((prev, idx) => (<div key={prev.hwnd} className="preview-item" data-drag-window={prev.hwnd} role="button" tabIndex={0} aria-label={prev.title||app.name} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();void activatePreview(prev.hwnd);}}} onClick={e=>{e.stopPropagation();void activatePreview(prev.hwnd);}}>
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
                <motion.div className="dock-icon" data-attention={attention.has(app)||undefined} variants={iconVariants} role="button" tabIndex={0} aria-label={app.name} data-drag-window={app.is_running&&(app.all_hwnds?.length??0)<=1?(app.hwnd??app.all_hwnds?.[0]?.[0]):undefined} aria-description={app.is_pinned?tx('Alt и стрелки — изменить порядок; Shift + F10 — действия','Alt and arrows change order; Shift + F10 opens actions'):tx('Shift + F10 — действия','Shift + F10 opens actions')} onKeyDown={e=>iconKeys(e,app)} animate={pressedApp === itemKey(app) ? "tap" : (isDragging && !app.is_pinned ? "idle" : (hoveredApp === itemKey(app) && !isDragging && !fileDrag.active ? "hover" : (!isDragging && !fileDrag.active && attention.has(app) ? "attention" : "idle")))} whileDrag="drag" onPointerDown={() => setPressedApp(itemKey(app))} onPointerUp={() => setPressedApp(null)} onPointerCancel={() => setPressedApp(null)}>
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
              {unpinnedItems.map((app) => (<motion.div key={itemKey(app)} layout initial={reducedMotion?false:{ opacity: 0, scale: 0 }} animate={{
                    opacity: 1,
                    scale: 1,
                    transition: reducedMotion?{duration:0}:{ opacity: { duration: 0.15, delay: 0.15 }, scale: { type: "spring", stiffness: 400, damping: 25, delay: 0.15 } }
                }} exit={{ opacity: 0, scale: reducedMotion?1:0, transition: { duration: reducedMotion?0:.12 } }} className="dock-icon-wrapper" data-drag-app={itemKey(app)} onContextMenu={(e) => handleContextMenu(e, app)} onMouseEnter={() => setHoveredApp(itemKey(app))} onMouseLeave={() => { if (!isPreviewHoveredRef.current) {
                setHoveredApp(null);
                setPressedApp(null);
            } }} onClick={(e) => {
                    e.stopPropagation();
                    handleAppClick(app);
                }}>
                  <AnimatePresence>
                    {dockPreviewEnabled && previewData && previewData.id === itemKey(app) && hoveredApp === itemKey(app) && (<motion.div className={`preview-tooltip ${previewData.previews.length > 1 ? 'multi' : ''}`} initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: reducedMotion?0:.15 }} onMouseEnter={() => { isPreviewHoveredRef.current = true; }} onMouseLeave={() => { isPreviewHoveredRef.current = false; setHoveredApp(null); setPressedApp(null); }}>
                        <div className="preview-items">
                          {previewData.previews.map((prev, idx) => (<div key={prev.hwnd} className="preview-item" data-drag-window={prev.hwnd} role="button" tabIndex={0} aria-label={prev.title||app.name} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();void activatePreview(prev.hwnd);}}} onClick={e=>{e.stopPropagation();void activatePreview(prev.hwnd);}}>
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
                  <motion.div className="dock-icon" data-attention={attention.has(app)||undefined} variants={iconVariants} role="button" tabIndex={0} aria-label={app.name} data-drag-window={app.is_running&&(app.all_hwnds?.length??0)<=1?(app.hwnd??app.all_hwnds?.[0]?.[0]):undefined} aria-description={app.is_pinned?tx('Alt и стрелки — изменить порядок; Shift + F10 — действия','Alt and arrows change order; Shift + F10 opens actions'):tx('Shift + F10 — действия','Shift + F10 opens actions')} onKeyDown={e=>iconKeys(e,app)} animate={pressedApp === itemKey(app) ? "tap" : (hoveredApp === itemKey(app) && !isDragging && !fileDrag.active ? "hover" : (!isDragging && !fileDrag.active && attention.has(app) ? "attention" : "idle"))} onPointerDown={() => setPressedApp(itemKey(app))} onPointerUp={() => setPressedApp(null)} onPointerCancel={() => setPressedApp(null)}>
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
                left: clampPopup({x:contextMenu.x,y:contextMenu.y},{width:260*scale,height:320*scale},{width:availableWidth,height:availableHeight}).x/scale,
                top: clampPopup({x:contextMenu.x,y:contextMenu.y-320*scale},{width:260*scale,height:320*scale},{width:availableWidth,height:availableHeight}).y/scale,
                zoom: scale,maxWidth:(availableWidth-16)/scale,maxHeight:Math.min(320,(availableHeight-16)/scale)
            }} role="menu" aria-label={tx('Действия дока','Dock actions')} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeMenu();if(menuTrigger.current?.isConnected)menuTrigger.current.focus();}if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const items=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),[role=menuitem]')).filter(el=>el.getClientRects().length);const index=items.indexOf(document.activeElement as HTMLElement),next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}}} onClick={(e) => e.stopPropagation()}>
          {contextMenu.app ? (<>
              {contextMenu.app.path !== 'start' && <button className="menu-item" onClick={() => {
                        attention.toggleMuted(contextMenu.app!).catch(() => setToast(tr("Не удалось сохранить настройку")));
                        closeMenu();
                    }}>{attention.isMuted(contextMenu.app) ? tr("Включить внимание для приложения") : tr("Не подпрыгивать для приложения")}</button>}
              <button className="menu-item" onClick={() => togglePin(contextMenu.app!)}>
                {contextMenu.app.is_pinned ? tr("Unpin from Dock") : tr("Pin to Dock")}
              </button>
              {contextMenu.app.is_pinned && contextMenu.app.path !== 'start' && (<><button className="menu-item" disabled={pinnedApps[0]?.path===contextMenu.app.path} onClick={()=>{void movePinned(contextMenu.app!,-1);closeMenu();}}>{tx('Переместить назад','Move earlier')}</button><button className="menu-item" disabled={pinnedApps[pinnedApps.length-1]?.path===contextMenu.app.path} onClick={()=>{void movePinned(contextMenu.app!,1);closeMenu();}}>{tx('Переместить вперёд','Move later')}</button>
                  <div className="menu-divider"/>
                  <button className="menu-item" onClick={() => {
                        const isHost = contextMenu.app!.path.toLowerCase().includes("msedge.exe") || contextMenu.app!.path.toLowerCase().includes("chrome.exe") || contextMenu.app!.path.toLowerCase().includes("applicationframehost.exe");
                        const ck = isHost ? `${contextMenu.app!.path}:${contextMenu.app!.name.toLowerCase()}` : contextMenu.app!.path;
                        iconPickerTargetRef.current = ck;
                        closeMenu();
                        setTimeout(() => {
                            document.getElementById('icon-file-input')?.click();
                        }, 50);
                    }}>{tr("Change Icon...")}</button>
                  {(() => {
                        const isHost = contextMenu.app!.path.toLowerCase().includes("msedge.exe") || contextMenu.app!.path.toLowerCase().includes("chrome.exe") || contextMenu.app!.path.toLowerCase().includes("applicationframehost.exe");
                        const ck = isHost ? `${contextMenu.app!.path}:${contextMenu.app!.name.toLowerCase()}` : contextMenu.app!.path;
                        return customIcons[ck] ? (<button className="menu-item" onClick={() => {
                                handleRemoveCustomIcon(contextMenu.app!);
                                closeMenu();
                            }}>{tr("Reset Icon")}</button>) : null;
                    })()}
                </>)}
              <div className="menu-divider"/>
              <button className="menu-item" onClick={() => { setShowAddPopup(true); closeMenu(); }}>{tr("Add App to Dock...")}</button>
              <div className="menu-item has-submenu" role="menuitem" tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='Enter'||e.key===' '){e.preventDefault();setActiveSubmenu('bloom');e.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();}}} onMouseEnter={() => setActiveSubmenu('bloom')} onMouseLeave={() => setActiveSubmenu(null)}>{tr("Dinox Options")}<span className="submenu-arrow">▶</span>
                <div className="submenu">
                  <button className="menu-item" onClick={() => { invoke('open_settings_window'); closeMenu(); }}>{tr("Open Settings")}</button>
                  <button className="menu-item" onClick={() => invoke('restart_bloom')}>{tr("Restart Dinox")}</button>
                  <button className="menu-item" onClick={() => { handleClearIconCache(); closeMenu(); }}>{tr("Clear Icon Cache")}</button>
                  <div className="menu-divider"/>
                  <button className="menu-item quit" onClick={() => invoke('quit_bloom')}>{tr("Quit Dinox")}</button>
                </div>
              </div>
              {contextMenu.app.is_running && (<>
                  <div className="menu-divider"/>
                  <button className="menu-item quit" onClick={async () => {
                        if (contextMenu.app?.hwnd) {
                            await invoke('close_window', { hwnd: contextMenu.app.hwnd });
                            closeMenu();
                        }
                    }}>{tx('Закрыть окно','Close window')} · {contextMenu.app.name}
                  </button>
                </>)}
            </>) : (<>
              <button className="menu-item" onClick={() => { setShowAddPopup(true); closeMenu(); }}>{tr("Add App to Dock...")}</button>
              <div className="menu-item has-submenu" role="menuitem" tabIndex={0} onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='Enter'||e.key===' '){e.preventDefault();setActiveSubmenu('bloom');e.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();}}} onMouseEnter={() => setActiveSubmenu('bloom')} onMouseLeave={() => setActiveSubmenu(null)}>{tr("Dinox Options")}<span className="submenu-arrow">▶</span>
                <div className="submenu">
                  <button className="menu-item" onClick={() => { invoke('open_settings_window'); closeMenu(); }}>{tr("Open Settings")}</button>
                  <button className="menu-item" onClick={() => invoke('restart_bloom')}>{tr("Restart Dinox")}</button>
                  <button className="menu-item" onClick={() => { handleClearIconCache(); closeMenu(); }}>{tr("Clear Icon Cache")}</button>
                  <div className="menu-divider"/>
                  <button className="menu-item quit" onClick={() => invoke('quit_bloom')}>{tr("Quit Dinox")}</button>
                </div>
              </div>
            </>)}
        </div>)}

      <input id="icon-file-input" type="file" accept=".png,.ico,.jpg,.jpeg,.svg,.bmp" style={{ display: 'none' }} onChange={handleIconFileSelect}/>

      <AnimatePresence>
        {showAddPopup && <div className="dock-pin-backdrop" onClick={closePopup}><motion.div ref={popupRef} role="dialog" aria-modal="true" aria-label={tx('Приложения в доке','Dock applications')} className="dock-pin-manager" initial={{opacity:0,scale:.98}} animate={{opacity:1,scale:1}} exit={{opacity:0}} onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePopup();}if(e.key==='Tab'){const fields=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')).filter(el=>el.getClientRects().length);const first=fields[0],last=fields[fields.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}}}><header><strong>{tx('Приложения в доке','Dock applications')}</strong><button autoFocus aria-label={tx('Закрыть','Close')} onClick={closePopup}><X size={18}/></button></header><DockContentSettings compact/></motion.div></div>}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (<div className="dock-toast-anchor"><motion.div role="status" className="dock-toast" initial={{ opacity: 0, y: reducedMotion?0:10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion?0:10 }} transition={{ duration: reducedMotion?0:.2 }} style={{ zoom: scale }}>
            {toast.slice(0,300)}
          </motion.div></div>)}
      </AnimatePresence>
    </div></MotionConfig>);
});
export default Dock;
