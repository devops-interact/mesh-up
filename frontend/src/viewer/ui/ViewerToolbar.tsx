import {
  Camera,
  Footprints,
  Glasses,
  Info,
  MousePointer,
  Move,
  Rotate3d,
  RotateCcw,
  Ruler,
  Scaling,
  X,
} from 'lucide-react';
import type { ModelTransformMode, QuarterTurnAxis } from '../hooks/useModelTransform';
import type { ViewerMode } from '../types';

export interface ViewerToolbarProps {
  mode: ViewerMode;
  autoRotate: boolean;
  showHelp: boolean;
  webXrAvailable: boolean;
  webXrBusy: boolean;
  hasWalkPath?: boolean;
  transformMode?: ModelTransformMode;
  onTransformMode?: (mode: ModelTransformMode) => void;
  onQuarterTurn?: (axis: QuarterTurnAxis) => void;
  onModeChange: (mode: ViewerMode) => void;
  onSnapshot: () => void;
  onReset: () => void;
  onToggleAutoRotate: () => void;
  onEnterVR: () => void;
  onToggleHelp: () => void;
  onWalkPathStart?: () => void;
  inspectionSlot?: React.ReactNode;
  compositionLabel?: string;
}

export function ViewerToolbar({
  mode,
  autoRotate,
  showHelp,
  webXrAvailable,
  webXrBusy,
  hasWalkPath = false,
  transformMode = 'none',
  onTransformMode,
  onQuarterTurn,
  onModeChange,
  onSnapshot,
  onReset,
  onToggleAutoRotate,
  onEnterVR,
  onToggleHelp,
  onWalkPathStart,
  inspectionSlot,
  compositionLabel,
}: ViewerToolbarProps) {
  return (
    <>
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <div className="glass-panel text-white/80 text-xs px-3 py-1.5 flex items-center gap-2">
          {mode === 'orbit' && <><MousePointer className="w-3 h-3" /> Orbit</>}
          {mode === 'walkthrough' && <><Footprints className="w-3 h-3" /> Walk-Through</>}
          {mode === 'measure' && <><Ruler className="w-3 h-3" /> Measure</>}
        </div>
        {compositionLabel && (
          <div className="glass-panel text-[10px] text-emerald-400/90 px-2.5 py-1 uppercase tracking-wide">
            {compositionLabel}
          </div>
        )}
      </div>

      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <ToolbarButton icon={<MousePointer className="w-3.5 h-3.5" />} label="Orbit" active={mode === 'orbit'} onClick={() => onModeChange('orbit')} />
        <ToolbarButton icon={<Footprints className="w-3.5 h-3.5" />} label="Walk" active={mode === 'walkthrough'} onClick={() => onModeChange('walkthrough')} />
        {hasWalkPath && onWalkPathStart && (
          <ToolbarButton
            icon={<Footprints className="w-3.5 h-3.5" />}
            label="Walk path"
            onClick={onWalkPathStart}
          />
        )}
        <ToolbarButton icon={<Ruler className="w-3.5 h-3.5" />} label="Measure" active={mode === 'measure'} onClick={() => onModeChange('measure')} />
        {onTransformMode && (
          <>
            <div className="border-t border-white/[0.18] my-1" />
            <ToolbarButton icon={<Move className="w-3.5 h-3.5" />} label="Move" active={transformMode === 'move'} onClick={() => onTransformMode('move')} />
            <ToolbarButton icon={<Rotate3d className="w-3.5 h-3.5" />} label="Rotate" active={transformMode === 'rotate'} onClick={() => onTransformMode('rotate')} />
            {transformMode === 'rotate' && onQuarterTurn && (
              <>
                <ToolbarButton icon={<Rotate3d className="w-3.5 h-3.5" />} label="90° X" onClick={() => onQuarterTurn('x')} />
                <ToolbarButton icon={<Rotate3d className="w-3.5 h-3.5" />} label="90° Y" onClick={() => onQuarterTurn('y')} />
                <ToolbarButton icon={<Rotate3d className="w-3.5 h-3.5" />} label="90° Z" onClick={() => onQuarterTurn('z')} />
              </>
            )}
            <ToolbarButton icon={<Scaling className="w-3.5 h-3.5" />} label="Scale" active={transformMode === 'scale'} onClick={() => onTransformMode('scale')} />
          </>
        )}
        {inspectionSlot}
        <div className="border-t border-white/[0.18] my-1" />
        <ToolbarButton icon={<Camera className="w-3.5 h-3.5" />} label="Snapshot" onClick={onSnapshot} />
        <ToolbarButton icon={<RotateCcw className="w-3.5 h-3.5" />} label="Reset" onClick={onReset} />
        <ToolbarButton
          icon={<RotateCcw className="w-3.5 h-3.5" />}
          label={autoRotate ? 'Auto ✓' : 'Auto'}
          active={autoRotate}
          onClick={onToggleAutoRotate}
        />
        {webXrAvailable && (
          <ToolbarButton
            icon={<Glasses className="w-3.5 h-3.5" />}
            label={webXrBusy ? 'VR…' : 'Enter VR'}
            onClick={onEnterVR}
          />
        )}
        <ToolbarButton icon={<Info className="w-3.5 h-3.5" />} label="Help" active={showHelp} onClick={onToggleHelp} />
      </div>

      {showHelp && (
        <div className="absolute top-14 right-3 z-20 w-64">
          <div className="bg-neutral-950/95 backdrop-blur-md border border-white/[0.18] rounded-xl p-4 text-xs text-white/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-sm">Viewer Controls</span>
              <button type="button" onClick={onToggleHelp} className="text-white/40 hover:text-white"><X className="w-3 h-3" /></button>
            </div>
            <HelpItem icon={<MousePointer className="w-3 h-3" />} title="Orbit">Left-drag: orbit. Right-drag / Ctrl+left-drag: pan. Scroll: zoom. Double-click a surface to move the orbit pivot.</HelpItem>
            <HelpItem icon={<Move className="w-3 h-3" />} title="Move / Rotate / Scale">Drag the model axes. Left-drag no longer orbits while a gizmo is on. Right-drag pans, scroll zooms. In Rotate, 90° X/Y/Z turns the model a quarter turn. Click the button again to turn the gizmo off.</HelpItem>
            <HelpItem icon={<Footprints className="w-3 h-3" />} title="Walk-Through">Click to look. WASD moves. Space up, Shift down. Esc releases the mouse.{hasWalkPath ? ' Walk path snaps the camera to the recorded start.' : ''}</HelpItem>
            <HelpItem icon={<Ruler className="w-3 h-3" />} title="Measure">Left-drag: orbit. Left-click without dragging: place a vertex. Right-drag: pan. Scroll: zoom. Esc or Soltar releases the selection.</HelpItem>
            <HelpItem icon={<Glasses className="w-3 h-3" />} title="Inspect">Wireframe, textures, PBR, exposure, grid, zones.</HelpItem>
            <HelpItem icon={<Glasses className="w-3 h-3" />} title="WebXR">Enter VR when a headset is available.</HelpItem>
          </div>
        </div>
      )}
    </>
  );
}

