import {tr,trError} from '../i18n/core';
import type { SettingRowProps } from "./types";
import {useId} from 'react';

export function SettingRow({
  icon: Icon,
  label,
  desc,
  action,
  danger,
  divider = true,
  onClick,
  children,
}: SettingRowProps) {
  const labelId = useId();
  const className = [
    "setting-item",
    action ? "action" : "",
    danger ? "danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <div className={className} onClick={onClick}
        role={onClick ? 'button' : 'group'} aria-labelledby={labelId}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? e => {if(e.target===e.currentTarget && (e.key==='Enter' || e.key===' ')){e.preventDefault();onClick();}} : undefined}>
        <div className="setting-icon-bg">
          <Icon size={14} strokeWidth={1.5} />
        </div>
        <div className="setting-info">
          <span id={labelId} className="setting-label">{tr(label)}</span>
          {desc && <span className="setting-desc">{trError(desc)}</span>}
        </div>
        {children}
      </div>
      {divider && <div className="setting-divider" />}
    </>
  );
}
