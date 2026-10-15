import createKtxModule from '#libktx-wasm';
import { KtxCreateInfoInstance, KtxModule } from '../../types/ktx2';

/**
 * Credit before extensions: https://github.com/ImDxni/LightLoad
 */

/** Extracts the numeric value from an Embind enum {value:N} or a plain number. */
function enumNum (v: unknown, fallback = 0): number {
  if (typeof v === 'number') return v
  if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
    return Number((v as Record<string, unknown>).value)
  }
  return fallback
}

function allocateTypedArray <T extends Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array> (data: T, length: number): T {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) {
    return Buffer.alloc(length) as unknown as T;
  }

  if (data instanceof Uint8ClampedArray) {
    return new Uint8ClampedArray(length) as unknown as T;
  }
  else if (data instanceof Uint16Array) {
    return new Uint16Array(length) as unknown as T;
  }
  else if (data instanceof Float32Array) {
    return new Float32Array(length) as unknown as T;
  }
  else {
    return new Uint8Array(length) as unknown as T;
  }
}

function generateMipChain <T extends Uint8Array | Uint8ClampedArray | Uint16Array | Float32Array>(data: T, width: number, height: number): T[] {
  const levels: T[] = [data];
  const isFloat = data instanceof Float32Array;
  const isShort = data instanceof Uint16Array;

  let cw = width;
  let ch = height;
  let currentData = data;

  while (cw > 1 || ch > 1) {
    const dw = Math.max(1, cw >> 1);
    const dh = Math.max(1, ch >> 1);
    const dst = allocateTypedArray(data, dw * dh * 4);

    for (let y = 0; y < dh; y++) {
      const y0 = Math.min(y * 2, ch - 1);
      const y1 = Math.min(y * 2 + 1, ch - 1);

      for (let x = 0; x < dw; x++) {
        const x0 = Math.min(x * 2, cw - 1);
        const x1 = Math.min(x * 2 + 1, cw - 1);

        const p00 = (y0 * cw + x0) * 4;
        const p01 = (y0 * cw + x1) * 4;
        const p10 = (y1 * cw + x0) * 4;
        const p11 = (y1 * cw + x1) * 4;

        const a00 = currentData[p00 + 3];
        const a01 = currentData[p01 + 3];
        const a10 = currentData[p10 + 3];
        const a11 = currentData[p11 + 3];
        const aSum = a00 + a01 + a10 + a11;

        const d = (y * dw + x) * 4;

        // FIX: For floats, exact equality aSum === 0 might fail due to precision,
        // causing division by tiny numbers and generating Infs which crash BasisU.
        const isAlphaZero = isFloat ? (aSum < 1e-6) : (aSum === 0);

        if (isAlphaZero) {
          const rSum = currentData[p00] + currentData[p01] + currentData[p10] + currentData[p11];
          const gSum = currentData[p00 + 1] + currentData[p01 + 1] + currentData[p10 + 1] + currentData[p11 + 1];
          const bSum = currentData[p00 + 2] + currentData[p01 + 2] + currentData[p10 + 2] + currentData[p11 + 2];

          if (isFloat) {
            dst[d]     = rSum / 4;
            dst[d + 1] = gSum / 4;
            dst[d + 2] = bSum / 4;
          } else if (isShort) {
            // High-precision rounding for 16-bit integer boundaries
            dst[d]     = Math.round(rSum / 4);
            dst[d + 1] = Math.round(gSum / 4);
            dst[d + 2] = Math.round(bSum / 4);
          } else {
            dst[d]     = rSum >> 2;
            dst[d + 1] = gSum >> 2;
            dst[d + 2] = bSum >> 2;
          }
          dst[d + 3] = 0;
        } else {
          const rWeighted = currentData[p00] * a00 + currentData[p01] * a01 + currentData[p10] * a10 + currentData[p11] * a11;
          const gWeighted = currentData[p00 + 1] * a00 + currentData[p01 + 1] * a01 + currentData[p10 + 1] * a10 + currentData[p11 + 1] * a11;
          const bWeighted = currentData[p00 + 2] * a00 + currentData[p01 + 2] * a01 + currentData[p10 + 2] * a10 + currentData[p11 + 2] * a11;

          dst[d]     = isFloat ? rWeighted / aSum : Math.round(rWeighted / aSum);
          dst[d + 1] = isFloat ? gWeighted / aSum : Math.round(gWeighted / aSum);
          dst[d + 2] = isFloat ? bWeighted / aSum : Math.round(bWeighted / aSum);

          // Fixed alpha scaling for short vs byte profiles
          if (isFloat) {
            dst[d + 3] = aSum / 4;
          } else if (isShort) {
            dst[d + 3] = Math.round(aSum / 4);
          } else {
            dst[d + 3] = (aSum + 2) >> 2;
          }
        }
      }
    }

    levels.push(dst);
    currentData = dst;
    cw = dw;
    ch = dh;
  }

  return levels;
}

