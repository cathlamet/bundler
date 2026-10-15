import { MaterialAsset } from '@cathlamet/library';

import { AssetManifest, AssetManifestContext, AssetManifestJson, AssetManifestType } from './asset-manifest';
import { AssetManifestLoader } from './asset-manifest-factory';
import { AssetRegistry } from '../../bundler/asset-registry';


export interface MaterialManifestJson extends AssetManifestJson {
  /**
   * Type of manifest
   */
  type: AssetManifestType.material;

  /**
   * ID of albedo (color) texture for material
   */
  albedoTextureId: string;

  /**
   * ID of normal texture for material
   */
  normalTextureId: string;

  /**
   * ID of bump texture for material
   */
  bumpTextureId?: string;

  /**
   * ID of occlusion texture for material
   */
  occlusionTextureId?: string;

  /**
   * ID of roughness texture for material
   */
  roughnessTextureId?: string;

  /**
   * Fixed roughness for material
   */
  roughness?: number;

    /**
   * ID of metalness texture for material
   */
  metalnessTextureId?: string;

  /**
   * Metalness of material
   */
  metalness?: number;
}

interface TextureAssetIds {
  albedoAssetId?: number;
  normalAssetId?: number;
  bumpAssetId?: number;
  occlusionAssetId?: number;
  roughnessAssetId?: number;
  metalnessAssetId?: number;
}

export class MaterialManifest extends AssetManifest<MaterialManifestJson, AssetManifestContext, MaterialAsset> {
  /**
   * ID of albedo (color) texture for material
   */
  albedoTextureId?: string;

  /**
   * ID of normal texture for material
   */
  normalTextureId?: string;

  /**
   * ID of bump texture for material; packed into alpha channel of ORMB texture
   */
  bumpTextureId?: string;

  /**
   * ID of occlusion texture for material; packed into red channel of ORMB texture
   */
  occlusionTextureId?: string;

  /**
   * ID of roughness texture for material; packed into green channel of ORMB texture
   */
  roughnessTextureId?: string;

  /**
   * Fixed roughness for material
   */
  roughness: number;

    /**
   * ID of metalness texture for material; packed into blue channel of ORMB texture
   */
  metalnessTextureId?: string;

  /**
   * Metalness of material
   */
  metalness: number;

  constructor (json: MaterialManifestJson) {
    super(json);
    this.albedoTextureId = json.albedoTextureId;
    this.normalTextureId = json.normalTextureId;
    this.bumpTextureId = json.bumpTextureId;
    this.occlusionTextureId = json.occlusionTextureId;
    this.roughnessTextureId = json.roughnessTextureId;
    this.roughness = json.roughness ?? 1.0;
    this.metalnessTextureId = json.metalnessTextureId;
    this.metalness = json.metalness ?? 0.0;
  }

  async load (_loader: AssetManifestLoader): Promise<AssetManifestContext> {
    return {};
  }

  async compile (registry: AssetRegistry, _context: AssetManifestContext): Promise<MaterialAsset> {
    const assetIds: TextureAssetIds = {};
    for (const [type, textureId] of [
      ['albedoAssetId', this.albedoTextureId],
      ['normalAssetId', this.normalTextureId],
      ['bumpAssetId', this.bumpTextureId],
      ['occlusionAssetId', this.occlusionTextureId],
      ['roughnessAssetId', this.roughnessTextureId],
      ['metalnessAssetId', this.metalnessTextureId],
    ] as Array<[keyof TextureAssetIds, string | undefined]>) {
      if (textureId) {
        const assetId = registry.assetId(textureId) ?? 0;
        if (!assetId) {
          throw new Error(`Unable to find material texture ${this.id}`);
        }
        assetIds[type] = assetId;
      }
    }

    return new MaterialAsset({
      assetId: registry.register(this.id),
      albedoAssetId: assetIds.albedoAssetId ?? 0,
      normalAssetId: assetIds.normalAssetId ?? 0,
      bumpAssetId: assetIds.bumpAssetId ?? 0,
      occlusionAssetId: assetIds.occlusionAssetId ?? 0,
      roughnessAssetId: assetIds.roughnessAssetId ?? 0,
      roughness: this.roughness,
      metalnessAssetId: assetIds.metalnessAssetId ?? 0,
      metalness: this.metalness,
    });
  }
}
