/**
 * Device DNA Web Worker
 * Processes graphics fingerprinting and cryptographic hashing off-thread.
 */

self.onmessage = async (event) => {
  const { action, data } = event.data;

  if (action === 'generate') {
    try {
      const results: Record<string, string> = {};
      
      // 1. Graphics Fingerprinting using OffscreenCanvas
      if (typeof OffscreenCanvas !== 'undefined') {
        results.canvas = await generateCanvasFingerprint();
        results.webgl = await generateWebGLFingerprint();
      }

      // 2. Hash data received from main thread (Audio, Fonts, Hardware)
      if (data.audio) results.audio = await sha256(data.audio);
      if (data.fonts) results.fonts = await sha256(data.fonts.join(','));
      if (data.hardware) results.hardware = await sha256(JSON.stringify(data.hardware));

      self.postMessage({ status: 'success', dna: results });
    } catch (error: any) {
      self.postMessage({ status: 'error', error: error.message });
    }
  }
};

async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateCanvasFingerprint(): Promise<string> {
  try {
    const canvas = new OffscreenCanvas(200, 50);
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'unsupported';

    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('NexVid, DNA <canvas> 1.0', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('NexVid, DNA <canvas> 1.0', 4, 17);

    const blob = await canvas.convertToBlob();
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return 'error';
  }
}

async function generateWebGLFingerprint(): Promise<string> {
  try {
    const canvas = new OffscreenCanvas(1, 1);
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    if (!gl) return 'unsupported';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    
    return await sha256(`${vendor}|${renderer}`);
  } catch {
    return 'error';
  }
}
