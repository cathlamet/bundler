import { AssetManifestType } from "./asset-manifest";
import { FontManifest } from "./font-manifest";
import { MaterialManifest } from "./material-manifest";
import { ModelManifest } from "./model-manifest";
import { TextureManifest } from "./texture-manifest";


export interface AssetManifestLoader {
  from (filePath: string): AssetManifestLoader;
  load (filePath: string): Promise<Uint8Array>;
}

export function parseManifestJson (manifest: any) {
  switch (manifest?.type) {
    case AssetManifestType.font:
      return new FontManifest(manifest);
    case AssetManifestType.material:
      return new MaterialManifest(manifest);
    case AssetManifestType.model:
      return new ModelManifest(manifest);
    case AssetManifestType.texture:
      return new TextureManifest(manifest);
    default:
      return undefined;
  }
}
