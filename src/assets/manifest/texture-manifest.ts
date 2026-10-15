import sharp from 'sharp';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { TextureAsset } from '@cathlamet/library';

import { AssetManifest, AssetManifestContext, AssetManifestJson, AssetManifestType } from './asset-manifest';
import { AssetRegistry } from '../../bundler/asset-registry';
import { AssetManifestLoader } from './asset-manifest-factory';


export interface TextureManifestContext extends AssetManifestContext {
  opacityBuffer?: Uint8Array | Uint16Array | Float32Array;
  opacityFormat?: TextureManifestFormat;
  albedoBuffer?: Uint8Array | Uint16Array | Float32Array;
  albedoFormat?: TextureManifestFormat;

  normalBuffer?: Uint8Array | Uint16Array | Float32Array;
  normalFormat?: TextureManifestFormat;

  occlusionBuffer?: Uint8Array | Uint16Array | Float32Array;
  occlusionFormat?: TextureManifestFormat;
  roughnessBuffer?: Uint8Array | Uint16Array | Float32Array;
  roughnessFormat?: TextureManifestFormat;
  metalnessBuffer?: Uint8Array | Uint16Array | Float32Array;
  metalnessFormat?: TextureManifestFormat;
  bumpBuffer?: Uint8Array | Uint16Array | Float32Array;
  bumpFormat?: TextureManifestFormat;
}

export enum TextureManifestFormat {
  exr = 3,
  png = 2,
  raw = 1,
}

export enum TextureManifestChannelPurpose {
  albedo = 'albedo',
  bump = 'bump',
  metalness = 'metalness',
  normal = 'normal',
  occlusion = 'occlusion',
  opacity = 'opacity',
  roughness = 'roughness'
}

const ALLOWED_CHANNEL_GROUPS: Set<TextureManifestChannelPurpose>[] = [
  new Set([
    TextureManifestChannelPurpose.albedo,
    TextureManifestChannelPurpose.opacity
  ]),
  new Set([
    TextureManifestChannelPurpose.occlusion,
    TextureManifestChannelPurpose.metalness,
    TextureManifestChannelPurpose.roughness,
    TextureManifestChannelPurpose.bump
  ]),
  new Set([
    TextureManifestChannelPurpose.normal
  ])
];

function hasCompatibleChannels (channels: TextureManifestChannel[]): boolean {
  const purposes = channels.map(c => c.purpose);
  if (!purposes || purposes.length === 0) {
    return false;
  }

  const uniquePassed = new Set(purposes);
  if (uniquePassed.size !== purposes.length) {
    return false;
  }

  for (const group of ALLOWED_CHANNEL_GROUPS) {
    if (uniquePassed.size > group.size) {
      continue;
    }

    let isSubset = true;
    for (const channel of uniquePassed) {
      if (!group.has(channel)) {
        isSubset = false;
        break;
      }
    }

    if (isSubset) {
      return true;
    }
  }

  return false;
}

export interface TextureManifestChannel {
  /**
   * Purpose of texture; defines channels
   */
  purpose: TextureManifestChannelPurpose;

  /**
   * Path to texture asset relative manifest json
   */
  path: string;
}

export interface TextureManifestJson extends AssetManifestJson {
  /**
   * Type of manifest
   */
  type: AssetManifestType.texture;

  /**
   * Target width of texture asset
   */
  targetWidth: number;

  /**
   * Target height of texture asset
   */
  targetHeight: number;

  /**
   * Channels of texture when compiled from other textures
   */
  channels?: TextureManifestChannel[];
}

function extensionFormat (filePath: string): TextureManifestFormat {
  const extension = (filePath.slice(((filePath.lastIndexOf(".") - 1) >>> 0) + 2)).toLowerCase();
  if (extension === 'exr') {
    return TextureManifestFormat.exr;
  }
  else if (extension === 'png') {
    return TextureManifestFormat.png;
  }
  else {
    throw new Error('Only PNG or EXR textures are supported');
  }
}