/** Returns true if an Embind result means success (void, 0, or enum {value:0}). */
function isKtxSuccess (result: unknown): boolean {
  if (result === undefined || result === null) return true
  if (result === 0) return true
  if (typeof result === 'object') {
    const val = (result as Record<string, unknown>).value
    return val === 0 || val === undefined
  }
  return false
}

export async function encodeTextureToKTX2(
  ktx: KtxModule,
  data: (Uint8ClampedArray | Uint8Array | Uint16Array | Float32Array)[],
  width: number,
  height: number,
  format: 'etc1s' | 'uastc',
  quality: number,
): Promise<Uint8Array> {
  // Embind enums are {value:N} objects — the constructor expects them as such
  const storageEnum = ktx.TextureCreateStorageEnum as Record<string, unknown>;
  const storageEnumObj = storageEnum.ALLOC_STORAGE ?? storageEnum.alloc;

  const isUint16 = data[0] instanceof Uint16Array;
  const isFloat32 = data[0] instanceof Float32Array;

  const vkEnum = ktx.VkFormat as Record<string, unknown>;
  const vkFormatFloat32 = vkEnum.VK_FORMAT_R32G32B32A32_SFLOAT ?? vkEnum.R32G32B32A32_SFLOAT;
  const vkFormatUint16 = vkEnum.VK_FORMAT_R16G16B16A16_UNORM ?? vkEnum.R16G16B16A16_UNORM;
  const vkFormatUint8 = vkEnum.VK_FORMAT_R8G8B8A8_UNORM ?? vkEnum.R8G8B8A8_UNORM;

  // Enum fields (vkFormat) need the enum object, not an integer
  const ci = new ktx.textureCreateInfo() as KtxCreateInfoInstance;
  ci.glInternalformat = 0;
  (ci as Record<string, unknown>).vkFormat = isFloat32 ? vkFormatFloat32 : isUint16 ? vkFormatUint16 : vkFormatUint8;
  ci.baseWidth = width;
  ci.baseHeight = height;
  ci.baseDepth = 1;
  ci.numDimensions = 2;
  ci.numLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
  ci.numLayers = data.length;
  ci.numFaces = 1;
  ci.isArray = true;
  ci.generateMipmaps = false;

  const texture = new ktx.texture(ci, storageEnumObj);

  try {
    for (let layerIndex = 0; layerIndex < data.length; layerIndex++) {
      const mips = generateMipChain(data[layerIndex], width, height);
      for (let level = 0; level < mips.length; level++) {
        const mipData = new Uint8Array(mips[level].buffer, mips[level].byteOffset, mips[level].byteLength);
        const setResult = texture.setImageFromMemory(level, layerIndex, 0, mipData);
        if (!isKtxSuccess(setResult)) {
          throw new Error(`setImageFromMemory[${level}]: ${enumNum(setResult, -1)}`);
        }
      }
    }

    const params = new ktx.basisParams();
    if (format === 'etc1s') {
      params.codec = (ktx.basis_codec.ETC1S as any).value;
    }
    else if (format === 'uastc') {
      params.codec = (isUint16 || isFloat32 ? ktx.basis_codec.UASTC_HDR_4x4 : ktx.basis_codec.UASTC_LDR_4x4 as any).value;
      params.uastcFlags = 2;
    }
    params.qualityLevel = Math.max(1, Math.min(255, quality));
    params.threadCount = 1;

    const compResult = texture.compressBasis(params);
    if (!isKtxSuccess(compResult)) {
      throw new Error(`compressBasis: ${enumNum(compResult, -1)}`);
    }

    const result = texture.writeToMemory();
    if (!result || result.byteLength === 0) {
      throw new Error('writeToMemory returned empty');
    }

    return result.slice(0)
  }
  finally {
    texture.delete()
  }
}

let ktxModule: KtxModule | null = null;

export async function encodeTextures(
  width: number,
  height: number,
  layers: (Uint8Array | Uint16Array | Float32Array)[],
): Promise<Uint8Array> {
  ktxModule ??= await createKtxModule();
  return await encodeTextureToKTX2(ktxModule as KtxModule, layers, width, height, 'uastc', 255);
}
