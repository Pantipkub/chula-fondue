import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const CLOUDINARY_URL = process.env.CLOUDINARY_URL; // cloudinary://<api_key>:<api_secret>@<cloud_name>
const PUBLIC_URL = process.env.GATEWAY_PUBLIC_URL ?? `http://localhost:${process.env.GATEWAY_PORT ?? 3000}`;

/** Where photos go when CLOUDINARY_URL is not set; main.ts serves this folder at /uploads. */
export const UPLOADS_DIR = join(import.meta.dirname, '..', 'uploads');

/** Reads up to 5 files of at most 5 MB each from the multipart field "photos" into memory. */
export const PhotosInterceptor = FilesInterceptor('photos', MAX_PHOTOS, { limits: { fileSize: MAX_PHOTO_BYTES } });

export interface UploadedPhoto {
  buffer: Buffer;
  originalname: string;
}

// Decided from the file's first bytes, not from the name or content type the client claims.
function imageExtension(data: Buffer) {
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Validates the uploaded photos, stores them and returns one public link per photo. */
export async function storePhotos(files: UploadedPhoto[] | undefined): Promise<string[]> {
  if (!files?.length) throw new BadRequestException('At least one photo is required (form field "photos")');
  const photos = files.map((file) => {
    const extension = imageExtension(file.buffer);
    if (!extension) throw new BadRequestException(`${file.originalname} is not a JPEG, PNG or WebP image`);
    return { data: file.buffer, extension };
  });
  return Promise.all(photos.map(({ data, extension }) => (CLOUDINARY_URL ? uploadToCloudinary : saveLocally)(data, extension)));
}

// Signed upload to Cloudinary's REST API; the response carries the permanent link.
async function uploadToCloudinary(data: Buffer, extension: string) {
  const { username: apiKey, password: apiSecret, hostname: cloudName } = new URL(CLOUDINARY_URL!);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)]), `photo.${extension}`);
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp);
  form.append('signature', createHash('sha1').update(`timestamp=${timestamp}${apiSecret}`).digest('hex'));
  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: form });
  } catch {
    throw new BadGatewayException('Photo storage unreachable');
  }
  if (!response.ok) throw new BadGatewayException(`Photo storage returned ${response.status}`);
  return ((await response.json()) as { secure_url: string }).secure_url;
}

// ponytail: local-disk fallback so the system runs without a Cloudinary account; links only work on this machine.
async function saveLocally(data: Buffer, extension: string) {
  const name = `${randomUUID()}.${extension}`;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(join(UPLOADS_DIR, name), data);
  return `${PUBLIC_URL}/uploads/${name}`;
}
