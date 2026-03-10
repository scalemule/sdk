// src/services/upload-compression.ts
var MIN_COMPRESS_SIZE = 100 * 1024;
var COMPRESSIBLE_TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/jpg", "image/png", "image/bmp", "image/tiff"]);
var SKIP_TYPES = /* @__PURE__ */ new Set(["image/gif", "image/svg+xml", "image/webp", "image/avif"]);
var NETWORK_PROFILES = {
  "slow-2g": { maxWidth: 1280, maxHeight: 1280, quality: 0.6, maxSizeMB: 0.5 },
  "2g": { maxWidth: 1600, maxHeight: 1600, quality: 0.65, maxSizeMB: 1 },
  "3g": { maxWidth: 2048, maxHeight: 2048, quality: 0.75, maxSizeMB: 2 },
  "4g": { maxWidth: 3840, maxHeight: 3840, quality: 0.85, maxSizeMB: 5 }
};
async function maybeCompressImage(file, userConfig, sessionId, telemetry) {
  const type = file.type?.toLowerCase() || "";
  if (!type.startsWith("image/")) return null;
  if (SKIP_TYPES.has(type)) {
    telemetry?.emit(sessionId, "upload.compression.skipped", { reason: "format", type });
    return null;
  }
  if (!COMPRESSIBLE_TYPES.has(type)) {
    telemetry?.emit(sessionId, "upload.compression.skipped", { reason: "unsupported_type", type });
    return null;
  }
  if (file.size < MIN_COMPRESS_SIZE) {
    telemetry?.emit(sessionId, "upload.compression.skipped", { reason: "too_small", size: file.size });
    return null;
  }
  const networkType = getNetworkEffectiveType();
  const defaultProfile = { maxWidth: 3840, maxHeight: 3840, quality: 0.85, maxSizeMB: 5 };
  const networkProfile = NETWORK_PROFILES[networkType] ?? defaultProfile;
  const config = {
    maxWidth: userConfig?.maxWidth ?? networkProfile.maxWidth,
    maxHeight: userConfig?.maxHeight ?? networkProfile.maxHeight,
    quality: userConfig?.quality ?? networkProfile.quality,
    maxSizeMB: userConfig?.maxSizeMB ?? networkProfile.maxSizeMB
  };
  telemetry?.emit(sessionId, "upload.compression.started", {
    original_size: file.size,
    network: networkType,
    target_quality: config.quality
  });
  try {
    const imageCompression = await loadImageCompression();
    if (!imageCompression) {
      telemetry?.emit(sessionId, "upload.compression.skipped", { reason: "library_unavailable" });
      return null;
    }
    const compressed = await imageCompression(file, {
      maxSizeMB: config.maxSizeMB,
      maxWidthOrHeight: Math.max(config.maxWidth, config.maxHeight),
      initialQuality: config.quality,
      useWebWorker: true,
      fileType: type === "image/png" ? "image/webp" : void 0
    });
    if (compressed.size >= file.size * 0.95) {
      telemetry?.emit(sessionId, "upload.compression.skipped", {
        reason: "no_size_reduction",
        original_size: file.size,
        compressed_size: compressed.size
      });
      return null;
    }
    telemetry?.emit(sessionId, "upload.compression.completed", {
      original_size: file.size,
      compressed_size: compressed.size,
      ratio: (compressed.size / file.size).toFixed(2)
    });
    return compressed;
  } catch (err) {
    telemetry?.emit(sessionId, "upload.compression.skipped", {
      reason: "error",
      error: err instanceof Error ? err.message : "Unknown compression error"
    });
    return null;
  }
}
var cachedImport = null;
async function loadImageCompression() {
  if (cachedImport === false) return null;
  if (cachedImport) return cachedImport;
  try {
    const mod = await Function('return import("browser-image-compression")')();
    cachedImport = mod.default || mod;
    return cachedImport;
  } catch {
    cachedImport = false;
    return null;
  }
}
function getNetworkEffectiveType() {
  if (typeof navigator !== "undefined" && "connection" in navigator) {
    const conn = navigator.connection;
    return conn?.effectiveType || "4g";
  }
  return "4g";
}
export {
  maybeCompressImage
};
