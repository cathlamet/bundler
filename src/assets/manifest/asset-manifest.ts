import { Asset } from '@cathlamet/library';

import { AssetManifestLoader } from './asset-manifest-factory';
import { AssetRegistry } from '../../bundler/asset-registry';


export interface AssetManifestContext {
  // extended with data loaded by asset
}

export enum AssetManifestType {
  font = 'font',
  material = 'material',
  model = 'model',
  texture = 'texture',
}

export interface AssetManifestJson {
  /**
   * Development ID for asset
   * @example "font.couriernew"
   */
  id: string;

  /**
   * Type of asset
   */
  type: AssetManifestType;

  /**
   * Path to file with license for asset
   */
  license?: string;
}

export abstract class AssetManifest<T extends AssetManifestJson, C extends AssetManifestContext, A extends Asset> {
  id: string;

  constructor ({ id }: T) {
    this.id = id;
  }

  abstract load (loader: AssetManifestLoader): Promise<C>;
  abstract compile (registry: AssetRegistry, context: C): Promise<A>;
}
