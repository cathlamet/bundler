/**
 * Type definitions for the KhronosGroup KTX-Software v5.0.0-rc2 (libktx.wasm) wrapper.
 *
 * Credit: https://github.com/ImDxni/LightLoad
 */

export interface KtxCreateInfoInstance {
  glInternalformat: number;
  vkFormat: unknown; // expects the Embind enum object, not an integer
  baseWidth: number;
  baseHeight: number;
  baseDepth: number;
  numDimensions: number;
  numLevels: number;
  numLayers: number;
  numFaces: number;
  isArray: boolean;
  generateMipmaps: boolean;
  [key: string]: unknown;
}

export interface KtxBasisParamsInstance {
  codec: unknown; // expects the Embind enum object, not an integer
  qualityLevel: number;
  uastcFlags: number;
  threadCount: number;
  etc1sCompressionLevel: number;
  normalMap: boolean;
  [key: string]: unknown;
}

export interface KtxTextureInstance {
  readonly vkFormat: unknown;
  readonly supercompressScheme: unknown;

  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly dataSize: number;
  readonly isSrgb: boolean;
  readonly isHDR: boolean;
  readonly isTranscodable: boolean;
  readonly needsTranscoding: boolean;
  readonly numComponents: number;
  readonly orientation: string;
  readonly colorModel: number;
  readonly transferFunction: number;
  readonly oetf: number;
  readonly primaries: number;

  setImageFromMemory (level: number, layer: number, faceSlice: number, data: Uint8Array): unknown;
  compressBasis (params: KtxBasisParamsInstance): unknown;
  writeToMemory (): Uint8Array;
  createCopy (): KtxTextureInstance;
  delete (): void;

  addKVPairString (key: string, value: string): void;
  addKVPairByte (key: string, value: Uint8Array): void;
  deleteKVPair (key: string): void;

  getImage (level: number, layer: number, faceSlice: number): Uint8Array;
  glUpload (): unknown;
  decodeAstc (): unknown;
  transcodeBasis (targetFormat: number, flags: number): unknown;
  compressAstc (quality: number): unknown;
  deflateZstd (level: number): unknown;
  deflateZLIB (level: number): unknown;
}

export interface KtxModule {
  texture: new (createInfo: KtxCreateInfoInstance, storage: unknown) => KtxTextureInstance;
  textureCreateInfo: new () => KtxCreateInfoInstance;
  basisParams: new () => KtxBasisParamsInstance;
  TextureCreateStorageEnum: Record<string, unknown>;
  VkFormat: Record<string, unknown>;
  basis_codec: Record<string, unknown>;
  ErrorCode: Record<string, unknown>;
  [key: string]: unknown;
}

export type KtxFactory = (config?: { locateFile?: (filename: string) => string }) => Promise<KtxModule>;
