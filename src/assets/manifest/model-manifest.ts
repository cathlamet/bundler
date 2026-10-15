import { ModelAsset } from '@cathlamet/library';

import { AssetManifestContext, AssetManifest, AssetManifestJson, AssetManifestType } from "./asset-manifest";
import { AssetManifestLoader } from './asset-manifest-factory';
import { AssetRegistry } from '../../bundler/asset-registry';


export interface ModelManifestContext extends AssetManifestContext {
  buffer: Uint8Array;
}

export interface ModelManifestJson extends AssetManifestJson {
  /**
   * Type of manifest
   */
  type: AssetManifestType.model;

  /**
   * Path of model asset relative manifest json
   */
  model: string;

  // materials
  // meshes
  // skeleton
  // animations
}

// const GLTFLoader = await import("three/addons/loaders/GLTFLoader.js");
// const GLTFExporter = await import("three/addons/exporters/GLTFExporter.js");

// const loader = new GLTFLoader.GLTFLoader();
// const gltf = await loader.parseAsync(source, path.dirname(filePath))

// const exporter = new GLTFExporter.GLTFExporter();

// exporter.parseAsync(gltf.scene, {
//   animations: gltf.animations,
//   binary: true,
// });

export class ModelManifest extends AssetManifest<ModelManifestJson, ModelManifestContext, ModelAsset> {
  modelPath: string;

  constructor (json: ModelManifestJson) {
    super(json);
    this.modelPath = json.model;
  }

  async load (loader: AssetManifestLoader): Promise<ModelManifestContext> {
    return {
      buffer: await loader.load(this.modelPath)
    };
  }

  async compile (registry: AssetRegistry, context: ModelManifestContext): Promise<ModelAsset> {
    if (!context.buffer) {
      throw new Error("Couldn't load model");
    }

    return new ModelAsset({
      assetId: registry.register(this.id),
      payload: context.buffer,
    });
  }

}
