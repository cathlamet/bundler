declare module 'opentype.js' {
  export interface OpentypePathCommand {
    type: string;
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
  }

  export interface OpentypePath {
    commands: OpentypePathCommand[];
  }

  export interface OpentypeGlyph {
    unicode?: number;
    advanceWidth?: number;
    path: OpentypePath;
    getBoundingBox (): { x1: number; y1: number; x2: number; y2: number };
  }

  export interface OpentypeFont {
    glyphs: {
      length: number;
      get(index: number): OpentypeGlyph;
    };
    ascender?: number;
    descender?: number;
    lineGap?: number;
    unitsPerEm?: number;
  }

  export interface OpentypeAPI {
    load (url: string): Promise<OpentypeFont>;
    parse (buffer: ArrayBuffer | ArrayBufferLike | Buffer): OpentypeFont;
  }

  const opentype: OpentypeAPI;
  export default opentype;
}
