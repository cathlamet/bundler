import { Asset, AssetRecord, PACK_MAGIC_NUMBER, PACK_SCHEMA_VERSION } from '@cathlamet/library';


export function packBundle (manifestIdByAssetId: Map<number, string>, assetByAssetId: Map<number, Asset>): Uint8Array {
  const encoder = new TextEncoder();
  const manifestPayloadByAssetId: Map<number, Uint8Array> = new Map();
  const metadataByAssetId: Map<number, Uint8Array> = new Map();
  const payloadByAssetId: Map<number, Uint8Array> = new Map();

  const assetRecords = [];
  for (const [id, asset] of assetByAssetId.entries()) {
    const manifestId = manifestIdByAssetId.get(id);
    if (manifestId) {
      manifestPayloadByAssetId.set(asset.assetId, encoder.encode(manifestId));
      metadataByAssetId.set(asset.assetId, asset.encodeMetadata());
      payloadByAssetId.set(asset.assetId, asset.encodePayload());
      assetRecords.push(new AssetRecord(asset.assetId, asset.type));
    }
  }

  let bufferSize = 4 + 1 + 2 + assetRecords.length * AssetRecord.byteLength() + 2;
  for (const record of assetRecords) {
    bufferSize += (metadataByAssetId.get(record.assetId)?.length ?? 0);
    bufferSize += (payloadByAssetId.get(record.assetId)?.length ?? 0);
  }
  for (const encodedManifestId of manifestPayloadByAssetId.values()) {
    bufferSize += 4 + encodedManifestId.length;
  }

  const buffer = new Uint8Array(bufferSize);
  const bufferView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;

  bufferView.setUint32(offset, PACK_MAGIC_NUMBER, false);
  offset += 4;

  bufferView.setUint8(offset, PACK_SCHEMA_VERSION);
  offset += 1;

  bufferView.setUint16(offset, assetRecords.length, false);
  offset += 2;

  let offsetRecords = offset;
  // fill in records after populating all offsets
  offset += assetRecords.length * AssetRecord.byteLength();

  // populate record manifest identifiers (dynamic length strings)
  bufferView.setUint16(offset, manifestPayloadByAssetId.size, false);
  offset += 2;

  for (const [assetId, assetBuffer] of manifestPayloadByAssetId) {
    if (assetBuffer && assetBuffer?.length > 0) {
      bufferView.setUint16(offset, assetId, false);
      offset += 2;

      bufferView.setUint16(offset, assetBuffer.length, false);
      offset += 2;

      buffer.set(assetBuffer, offset);
      offset += assetBuffer.length;
    }
  }

  // populate metadata unique to each asset type
  for (const record of assetRecords) {
    const assetBuffer = metadataByAssetId.get(record.assetId);
    if (assetBuffer && assetBuffer?.length > 0) {
      record.offsetMetadata = offset;
      record.sizeMetadata = assetBuffer.length;

      buffer.set(assetBuffer, offset);
      offset += assetBuffer.length;
    }
  }

  // populate raw asset payload
  for (const record of assetRecords) {
    const assetBuffer = payloadByAssetId.get(record.assetId);
    if (assetBuffer && assetBuffer?.length > 0) {
      record.offsetPayload = offset;
      record.sizePayload = assetBuffer.length;

      buffer.set(assetBuffer, offset);
      offset += assetBuffer.length;
    }
  }

  // go back and populate directory
  for (const record of assetRecords) {
    bufferView.setUint16(offsetRecords, record.assetId, false);
    offsetRecords += 2;
    bufferView.setUint8(offsetRecords, record.type);
    offsetRecords += 1;

    bufferView.setUint32(offsetRecords, record.offsetMetadata, false);
    offsetRecords += 4;
    bufferView.setUint32(offsetRecords, record.sizeMetadata, false);
    offsetRecords += 4;

    bufferView.setUint32(offsetRecords, record.offsetPayload, false);
    offsetRecords += 4;
    bufferView.setUint32(offsetRecords, record.sizePayload, false);
    offsetRecords += 4;
  }

  return buffer;
}
