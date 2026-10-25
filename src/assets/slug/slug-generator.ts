import { type CodePoint } from '@cathlamet/library';

/**
 * Original version created as https://github.com/manthrax/JSlug
 */

export const TEXTURE_WIDTH = 4096;
export const SLUGGISH_HEADER_DATA = "SLUGGISH";
export const SLUGGISH_HEADER_LEN = 8;

interface Curve {
    first: boolean;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    x3: number;
    y3: number;
    texelIndex: number;
}

export interface SluggishData {
    codePoints: CodePoint[];
    curvesList: number[];
    bandOffsets: number[];
    curveOffsets: number[];

    ascender: number;
    descender: number;
    lineGap: number;
    unitsPerEm: number;
}

export interface SlugGeneratorParameters {
    fullRange?: boolean;
    whitelist?: number[] | null;
}

export class SlugGenerator {

    private bandCount: number;
    private fullRange: boolean;
    private whitelist: number[] | null;

    constructor (parameters: SlugGeneratorParameters = {}) {
        this.bandCount = 16;
        this.fullRange = parameters.fullRange !== undefined ? parameters.fullRange : false;
        this.whitelist = parameters.whitelist || null;
    }

    async generateFromBuffer (buffer: ArrayBufferLike): Promise<SluggishData> {
        const opentypeModule = await import('opentype.js');
        const opentype = opentypeModule.default || opentypeModule;
        if (!opentype) throw new Error("Unable to load opentype");
        const font = opentype.parse(buffer);
        return this.generate(font);
    }