function ToolbarButton({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active?: boolean; onClick: () => void;
}) {
  const color = active
    ? 'bg-white/15 text-white border-white/40'
    : 'bg-neutral-950/70 text-white/50 border-white/[0.22] hover:text-white hover:bg-white/[0.06]';
  return (
    <button type="button" onClick={onClick} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all duration-150 border ${color} backdrop-blur-md`} title={label}>
      {icon}<span>{label}</span>
    </button>
  );
}

function HelpItem({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-white/80 font-medium mb-0.5">{icon}{title}</div>
      <p className="text-white/40 leading-relaxed pl-5">{children}</p>
    </div>
  );
}

export function ViewerModeHint({
  mode,
  hasWalkPath = false,
  transformMode = 'none',
}: {
  mode: ViewerMode;
  hasWalkPath?: boolean;
  transformMode?: ModelTransformMode;
}) {
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10">
      <div className="glass-panel text-white/50 text-[10px] px-3 py-1.5">
        {mode === 'orbit' && transformMode === 'rotate' && 'Drag the rotation axes  |  90° X/Y/Z  |  Right-drag: Pan  |  Scroll: Zoom'}
        {mode === 'orbit' && (transformMode === 'move' || transformMode === 'scale') && 'Drag the model axes  |  Right-drag: Pan  |  Scroll: Zoom'}
        {mode === 'orbit' && transformMode === 'none' && 'Left: Orbit  |  Right / Ctrl+Left: Pan  |  Scroll: Zoom  |  Double-click: Pivot'}
        {mode === 'walkthrough' && (hasWalkPath
          ? 'Click to look  |  WASD  |  Space/Shift up/down  |  Esc releases mouse  |  Walk path start applied'
          : 'Click to look  |  WASD  |  Space/Shift up/down  |  Esc releases mouse')}
        {mode === 'measure' && 'Left-drag: Orbit  |  Left-click: Place point  |  Right-drag: Pan  |  Esc / Soltar: Release'}
      </div>
    </div>
  );
}
