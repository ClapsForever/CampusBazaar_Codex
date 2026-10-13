import { fileIo } from '@kit.CoreFileKit';

export class UploadBytes {
  bytes: ArrayBuffer;
  mime: string;

  constructor(bytes: ArrayBuffer, mime: string) {
    this.bytes = bytes;
    this.mime = mime;
  }
}

export function readPhoto(uri: string): UploadBytes {
  const file: fileIo.File = fileIo.openSync(uri, fileIo.OpenMode.READ_ONLY);
  try {
    const size: number = fileIo.statSync(file.fd).size;
    if (size < 1 || size > 5_000_000) {
      throw new Error('单张图片必须小于 5 MB');
    }
    const bytes = new Uint8Array(size);
    let offset: number = 0;
    while (offset < size) {
      const chunk = new ArrayBuffer(Math.min(65536, size - offset));
      const count: number = fileIo.readSync(file.fd, chunk);
      if (count < 1) {
        throw new Error('照片读取不完整');
      }
      bytes.set(new Uint8Array(chunk, 0, count), offset);
      offset += count;
    }
    let mime: string = '';
    if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      mime = 'image/jpeg';
    } else if (bytes.length > 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
      mime = 'image/png';
    } else if (bytes.length > 12 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF' &&
      String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === 'WEBP') {
      mime = 'image/webp';
    }
    if (mime === '') {
      throw new Error('仅支持 JPEG、PNG 或 WebP 图片');
    }
    return new UploadBytes(bytes.buffer as ArrayBuffer, mime);
  } finally {
    fileIo.closeSync(file);
  }
}