    generate (font: any): SluggishData {
        let curvesTexData: number[] = [];
        let bandsTexBandOffsets: number[] = [];
        let bandsTexCurveOffsets: number[] = [];
        let codePointsData: CodePoint[] = [];

        for (let i = 0; i < font.glyphs.length; i++) {
            const glyph = font.glyphs.get(i);
            let cp = glyph.unicode;
            if (cp === undefined) {
                if (i === 0) cp = -1; // .notdef fallback glyph
                else continue;
            }

            if (!this.fullRange && i !== 0) {
                if (this.whitelist) {
                    if (!this.whitelist.includes(cp)) continue;
                } else if (cp < 32 || cp > 126) {
                    continue; // Default to basic printable ASCII only
                }
            }

            const path = glyph.path;
            const bbox = glyph.getBoundingBox();

            if (bbox.x1 === bbox.x2 || bbox.y1 === bbox.y2) {
                codePointsData.push({
                    codePoint: cp, width: 0, height: 0,
                    advanceWidth: Math.floor(glyph.advanceWidth || 0),
                    bearingX: 0, bearingY: 0, bandCount: 0,
                    bandDimX: 0, bandDimY: 0, bandsTexCoordX: 0, bandsTexCoordY: 0
                });
                continue;
            }

            const gx1 = bbox.x1, gy1 = bbox.y1, gx2 = bbox.x2, gy2 = bbox.y2;
            let curves: Curve[] | null = [];
            let currentX = 0, currentY = 0;
            let firstCurve = false;
            let startOfShapeX = 0, startOfShapeY = 0;

            // Renamed to cmdIdx to prevent shadowing the outer loop's 'i'
            for (let cmdIdx = 0; cmdIdx < path.commands.length; cmdIdx++) {
                const cmd = path.commands[cmdIdx];
                if (cmd.type === 'M') {
                    firstCurve = true;
                    currentX = (cmd.x || 0) - gx1;
                    currentY = (cmd.y || 0) - gy1;
                    startOfShapeX = currentX;
                    startOfShapeY = currentY;
                } else if (cmd.type === 'L') {
                    let nextX = (cmd.x || 0) - gx1;
                    let nextY = (cmd.y || 0) - gy1;
                    curves.push({
                        first: firstCurve, x1: currentX, y1: currentY,
                        x3: nextX, y3: nextY, x2: (currentX + nextX) / 2.0, y2: (currentY + nextY) / 2.0,
                        texelIndex: 0
                    });
                    firstCurve = false;
                    currentX = nextX; currentY = nextY;
                } else if (cmd.type === 'Q') {
                    let nextX = (cmd.x || 0) - gx1;
                    let nextY = (cmd.y || 0) - gy1;
                    curves.push({
                        first: firstCurve, x1: currentX, y1: currentY,
                        x2: (cmd.x1 || 0) - gx1, y2: (cmd.y1 || 0) - gy1,
                        x3: nextX, y3: nextY, texelIndex: 0
                    });
                    firstCurve = false;
                    currentX = nextX; currentY = nextY;
                } else if (cmd.type === 'C') {
                    let nextX = (cmd.x || 0) - gx1;
                    let nextY = (cmd.y || 0) - gy1;

                    let p0x = currentX, p0y = currentY;
                    let p1x = (cmd.x1 || 0) - gx1, p1y = (cmd.y1 || 0) - gy1;
                    let p2x = (cmd.x2 || 0) - gx1, p2y = (cmd.y2 || 0) - gy1;
                    let p3x = nextX, p3y = nextY;

                    // Subdivide the cubic Bezier curve into two quadratic Bezier curves
                    // using exact endpoint, midpoint, and tangent matching.

                    // c0 = lerp(p0, p1, 0.75) => 0.25*p0 + 0.75*p1
                    let c0x = p0x + 0.75 * (p1x - p0x);
                    let c0y = p0y + 0.75 * (p1y - p0y);

                    // c1 = lerp(p3, p2, 0.75) => 0.25*p3 + 0.75*p2
                    let c1x = p3x + 0.75 * (p2x - p3x);
                    let c1y = p3y + 0.75 * (p2y - p3y);

                    // m = lerp(c0, c1, 0.5) (This evaluates exactly to the midpoint of the cubic curve at t=0.5)
                    let mx = c0x + 0.5 * (c1x - c0x);
                    let my = c0y + 0.5 * (c1y - c0y);

                    // Push the first quadratic curve (from p0 to m)
                    curves.push({
                        first: firstCurve, x1: p0x, y1: p0y,
                        x2: c0x, y2: c0y,
                        x3: mx, y3: my,
                        texelIndex: 0
                    });

                    // Subsequent curves in the same subpath are not the "first" curve
                    firstCurve = false;

                    // Push the second quadratic curve (from m to p3)
                    curves.push({
                        first: false, x1: mx, y1: my,
                        x2: c1x, y2: c1y,
                        x3: p3x, y3: p3y,
                        texelIndex: 0
                    });

                    currentX = nextX; currentY = nextY;
                } else if (cmd.type === 'Z') {
                    if (currentX !== startOfShapeX || currentY !== startOfShapeY) {
                        curves.push({
                            first: firstCurve, x1: currentX, y1: currentY,
                            x3: startOfShapeX, y3: startOfShapeY,
                            x2: (currentX + startOfShapeX) / 2.0, y2: (currentY + startOfShapeY) / 2.0,
                            texelIndex: 0
                        });
                        firstCurve = false;
                    }
                    currentX = startOfShapeX; currentY = startOfShapeY;
                }
            }

            if (!curves || curves.length === 0) continue;

            for (let c of curves) {
                if ((c.x2 === c.x1 && c.y2 === c.y1) || (c.x2 === c.x3 && c.y2 === c.y3)) {
                    c.x2 = (c.x1 + c.x3) / 2.0;
                    c.y2 = (c.y1 + c.y3) / 2.0;
                }
            }

            const bandsTexelIndex = Math.floor(bandsTexBandOffsets.length / 2);

            for (let c of curves) {
                if (c.first && curvesTexData.length % 4 !== 0) {
                    const toAdd = 4 - (curvesTexData.length % 4);
                    for (let k = 0; k < toAdd; k++) curvesTexData.push(-1.0);
                }

                let texelCount = Math.floor(curvesTexData.length / 4);
                let col = texelCount % TEXTURE_WIDTH;
                const newRow = col === TEXTURE_WIDTH - 1;
                if (newRow) {
                    const toAdd = 8 - (curvesTexData.length % 4);
                    for (let k = 0; k < toAdd; k++) curvesTexData.push(-1.0);
                }

                if (c.first || newRow) {
                    c.texelIndex = Math.floor(curvesTexData.length / 4);
                    curvesTexData.push(c.x1, c.y1);
                } else {
                    c.texelIndex = Math.floor((Math.floor(curvesTexData.length / 2) - 1) / 2);
                }

                curvesTexData.push(c.x2, c.y2);
                curvesTexData.push(c.x3, c.y3);
            }

            const sizeX = 1 + (gx2 - gx1);
            const sizeY = 1 + (gy2 - gy1);
            let bCount = this.bandCount;
            if (sizeX < bCount || sizeY < bCount) {
                bCount = Math.floor(Math.min(sizeX, sizeY) / 2);
                if(bCount < 1) bCount = 1;
            }

            const bandDimY = Math.ceil(sizeY / bCount);
            let bandMinY = 0, bandMaxY = bandDimY;

            curves.sort((a, b) => Math.max(b.x1, b.x2, b.x3) - Math.max(a.x1, a.x2, a.x3));

            for (let b = 0; b < bCount; b++) {
                let bandTexelOffset = Math.floor(bandsTexCurveOffsets.length / 2);
                let curveCount = 0;

                for (let c of curves) {
                    if (c.y1 === c.y2 && c.y2 === c.y3) continue;
                    let curveMinY = Math.min(c.y1, c.y2, c.y3);
                    let curveMaxY = Math.max(c.y1, c.y2, c.y3);
                    if (curveMinY > bandMaxY || curveMaxY < bandMinY) continue;

                    let curveOffsetX = c.texelIndex % TEXTURE_WIDTH;
                    let curveOffsetY = Math.floor(c.texelIndex / TEXTURE_WIDTH);
                    bandsTexCurveOffsets.push(curveOffsetX, curveOffsetY);
                    curveCount++;
                }
                bandsTexBandOffsets.push(curveCount, bandTexelOffset);
                bandMinY += bandDimY;
                bandMaxY += bandDimY;
            }

            const bandDimX = Math.ceil(sizeX / bCount);
            let bandMinX = 0, bandMaxX = bandDimX;

            curves.sort((a, b) => Math.max(b.y1, b.y2, b.y3) - Math.max(a.y1, a.y2, a.y3));

            for (let b = 0; b < bCount; b++) {
                let bandTexelOffset = Math.floor(bandsTexCurveOffsets.length / 2);
                let curveCount = 0;

                for (let c of curves) {
                    if (c.x1 === c.x2 && c.x2 === c.x3) continue;
                    let curveMinX = Math.min(c.x1, c.x2, c.x3);
                    let curveMaxX = Math.max(c.x1, c.x2, c.x3);
                    if (curveMinX > bandMaxX || curveMaxX < bandMinX) continue;

                    let curveOffsetX = c.texelIndex % TEXTURE_WIDTH;
                    let curveOffsetY = Math.floor(c.texelIndex / TEXTURE_WIDTH);
                    bandsTexCurveOffsets.push(curveOffsetX, curveOffsetY);
                    curveCount++;
                }
                bandsTexBandOffsets.push(curveCount, bandTexelOffset);
                bandMinX += bandDimX;
                bandMaxX += bandDimX;
            }

            codePointsData.push({
                codePoint: cp,
                width: Math.floor(gx2 - gx1), height: Math.floor(gy2 - gy1),
                advanceWidth: Math.floor(glyph.advanceWidth || 0),
                bearingX: Math.floor(gx1), bearingY: Math.floor(gy1),
                bandCount: bCount, bandDimX: bandDimX, bandDimY: bandDimY,
                bandsTexCoordX: bandsTexelIndex % TEXTURE_WIDTH,
                bandsTexCoordY: Math.floor(bandsTexelIndex / TEXTURE_WIDTH)
            });
        }

        const bandHeaderTexels = Math.floor(bandsTexBandOffsets.length / 2);
        for (let i = 1; i < bandsTexBandOffsets.length; i += 2) {
            bandsTexBandOffsets[i] += bandHeaderTexels;
        }

        return {
            codePoints: codePointsData,
            curvesList: curvesTexData,
            bandOffsets: bandsTexBandOffsets,
            curveOffsets: bandsTexCurveOffsets,
            ascender: font.ascender || 0,
            descender: font.descender || 0,
            lineGap: font.lineGap || 0,
            unitsPerEm: font.unitsPerEm || 0,
        };
    }

