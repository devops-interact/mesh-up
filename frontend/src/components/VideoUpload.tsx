'use client';

import { useState, useRef, useEffect } from 'react';
import { uploadVideo, getPresets, type PresetInfo } from '../api/jobs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileVideo, AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoUploadProps {
  onUploadSuccess: (jobId: string, scanId?: number) => void;
  /** After a job exists (processing or model ready), hide presets + upload UI; keep only video summary / messages. */
  jobStarted?: boolean;
  projectId?: number;
  scanId?: number;
  /** Allow re-running with a different preset when a job already exists */
  allowRerun?: boolean;
}

interface UploadResult {
  job_id: string;
  warnings?: string[];
  video_info?: {
    duration: number;
    resolution: string;
    stored_resolution?: string;
    rotation_deg?: number;
    fps: number;
    orientation?: string;
    aspect_ratio?: string;
    is_portrait?: boolean;
  };
}

function formatPresetTime(minutes: number): string {
  return `~${minutes} min est.`;
}

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

function probeVideoFile(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const info = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      URL.revokeObjectURL(url);
      resolve(info);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video metadata'));
    };
    video.src = url;
  });
}

function formatFileSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

export default function VideoUpload({
  onUploadSuccess,
  jobStarted = false,
  projectId,
  scanId,
  allowRerun = false,
}: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('room');
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [presetsWarning, setPresetsWarning] = useState<string | null>(null);
  const [videoInfo, setVideoInfo] = useState<UploadResult['video_info'] | null>(null);
  const [showRerun, setShowRerun] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPresets()
      .then((list) => {
        setPresets(list);
        if (!list.some((p) => p.id === 'room')) {
          setPresetsWarning('Room preset missing from API — redeploy backend or refresh.');
        } else {
          setPresetsWarning(null);
        }
      })
      .catch(() => {
        setPresetsWarning('Could not load presets from API — using local fallback.');
        setPresets([
          { id: 'quality', name: 'Object — isolated subject', description: 'One mesh of a single object. Background is masked.', estimated_minutes: 15, composition_mode: 'single_object' },
          { id: 'room', name: 'Room — full space', description: 'One mesh of the whole space. Reconstruction can take over an hour. Video up to 3 minutes.', estimated_minutes: 60, composition_mode: 'single_object' },
        ]);
      });
  }, []);

  const selectedPresetInfo = presets.find((p) => p.id === selectedPreset);
  const isRoom = selectedPreset === 'room' || selectedPresetInfo?.id === 'room';

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ['.mp4', '.mov', '.avi', '.webm'];
    const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!validExtensions.includes(ext)) {
      setError(`Please upload a video file (${validExtensions.join(', ')})`);
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File too large (${formatFileSize(file.size)}). Maximum size is 500MB.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const localWarnings: string[] = [];
    try {
      const probe = await probeVideoFile(file);
      if (probe.duration > 180) {
        setError(
          `Video is ${probe.duration.toFixed(0)}s. Maximum length is 3 minutes.`,
        );
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (probe.width > 1920 || probe.height > 1080) {
        localWarnings.push(
          `Video is ${probe.width}×${probe.height}. It will be scaled to 1080p before reconstruction.`,
        );
      }
    } catch {
      // Server validation still checks duration and resolution.
    }

    setError(null);
    setWarnings(localWarnings);
    if (!jobStarted) setVideoInfo(null);
    setUploading(true);

    try {
      const result = await uploadVideo(file, selectedPreset, projectId, scanId) as UploadResult & { scan_id?: number };

      if (result.warnings && result.warnings.length > 0) {
        setWarnings(result.warnings);
      }
      if (result.video_info) {
        setVideoInfo(result.video_info);
      }

      onUploadSuccess(result.job_id, result.scan_id);
      setShowRerun(false);
    } catch (err: any) {
      console.error('Upload error:', err);
      const detail = err.response?.data?.detail;
      if (typeof detail === 'object' && detail.errors) {
        setError(detail.errors.join('; '));
        if (detail.warnings) setWarnings(detail.warnings);
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(`File too large (${formatFileSize(file.size)}). Maximum size is 500MB.`);
        } else {
          setError(
            'Network error: Cannot connect to server. Check if the backend is running, or try again in a private window.',
          );
        }
      } else if (err.response?.status === 413) {
        setError('File too large. Maximum size is 500MB.');
      } else if (err.response?.status >= 500) {
        setError(`Server error (${err.response?.status}): ${detail || 'Please check backend logs.'}`);
      } else {
        setError(detail || err.message || 'Upload failed. Please try again.');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onUploadClick = () => fileInputRef.current?.click();

  const presetGrid = (
    <div className="grid grid-cols-1 gap-3">
      {presets.map((preset) => (
        <button
          key={preset.id}
          onClick={() => setSelectedPreset(preset.id)}
          disabled={uploading}
          className={cn(
            'flex flex-col items-start p-3 rounded-lg border text-left transition-all duration-200',
            selectedPreset === preset.id
              ? 'border-white/48 bg-white/[0.06] text-white'
              : 'border-white/[0.22] bg-neutral-950/50 text-gray-400 hover:border-white/[0.32] hover:bg-white/[0.06]',
            uploading && 'opacity-50 cursor-not-allowed',
            preset.id === 'room' && 'ring-1 ring-emerald-500/20',
          )}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="font-semibold text-sm">{preset.name}</span>
            {selectedPreset === preset.id && <CheckCircle className="w-3 h-3 text-white" />}
          </div>
          <span className="text-xs opacity-70 mb-2 flex items-center">
            <Clock className="w-3 h-3 mr-1" /> {formatPresetTime(preset.estimated_minutes)}
          </span>
          <p className="text-[10px] opacity-60 leading-tight">{preset.description}</p>
          <span className={cn(
            'mt-1 text-[9px] uppercase tracking-wide',
            preset.id === 'room' ? 'text-emerald-400/90' : 'text-white/35',
          )}>
            {preset.id === 'room' ? 'Full room · one mesh' : 'Single object'}
          </span>
        </button>
      ))}
    </div>
  );

  const videoSummary =
    videoInfo && (
      <div className="flex items-center p-3 rounded-lg bg-white/[0.06] border border-white/48 text-neutral-300 text-sm">
        <FileVideo className="w-4 h-4 mr-2 shrink-0 text-white/80" />
        <span>
          Video: {videoInfo.duration.toFixed(1)}s • {videoInfo.resolution}
          {videoInfo.aspect_ratio ? ` (${videoInfo.aspect_ratio})` : ''} • {videoInfo.fps.toFixed(1)} fps
          {videoInfo.orientation ? ` • ${videoInfo.orientation}` : ''}
          {videoInfo.stored_resolution && videoInfo.stored_resolution !== videoInfo.resolution
            ? ` • stored ${videoInfo.stored_resolution}`
            : ''}
        </span>
      </div>
    );

  const warningsBlock =
    warnings.length > 0 && (
      <div className="p-3 rounded-lg bg-yellow-500/[0.06] border border-yellow-500/[0.28] text-yellow-400 text-sm">
        <div className="flex items-center font-semibold mb-1">
          <AlertTriangle className="w-4 h-4 mr-2" />
          Warnings
        </div>
        <ul className="list-disc list-inside space-y-1 ml-5 opacity-90 text-xs">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </div>
    );

  const errorBlock =
    error && (
      <div className="p-3 rounded-lg bg-red-500/[0.06] border border-red-500/28 text-red-400 text-sm flex items-center">
        <AlertTriangle className="w-4 h-4 mr-2 shrink-0" />
        {error}
      </div>
    );

  if (jobStarted && !showRerun) {
    return (
      <div className="w-full space-y-3">
        {videoSummary}
        {warningsBlock}
        {errorBlock}
        {allowRerun && (
          <Button variant="outline" size="sm" onClick={() => setShowRerun(true)} className="w-full">
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Re-run with different preset
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle>{jobStarted ? 'Re-run Scan' : 'New Project'}</CardTitle>
        <CardDescription>
          {jobStarted ? 'Upload a new video or change preset' : 'Upload a video to start 3D reconstruction'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-3">
          <label className="text-sm font-medium text-gray-300">Reconstruction Preset</label>
          {presetsWarning && (
            <p className="text-xs text-amber-400/80 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {presetsWarning}
            </p>
          )}
          {presetGrid}
          {selectedPreset === 'room' && (
            <div className="text-xs text-gray-400 border border-white/10 rounded-lg p-2.5 space-y-1">
              <p className="text-gray-300 font-medium">Room walkthrough checklist</p>
              <ul className="list-disc list-inside space-y-0.5 text-gray-500">
                <li>30+ seconds — slow 360° pan from room center, or walk a full loop with walls in frame</li>
                <li>Walls and floor visible throughout</li>
                <li>Works in horizontal and vertical — keep the phone steady while panning 360°</li>
                <li>Up to 3 minutes. Frames are scaled to 720p and 15 fps before upload.</li>
                <li>A full room can take over an hour. Do not upload the video again while it is running.</li>
                <li>One mesh of the whole space, ready to measure in the viewer</li>
                <li>Not for single objects or outdoor equipment — use Object preset</li>
              </ul>
            </div>
          )}
          {!isRoom && selectedPreset === 'quality' && (
            <p className="text-xs text-emerald-400/70 border border-emerald-500/20 rounded-lg p-2.5">
              Object mode masks the background and reconstructs <strong>one subject</strong>. For walls and floor, select <strong>Room — full space</strong>.
            </p>
          )}
        </div>

        <div
          className={cn(
            'border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center text-center transition-all',
            'border-white/[0.22] bg-neutral-950/40 hover:bg-white/[0.08] hover:border-white/[0.38]',
            uploading && 'opacity-50 pointer-events-none',
          )}
        >
          <div className="w-10 h-10 rounded-full bg-neutral-950 flex items-center justify-center mb-3 border border-white/[0.18]">
            <Upload className="w-5 h-5 text-gray-400" />
          </div>
          <p className="text-xs text-gray-400 mb-4">MP4, MOV, AVI, WEBM — Max 500MB</p>
          <Button onClick={onUploadClick} disabled={uploading} loading={uploading} className="w-full">
            {uploading ? 'Uploading...' : 'Select Video File'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.mov,.avi,.webm"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {videoSummary}
        {warningsBlock}
        {errorBlock}
      </CardContent>
    </Card>
  );
}
