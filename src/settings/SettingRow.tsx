import {tr,trError} from '../i18n/core';
import type { SettingRowProps } from "./types";
import {useId,Children,isValidElement,cloneElement,type ReactNode,type ReactElement} from 'react';

function nameControls(children: ReactNode, labelId: string, descriptionId?: string): ReactNode {
  return Children.map(children, child => {
    if (!isValidElement(child) || typeof child.type !== 'string') return child;
    const element = child as ReactElement<Record<string, any>>;
    const props: Record<string, any> = {};
    if (['input','select','textarea'].includes(child.type)) {
      if (!element.props['aria-label'] && !element.props['aria-labelledby']) props['aria-labelledby'] = labelId;
      if (descriptionId && !element.props['aria-describedby']) props['aria-describedby'] = descriptionId;
    }
    if (element.props.children) props.children = nameControls(element.props.children, labelId, descriptionId);
    return cloneElement(element, props);
  });
}

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
  const descriptionId = desc ? `${labelId}-description` : undefined;
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
          {desc && <span id={descriptionId} className="setting-desc">{trError(desc)}</span>}
        </div>
        {nameControls(children, labelId, descriptionId)}
      </div>
      {divider && <div className="setting-divider" />}
    </>
  );
}