    exportSluggish (generatedData: SluggishData): ArrayBuffer {
        const curvesTexels = Math.max(1, Math.ceil(generatedData.curvesList.length / 4));
        const curvesTexHeight = Math.max(1, Math.ceil(curvesTexels / TEXTURE_WIDTH));
        const curvesFloatArray = new Float32Array(TEXTURE_WIDTH * curvesTexHeight * 4);
        curvesFloatArray.fill(0);
        curvesFloatArray.set(generatedData.curvesList);

        const bandsTexels = Math.max(1, Math.floor(generatedData.bandOffsets.length / 2) + Math.floor(generatedData.curveOffsets.length / 2));
        const bandsTexHeight = Math.max(1, Math.ceil(bandsTexels / TEXTURE_WIDTH));
        const bandsUintArray = new Uint32Array(TEXTURE_WIDTH * bandsTexHeight * 2);
        bandsUintArray.set(generatedData.bandOffsets, 0);
        bandsUintArray.set(generatedData.curveOffsets, generatedData.bandOffsets.length);

        const curvesBytes = curvesFloatArray.byteLength;
        const bandsBytes = bandsUintArray.byteLength;

        const totalBytes = 8 + 2 + (generatedData.codePoints.length * 40) + 8 + curvesBytes + 8 + bandsBytes + 16;
        const buffer = new ArrayBuffer(totalBytes);
        const view = new DataView(buffer);
        let offset = 0;

        for (let i = 0; i < SLUGGISH_HEADER_LEN; i++) {
            view.setUint8(offset++, SLUGGISH_HEADER_DATA.charCodeAt(i));
        }

        view.setUint16(offset, generatedData.codePoints.length, true); offset += 2;

        for (let cp of generatedData.codePoints) {
            view.setUint32(offset, cp.codePoint, true); offset += 4;
            view.setUint32(offset, cp.width, true); offset += 4;
            view.setUint32(offset, cp.height, true); offset += 4;
            view.setUint32(offset, cp.advanceWidth, true); offset += 4;
            view.setInt32(offset, cp.bearingX, true); offset += 4;
            view.setInt32(offset, cp.bearingY, true); offset += 4;
            view.setUint32(offset, cp.bandCount, true); offset += 4;
            view.setUint32(offset, cp.bandDimX, true); offset += 4;
            view.setUint32(offset, cp.bandDimY, true); offset += 4;
            view.setUint16(offset, cp.bandsTexCoordX, true); offset += 2;
            view.setUint16(offset, cp.bandsTexCoordY, true); offset += 2;
        }

        view.setUint16(offset, TEXTURE_WIDTH, true); offset += 2;
        view.setUint16(offset, curvesTexHeight, true); offset += 2;
        view.setUint32(offset, curvesBytes, true); offset += 4;

        // Fixed: Passing correct byteOffset to safely map float array to Uint8Array view
        new Uint8Array(buffer, offset, curvesBytes).set(
            new Uint8Array(curvesFloatArray.buffer, curvesFloatArray.byteOffset, curvesFloatArray.byteLength)
        );
        offset += curvesBytes;

        view.setUint16(offset, TEXTURE_WIDTH, true); offset += 2;
        view.setUint16(offset, bandsTexHeight, true); offset += 2;
        view.setUint32(offset, bandsBytes, true); offset += 4;

        new Uint8Array(buffer, offset, bandsBytes).set(
            new Uint8Array(bandsUintArray.buffer, bandsUintArray.byteOffset, bandsUintArray.byteLength)
        );
        offset += bandsBytes;

        view.setInt32(offset, generatedData.ascender || 0, true); offset += 4;
        view.setInt32(offset, generatedData.descender || 0, true); offset += 4;
        view.setInt32(offset, generatedData.lineGap || 0, true); offset += 4;
        view.setInt32(offset, generatedData.unitsPerEm || 0, true); offset += 4;

        return buffer;
    }
}