async function parsePath (payload: Uint8Array, format: TextureManifestFormat, targetWidth: number, targetHeight: number, purpose: TextureManifestChannelPurpose): Promise<Uint8Array | Uint16Array | Float32Array | undefined> {
  if (format === TextureManifestFormat.exr) {
    const buffer = Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
    const loader = new EXRLoader();
    // loader.setDataType(1015); // FloatType, 1016 for HalfFloatType
    return loader.parse(buffer.buffer as ArrayBuffer).data as Float32Array | Uint16Array;
  }
  else if (format === TextureManifestFormat.png) {
    const channels = purpose === TextureManifestChannelPurpose.normal || purpose === TextureManifestChannelPurpose.albedo ? 4 : 1;
    const depth = purpose === TextureManifestChannelPurpose.normal ? 'ushort' : 'uchar';

    let factory = sharp(Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength)).resize(targetWidth, targetHeight, { fit: 'fill' });
    if (channels > 1) {
      factory = factory.ensureAlpha();
    }
    else {
      factory = factory.grayscale().extractChannel('red');
    }

    const buffer = await factory.raw({ depth: depth }).toBuffer();
    if (depth === 'ushort') {
      return new Uint16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
    }
    return buffer;
  }
  else {
    return undefined;
  }
}

export class TextureManifest extends AssetManifest<TextureManifestJson, TextureManifestContext, TextureAsset> {
  targetWidth: number;
  targetHeight: number;
  channels: TextureManifestChannel[];

  constructor (json: TextureManifestJson) {
    super(json);
    this.targetWidth = json.targetWidth;
    this.targetHeight = json.targetHeight;
    this.channels = json.channels ?? [];

    if (!this.channels.length) {
      throw new Error(`Texture ${json.id} must have at least one channel`);
    }
    else if (!hasCompatibleChannels(this.channels)) {
      throw new Error(`Texture ${json.id} has incompatible channels`);
    }
  }

  async load (loader: AssetManifestLoader): Promise<TextureManifestContext> {
    const channelByPurpose: Map<TextureManifestChannelPurpose, TextureManifestChannel> = new Map();
    for (const channel of this.channels) {
      channelByPurpose.set(channel.purpose, channel);
    }

    const opacityPath = channelByPurpose.get(TextureManifestChannelPurpose.opacity)?.path;
    const opacityFormat = opacityPath ? extensionFormat(opacityPath) : undefined;
    const opacity = opacityPath && opacityFormat ? await parsePath(await loader.load(opacityPath), opacityFormat, this.targetWidth, this.targetHeight, TextureManifestChannelPurpose.opacity) : undefined;

    const albedoPath = channelByPurpose.get(TextureManifestChannelPurpose.albedo)?.path;
    const albedoFormat = albedoPath ? extensionFormat(albedoPath) : undefined;
    const albedo = albedoPath && albedoFormat ? await parsePath(await loader.load(albedoPath), albedoFormat, this.targetWidth, this.targetHeight, TextureManifestChannelPurpose.albedo) : undefined;

    const normalPath = channelByPurpose.get(TextureManifestChannelPurpose.normal)?.path;
    const normalFormat = normalPath ? extensionFormat(normalPath) : undefined;
    const normal = normalPath && normalFormat ? await parsePath(await loader.load(normalPath), normalFormat, this.targetWidth, this.targetHeight, TextureManifestChannelPurpose.normal) : undefined;

    const occlusionPath = channelByPurpose.get(TextureManifestChannelPurpose.occlusion)?.path;
    const occlusionFormat = occlusionPath ? extensionFormat(occlusionPath) : undefined;
    const occlusion = occlusionPath && occlusionFormat ? await parsePath(await loader.load(occlusionPath), occlusionFormat, this.targetWidth, this.targetHeight, TextureManifestChannelPurpose.occlusion) : undefined;

    const roughnessPath = channelByPurpose.get(TextureManifestChannelPurpose.roughness)?.path;
    const roughnessFormat = roughnessPath ? extensionFormat(roughnessPath) : undefined;
    const roughness = roughnessPath && roughnessFormat ? await parsePath(await loader.load(roughnessPath), roughnessFormat, this.targetWidth, this.targetHeight, TextureManifestChannelPurpose.roughness) : undefined;

    const metalnessPath = channelByPurpose.get(TextureManifestChannelPurpose.metalness)?.path;
    const metalnessFormat = metalnessPath ? extensionFormat(metalnessPath) : undefined;
    const metalness = metalnessPath && metalnessFormat ? await parsePath(await loader.load(metalnessPath), metalnessFormat, this.targetWidth, this.targetHeight, TextureManifestChannelPurpose.metalness) : undefined;

    const bumpPath = channelByPurpose.get(TextureManifestChannelPurpose.bump)?.path;
    const bumpFormat = bumpPath ? extensionFormat(bumpPath) : undefined;
    const bump = bumpPath && bumpFormat ? await parsePath(await loader.load(bumpPath), bumpFormat, this.targetWidth, this.targetHeight, TextureManifestChannelPurpose.bump) : undefined;

    return {
      opacityBuffer: opacity,
      opacityFormat: opacityFormat,
      albedoBuffer: albedo,
      albedoFormat: albedoFormat,
      normalBuffer: normal,
      normalFormat: normalFormat,
      occlusionBuffer: occlusion,
      occlusionFormat: occlusionFormat,
      roughnessBuffer: roughness,
      roughnessFormat: roughnessFormat,
      metalnessBuffer: metalness,
      metalnessFormat: metalnessFormat,
      bumpBuffer: bump,
      bumpFormat: bumpFormat,
    };
  }

