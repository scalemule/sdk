/** Browser capture shared by applications. Capture starts only on a user gesture. */
import { maybeCompressImage } from './services/upload-compression';

export async function prepareCommunityMapAttachment(file: File): Promise<File> {
  const types = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/webm'
  ];
  if (!types.includes(file.type))
    throw new Error(
      'Choose JPEG, PNG or WebP photos, MP4/MOV/WebM video, or MP3/M4A/WAV/Ogg audio. For HEIC, export as JPEG first.'
    );
  if (!file.size || file.size > 25 * 1024 * 1024)
    throw new Error('Choose a file up to 25 MiB. Record a shorter clip if needed.');
  if (!file.type.startsWith('image/')) return file;
  // Use the same adaptive compression primitive as Storage uploads, one image at a time.
  const compressed = await maybeCompressImage(
    file,
    { maxWidth: 2400, maxHeight: 2400, maxSizeMB: 2, quality: 0.82 },
    'community-capture',
    null
  );
  const result = compressed
    ? new File(
        [compressed],
        file.name.replace(/\.[^.]+$/, '') + (compressed.type === 'image/webp' ? '.webp' : '.jpg'),
        { type: compressed.type, lastModified: file.lastModified }
      )
    : file;
  if (result.size > 8 * 1024 * 1024)
    throw new Error('This photo is too large. Choose a photo up to 8 MiB or use a smaller camera setting.');
  return result;
}

export interface MediaCaptureSession {
  stream: MediaStream;
  result: Promise<File | null>;
  stop(): void;
  cancel(): void;
}
/** CoralMeet capture limits: 15s video / 60s voice, bounded bytes, tracks always released. */
export async function startMediaCapture(kind: 'video' | 'audio', signal?: AbortSignal): Promise<MediaCaptureSession> {
  const candidates =
    kind === 'video'
      ? ['video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['audio/mp4', 'audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
  const mimeType =
    typeof MediaRecorder === 'undefined' ? undefined : candidates.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mimeType || !navigator.mediaDevices?.getUserMedia)
    throw new Error('Recording is unavailable in this browser. Use the camera or choose a file instead.');
  signal?.throwIfAborted();
  const stream = await navigator.mediaDevices.getUserMedia(
    kind === 'video'
      ? {
          audio: true,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 24, max: 30 }
          }
        }
      : { audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true }, video: false }
  );
  const release = () => stream.getTracks().forEach((t) => t.stop());
  if (signal?.aborted) {
    release();
    signal.throwIfAborted();
  }
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 });
  } catch (e) {
    release();
    throw e;
  }
  let cancelled = false;
  let failure: Error | undefined;
  let bytes = 0;
  const chunks: Blob[] = [];
  let timer: ReturnType<typeof setTimeout>;
  const stop = () => {
    if (recorder.state !== 'inactive') recorder.stop();
  };
  const cancel = () => {
    cancelled = true;
    stop();
    release();
  };
  const result = new Promise<File | null>((resolve, reject) => {
    const clean = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      release();
    };
    recorder.ondataavailable = (event) => {
      bytes += event.data.size;
      if (bytes > 25 * 1024 * 1024) {
        failure = new Error('The recording is too large. Try a shorter clip.');
        stop();
      } else if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      failure = new Error('Recording was interrupted. Try again or choose a file.');
      stop();
    };
    recorder.onstop = () => {
      clean();
      if (failure) reject(failure);
      else if (cancelled || !chunks.length) resolve(null);
      else {
        const type = recorder.mimeType.split(';')[0] || (kind === 'audio' ? 'audio/webm' : 'video/webm');
        const extension = type.includes('mp4')
          ? kind === 'audio'
            ? 'm4a'
            : 'mp4'
          : type.includes('ogg')
            ? 'ogg'
            : 'webm';
        resolve(new File(chunks, `community-${kind}-${Date.now()}.${extension}`, { type }));
      }
      chunks.length = 0;
    };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      recorder.start(250);
      timer = setTimeout(stop, kind === 'video' ? 15_000 : 60_000);
    } catch (error) {
      clean();
      reject(error);
    }
  });
  return { stream, result, stop, cancel };
}
