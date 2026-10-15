
export class AssetRegistry {
  lastAssetId: number = 0;
  assetIdById: Map<string, number> = new Map();

  assetId (id: string): number | undefined {
    return this.assetIdById.get(id);
  }

  register (id: string): number {
    if (this.assetIdById.has(id)) {
      throw new Error(`Asset ID ${id} is already registered`);
    }

    this.assetIdById.set(id, ++this.lastAssetId);
    return this.assetIdById.get(id) as number;
  }

}
