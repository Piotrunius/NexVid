/**
 * Device DNA - Hybrid Asynchronous Fingerprinting for NexVid
 * Moves heavy processing to a Web Worker while keeping DOM-dependent tasks on the main thread.
 */

export interface DeviceDNA {
  fp_canvas: string;
  fp_webgl: string;
  fp_audio: string;
  fp_fonts: string;
  fp_hardware: string;
}

let cachedDNA: DeviceDNA | null = null;
let generatingPromise: Promise<DeviceDNA> | null = null;

/**
 * Main Orchestrator for Device DNA
 */
export async function getDeviceDNA(): Promise<DeviceDNA> {
  if (cachedDNA) return cachedDNA;
  if (generatingPromise) return generatingPromise;

  generatingPromise = new Promise(async (resolve) => {
    const run = async () => {
      try {
        const supportOffscreen = typeof OffscreenCanvas !== 'undefined';
        const browserSupportsWorker = typeof Worker !== 'undefined';

        // 1. Collect DOM-dependent and limited API data (Main Thread)
        const audioRaw = await getAudioSample();
        const fontsRaw = getFontList();
        const hardwareRaw = await getHardwareInfo();

        if (supportOffscreen && browserSupportsWorker) {
          try {
            // 2. Spawn Worker for Graphics & Hashing
            const worker = new Worker(new URL('./fingerprint.worker.ts', import.meta.url));
            worker.postMessage({
              action: 'generate',
              data: { audio: audioRaw, fonts: fontsRaw, hardware: hardwareRaw }
            });

            worker.onmessage = (e) => {
              if (e.data.status === 'success') {
                cachedDNA = e.data.dna;
                resolve(cachedDNA!);
              } else {
                throw new Error(e.data.error || 'Worker failed');
              }
              worker.terminate();
            };
            return;
          } catch (workerError) {
            console.warn('[DNA] Worker failed, falling back to main thread', workerError);
          }
        }

        // 3. Fallback: Full Main Thread Processing (Asynchronous)
        const dna = await generateDNAMainThread(audioRaw, fontsRaw, hardwareRaw);
        cachedDNA = dna;
        resolve(dna);
      } catch (err) {
        console.error('[DNA] Critical failure:', err);
        // Return empty/neutral DNA rather than crashing
        const fallback = { fp_canvas: '', fp_webgl: '', fp_audio: '', fp_fonts: '', fp_hardware: '' };
        resolve(fallback);
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => run());
    } else {
      setTimeout(run, 100);
    }
  });

  return generatingPromise;
}

/**
 * Fallback generator that runs everything on the main thread
 */
async function generateDNAMainThread(audio: string, fonts: string[], hardware: any): Promise<DeviceDNA> {
  const canvasHash = await getCanvasHashMain();
  const webglHash = await getWebGLHashMain();
  
  return {
    fp_canvas: canvasHash,
    fp_webgl: webglHash,
    fp_audio: await sha256(audio),
    fp_fonts: await sha256(fonts.join(',')),
    fp_hardware: await sha256(JSON.stringify(hardware)),
  };
}

// --- Main Thread Data Collection Helpers ---

async function getAudioSample(): Promise<string> {
  try {
    const AudioContext = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!AudioContext) return 'no-audio';

    const context = new AudioContext(1, 44100, 44100);
    const oscillator = context.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(10000, context.currentTime);

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, context.currentTime);
    compressor.knee.setValueAtTime(40, context.currentTime);
    compressor.ratio.setValueAtTime(12, context.currentTime);
    compressor.attack.setValueAtTime(0, context.currentTime);
    compressor.release.setValueAtTime(0.25, context.currentTime);

    oscillator.connect(compressor);
    compressor.connect(context.destination);

    oscillator.start(0);
    const buffer = await context.startRendering();
    const data = buffer.getChannelData(0);
    
    // Convert 500 samples to string for hashing
    return Array.from(data.slice(4500, 5000)).join('');
  } catch {
    return 'audio-error';
  }
}

function getFontList(): string[] {
  const fontList = ['Arial', 'Helvetica', 'Times New Roman', 'Courier', 'Verdana', 'Georgia', 'Palatino', 'Garamond', 'Bookman', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black', 'Impact'];
  const baseFonts = ['monospace', 'sans-serif', 'serif'];
  const testString = 'mmmmmmmmmmlli';
  const testSize = '72px';
  const h = document.body;

  const s = document.createElement('span');
  s.style.position = 'absolute';
  s.style.left = '-9999px';
  s.style.fontSize = testSize;
  s.innerHTML = testString;
  
  const defaultWidth: Record<string, number> = {};
  for (const base of baseFonts) {
    s.style.fontFamily = base;
    h.appendChild(s);
    defaultWidth[base] = s.offsetWidth;
    h.removeChild(s);
  }

  const detected: string[] = [];
  for (const font of fontList) {
    let matched = false;
    for (const base of baseFonts) {
      s.style.fontFamily = `'${font}',${base}`;
      h.appendChild(s);
      if (s.offsetWidth !== defaultWidth[base]) {
        matched = true;
      }
      h.removeChild(s);
      if (matched) break;
    }
    if (matched) detected.push(font);
  }
  return detected;
}

async function getHardwareInfo(): Promise<any> {
  const info: any = {
    ua: navigator.userAgent,
    lang: navigator.language,
    scr: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    tz: new Date().getTimezoneOffset(),
    mem: (navigator as any).deviceMemory || 0,
    cores: navigator.hardwareConcurrency || 0,
  };

  if ((navigator as any).userAgentData) {
    try {
      info.hints = await (navigator as any).userAgentData.getHighEntropyValues(['architecture', 'model', 'platform', 'platformVersion']);
    } catch {}
  }
  return info;
}

async function getCanvasHashMain(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'unsupported';

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.font = '14px Arial';
    ctx.fillText('NexVid DNA 🧬', 2, 15);
    
    return await sha256(canvas.toDataURL());
  } catch { return 'error'; }
}

async function getWebGLHashMain(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || (canvas.getContext('experimental-webgl') as WebGLRenderingContext);
    if (!gl) return 'unsupported';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    
    return await sha256(`${vendor}|${renderer}`);
  } catch { return 'error'; }
}

async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
