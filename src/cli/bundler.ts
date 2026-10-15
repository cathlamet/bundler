import { mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import * as zlib from 'zlib';

import { Configuration } from '../bundler/configuration';
import { AssetManifestLoader } from '../assets/manifest/asset-manifest-factory';
import { AssetRegistry } from '../bundler/asset-registry';
import { packBundle } from '../bundler/asset-bundler';


class FileAssetManfiestLoader implements AssetManifestLoader {
  rootPath: string;

  constructor (rootPath: string) {
    this.rootPath = rootPath;
  }

  from (filePath: string): AssetManifestLoader {
    return new FileAssetManfiestLoader(dirname(join(this.rootPath, filePath)));
  }

  async load (filePath: string): Promise<Uint8Array> {
    const buffer = await readFile(join(this.rootPath, filePath));
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
}

async function loadManifests (loader: AssetManifestLoader, configurationFile: string): Promise<Configuration> {
  console.log(`Loading configuration from ${configurationFile}`);
  const configuration = await Configuration.load(loader, configurationFile);

  console.log(`Loaded ${configuration.manifestById.size} manifests and ${configuration.contextById.size} contexts, with ${configuration.missingAssetPaths.length} missing`);
  return configuration;
}

function writeAssets (registry: AssetRegistry, outputDirectory: string): (configuration: Configuration) => Promise<void> {
  return async (configuration: Configuration) => {
    const [manifestIdByAssetId, assetByAssetId] = await configuration.compile(registry);

    const buffer: Uint8Array = packBundle(manifestIdByAssetId, assetByAssetId);
    console.log(`Bundled pack ${configuration.name} with raw size ${buffer.length} bytes`);

    const compressedBuffer = zlib.gzipSync(buffer, {
      level: zlib.constants.Z_BEST_COMPRESSION,
    });

    await writeFile(join(outputDirectory, `${configuration.name}.bin`), compressedBuffer);
    console.log(`Pack ${configuration.name} compressed and saved with size ${compressedBuffer.length} bytes`);
  };
}

console.log("\n===============================================================================\n");
console.log(" bundler.js\n");
console.log(" see README.md for more details");
console.log("\n===============================================================================\n");

const { values } = parseArgs({
  strict: true,
  options: {
    input: { type: 'string', short: 'i', default: './cathlamet.config.ts' },
    output: { type: 'string', short: 'o', default: 'dist' },
    dev: { type: 'boolean', short: 'd' },
  },
});

if (!values.input?.length || !values.output?.length) {
  throw new Error("Must provide input and output paths");
}

const root = process.cwd();
const configurationFile = join(root, values.input);
const targetDir = join(root, values.output);

const uniqueHash = values.dev ? 'dev' : crypto.randomUUID();
const targetWithVersion = join(targetDir, uniqueHash);

mkdirSync(targetWithVersion, { recursive: true });

console.log(`input: ${configurationFile}`);
console.log(`output: ${targetWithVersion}`);

console.log("\n-------------------------------------------------------------------------------\n");

const assetLoader = new FileAssetManfiestLoader(dirname(configurationFile));
const assetRegistry = new AssetRegistry();

Promise.resolve(loadManifests(assetLoader, configurationFile))
  .then(writeAssets(assetRegistry, targetWithVersion))
  .then(() => {
    console.log("\nFinished successfully, thank you for using bundler.js!");
  })
  .catch((error) => {
    console.log("Error during execution:");
    console.log(error);
    process.exit(1);
  });