  async compile (registry: AssetRegistry, context: TextureManifestContext): Promise<TextureAsset> {
    const zeroChannel = Buffer.alloc(this.targetWidth * this.targetHeight, 0);

    if (context.opacityBuffer && context.albedoBuffer && context.opacityFormat === TextureManifestFormat.png && context.albedoFormat == TextureManifestFormat.png) {
      return new TextureAsset({
        assetId: registry.register(this.id),
        payload: await sharp(context.albedoBuffer, { raw: { width: this.targetWidth, height: this.targetHeight, channels: 4 } })
          .removeAlpha()
          .joinChannel(Buffer.from(context.opacityBuffer.buffer, context.opacityBuffer.byteOffset, context.opacityBuffer.byteLength), { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .toBuffer(),
        width: this.targetWidth,
        height: this.targetHeight,
      });
    }
    else if (context.opacityBuffer) {
      return new TextureAsset({
        assetId: registry.register(this.id),
        payload: context.opacityFormat == TextureManifestFormat.png ? await sharp(zeroChannel, { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .joinChannel(zeroChannel, { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .joinChannel(zeroChannel, { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .joinChannel(Buffer.from(context.opacityBuffer.buffer, context.opacityBuffer.byteOffset, context.opacityBuffer.byteLength), { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .toBuffer() : context.opacityBuffer,
        width: this.targetWidth,
        height: this.targetHeight,
      });
    }
    else if (context.albedoBuffer) {
      return new TextureAsset({
        assetId: registry.register(this.id),
        payload: context.albedoBuffer,
        width: this.targetWidth,
        height: this.targetHeight,
      });
    }

    if (context.normalBuffer) {
      return new TextureAsset({
        assetId: registry.register(this.id),
        payload: context.normalBuffer,
        width: this.targetWidth,
        height: this.targetHeight,
      });
    }

    if (!context.occlusionBuffer && !context.roughnessBuffer && !context.metalnessBuffer && !context.bumpBuffer) {
      throw new Error(`Nothing to combine in texture ${this.id}`);
    }

    const channelFormats = new Set();
    for (const format of [context.occlusionFormat, context.roughnessFormat, context.metalnessFormat, context.bumpFormat]) {
      if (format) {
        channelFormats.add(format);
      }
    }

    if (channelFormats.size !== 1) {
      throw new Error(`Only one format can be combined in texture ${this.id}`);
    }
    else if (channelFormats.has(TextureManifestFormat.png)) {
      return new TextureAsset({
        assetId: registry.register(this.id),
        payload: await sharp(context.occlusionBuffer ?? zeroChannel, { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .joinChannel((context.roughnessBuffer ?? zeroChannel) as Buffer, { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .joinChannel((context.metalnessBuffer ?? zeroChannel) as Buffer, { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .joinChannel((context.bumpBuffer ?? zeroChannel) as Buffer, { raw: { width: this.targetWidth, height: this.targetHeight, channels: 1 } })
          .toBuffer(),
        width: this.targetWidth,
        height: this.targetHeight,
      });
    }
    else {
      throw new Error(`Unable to create combined texture ${this.id}`);
    }
  }
}
