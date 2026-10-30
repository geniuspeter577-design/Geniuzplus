import { Ionicons } from '@expo/vector-icons';
import React, { useId, useState } from 'react';

type VolumeBoostControlProps = {
  value: number;
  disabled?: boolean;
  onActivate: () => void;
  onChange: (value: number) => void;
};

export function VolumeBoostControl({ value, disabled = false, onActivate, onChange }: VolumeBoostControlProps) {
  const [open, setOpen] = useState(false);
  const inputId = useId();

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={`Volume boost ${value}%`}
        aria-expanded={open}
        title={disabled ? 'Volume boost is unavailable for this source; standard audio is used' : `Volume boost ${value}%`}
        disabled={disabled}
        onClick={() => {
          onActivate();
          setOpen((current) => !current);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          minHeight: 34,
          border: 0,
          borderRadius: 5,
          padding: '0 8px',
          background: 'rgba(26,29,35,0.92)',
          color: '#FFFFFF',
          font: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <Ionicons name="volume-high-outline" size={17} color="#FFFFFF" />
        <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{value}%</span>
      </button>
      {open && !disabled ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            right: 0,
            bottom: 'calc(100% + 8px)',
            display: 'grid',
            gap: 8,
            width: 176,
            padding: 10,
            borderRadius: 5,
            background: '#1A1D23',
            color: '#FFFFFF',
            boxShadow: '0 4px 18px rgba(0,0,0,0.4)',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <label htmlFor={inputId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>Volume boost</span>
            <output>{value}%</output>
          </label>
          <input
            id={inputId}
            aria-label="Volume boost"
            type="range"
            min={100}
            max={200}
            step={5}
            value={value}
            onPointerDown={onActivate}
            onChange={(event) => onChange(Number(event.currentTarget.value))}
            style={{ width: '100%', margin: 0, accentColor: '#72F06A' }}
          />
        </div>
      ) : null}
    </div>
  );
}