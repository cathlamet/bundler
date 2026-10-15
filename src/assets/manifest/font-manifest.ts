import { FontAsset, FontAssetStyle } from '@cathlamet/library';

import { AssetManifest, AssetManifestContext, AssetManifestJson, AssetManifestType } from './asset-manifest';
import { SlugGenerator } from '../slug/slug-generator';
import { AssetManifestLoader } from './asset-manifest-factory';
import { AssetRegistry } from '../../bundler/asset-registry';


export interface FontManifestContext extends AssetManifestContext {
  buffer: Uint8Array;
}

export enum FontManifestStyle {
  normal = "normal"
}

const ASSET_STYLE_BY_STYLE = {
  [FontManifestStyle.normal]: FontAssetStyle.normal
};

export interface FontManifestJson extends AssetManifestJson {
  /**
   * Type of manifest
   */
  type: AssetManifestType.font;

  /**
   * Flag to indicate font is enabled
   */
  enabled?: boolean;

  /**
   * Path of font asset relative manifest json
   */
  font: string;

  /**
   * Name of font
   * @example "Courier New"
   */
  name: string;

  /**
   * Weight of font
   * @default 400
   */
  weight?: number;

  /**
   * Style of font
   * @default "normal"
   */
  style?: FontManifestStyle;
}

export class FontManifest extends AssetManifest<FontManifestJson, FontManifestContext, FontAsset> {
  enabled: boolean;
  fontPath: string;
  name: string;
  weight: number;
  style: FontManifestStyle;

  constructor (json: FontManifestJson) {
    super(json);
    this.enabled = json.enabled ?? false;
    this.fontPath = json.font;
    this.name = json.name;
    this.weight = json.weight ?? 400;
    this.style = json.style ?? FontManifestStyle.normal;
  }

  async load (loader: AssetManifestLoader): Promise<FontManifestContext> {
    return {
      buffer: await loader.load(this.fontPath)
    };
  }

  async compile (registry: AssetRegistry, context: FontManifestContext): Promise<FontAsset> {
    const generator = new SlugGenerator();
    const sluggish = await generator.generateFromBuffer(context.buffer.buffer);
    const sluggishBuffer = new Uint8Array(generator.exportSluggish(sluggish));

    return new FontAsset({
      assetId: registry.register(this.id),
      payload: sluggishBuffer,
      weight: this.weight,
      style: ASSET_STYLE_BY_STYLE[this.style] ?? FontAssetStyle.normal,
    });
  }
}
