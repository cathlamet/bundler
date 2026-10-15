import { Asset, TextureAsset, TextureCompressedAsset, TextureCompressedLayerAsset, TextureManager } from "@cathlamet/library";

import { AssetRegistry } from "./asset-registry";
import { encodeTextures } from "../assets/libktx/encoder";
import { AssetManifest, AssetManifestContext } from "../assets/manifest/asset-manifest";
import { AssetManifestLoader, parseManifestJson } from "../assets/manifest/asset-manifest-factory";
import { FontManifest } from "../assets/manifest/font-manifest";
import { MaterialManifest } from "../assets/manifest/material-manifest";
import { ModelManifest } from "../assets/manifest/model-manifest";
import { TextureManifest } from "../assets/manifest/texture-manifest";


export interface ConfigurationOptions {
  name: string;
  assets?: string[];
}

type TextureGroup = [[number, number, number], TextureAsset[]];

function groupTextures (textures: TextureAsset[]): TextureGroup[] {
  const groups = new Map<string, TextureGroup>();

  for (const texture of textures) {
    const key = `${texture.width}_${texture.height}_${texture.depth}`;
    let entry = groups.get(key);

    if (!entry) {
      entry = [[texture.width, texture.height, texture.depth], []];
      groups.set(key, entry);
    }

    entry[1].push(texture);
  }

  return Array.from(groups.values());
}

export class Configuration {
  name: string;

  missingAssetPaths: string[];

  manifestById: Map<string, AssetManifest<any, any, any>> = new Map();
  contextById: Map<string, AssetManifestContext> = new Map();

  constructor (name: string, missingAssetPaths: string[], manifests: Array<[AssetManifest<any, any, any>, AssetManifestContext]>) {
    this.name = name;
    this.missingAssetPaths = missingAssetPaths;

    for (const manifest of manifests) {
      this.manifestById.set(manifest[0].id, manifest[0]);
      this.contextById.set(manifest[0].id, manifest[1]);
    }
  }

  async compile (registry: AssetRegistry): Promise<[Map<number, string>, Map<number, Asset>]> {
    const manifestIdByAssetId: Map<number, string> = new Map();
    const assetByAssetId: Map<number, Asset> = new Map();

    const MANIFEST_ORDER = [FontManifest, TextureManager, MaterialManifest, ModelManifest];
    const manifestPriority = (item: AssetManifest<any, any, any>) => {
      const index = MANIFEST_ORDER.findIndex(cls => item instanceof cls);
      return index === -1 ? Infinity : index;
    };

    // TODO: sort by dependency in future
    const manifests = Array.from(this.manifestById.values());
    manifests.sort((lhs, rhs) => manifestPriority(lhs) - manifestPriority(rhs));

    const textures: TextureAsset[] = [];
    for (const manifest of this.manifestById.values()) {
      const context = this.contextById.get(manifest.id);
      if (!context) {
        console.error('Manifest doesnt have context');
        continue;
      }

      const asset = await manifest.compile(registry, context);
      manifestIdByAssetId.set(asset.assetId, manifest.id);
      assetByAssetId.set(asset.assetId, asset);

      if (manifest instanceof TextureManifest) {
        textures.push(asset);
      }
    }

    const textureGroups = groupTextures(textures);
    console.log(`Compressing ${textures.length} textures into ${textureGroups.length} groups with layers`);

    let compressedTextures = 0;
    for (const [[width, height, _depth], textures] of textureGroups) {
      const chunks = [];
      for (let i = 0; i < textures.length; i += 255) {
          chunks.push(textures.slice(i, i + 255));
      }

      for (const chunk of chunks) {
        const textureId = `texture.compressed.${++compressedTextures}`;
        const textureAssetId = registry.register(textureId);

        const layerPayloads = [];
        const layerAssetIds = [];
        for (let layerIndex = 0; layerIndex < chunk.length; layerIndex++) {
          const layer = chunk[layerIndex];
          layerPayloads.push(layer.payload);
          layerAssetIds.push(layer.assetId);

          assetByAssetId.set(layer.assetId, new TextureCompressedLayerAsset({
            assetId: layer.assetId,
            textureAssetId: textureAssetId,
            textureLayer: layerIndex,
          }));
        }

        manifestIdByAssetId.set(textureAssetId, textureId);
        assetByAssetId.set(textureAssetId, new TextureCompressedAsset({
          assetId: textureAssetId,
          payload: await encodeTextures(width, height, layerPayloads),
          layerAssetIds: layerAssetIds,
          width: width,
          height: height,
        }));
      }
    }

    return [manifestIdByAssetId, assetByAssetId];
  }

  static async load (loader: AssetManifestLoader, configurationPath: string): Promise<Configuration> {
    const configurationBuffer = await loader.load(configurationPath);
    if (!configurationBuffer) {
      throw new Error('Unable to load configuration');
    }

    const configuration = JSON.parse(new TextDecoder('utf-8').decode(configurationBuffer)) as ConfigurationOptions;

    const manifests: Array<[AssetManifest<any, any, any>, AssetManifestContext]> = [];
    const missingManifestPaths = [];
    for (const assetManifestPath of (configuration.assets ?? [])) {
      const manifestBuffer = await loader.load(assetManifestPath);
      if (!manifestBuffer) {
        missingManifestPaths.push(assetManifestPath);
        continue;
      }

      const manifest = parseManifestJson(JSON.parse(new TextDecoder('utf-8').decode(manifestBuffer)));
      if (!manifest) {
        missingManifestPaths.push(assetManifestPath);
        continue;
      }

      const manifestContext = await manifest.load(loader.from(assetManifestPath));
      if (!manifestContext) {
        missingManifestPaths.push(assetManifestPath);
        continue;
      }

      manifests.push([manifest, manifestContext]);
    }

    return new Configuration(configuration.name, missingManifestPaths, manifests);
  }
}
