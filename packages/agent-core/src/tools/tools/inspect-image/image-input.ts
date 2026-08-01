import { readFile, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type InspectedImageInput = {
  data: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sourceName: string;
  sizeBytes: number;
};

export class ImageInputError extends Error {
  constructor(
    public readonly code: "not_found" | "outside_boundary" | "not_file" | "too_large" | "unsupported_format",
    message: string,
  ) {
    super(message);
    this.name = "ImageInputError";
  }
}

export async function readAuthorizedImage(
  inputPath: string,
  workspaceRoot: string,
  options: { allowedImagePaths: string[]; artifactRoot?: string },
): Promise<InspectedImageInput> {
  const candidate = isAbsolute(inputPath) ? resolve(inputPath) : resolve(workspaceRoot, inputPath);
  let target: string;
  try {
    target = await realpath(candidate);
  } catch {
    throw new ImageInputError("not_found", "图片文件不存在或无法读取。");
  }

  const workspace = await resolveExistingRoot(workspaceRoot);
  const artifactRoot = options.artifactRoot ? await resolveExistingRoot(options.artifactRoot) : undefined;
  const allowedExact = new Set<string>();
  for (const path of options.allowedImagePaths) {
    try {
      allowedExact.add(await realpath(path));
    } catch {
      // Missing current-turn attachments remain unauthorized and fail as not found.
    }
  }

  if (
    !isWithinRoot(target, workspace) &&
    !(artifactRoot && isWithinRoot(target, artifactRoot)) &&
    !allowedExact.has(target)
  ) {
    throw new ImageInputError("outside_boundary", "图片路径不在允许范围内。");
  }

  const fileStat = await stat(target);
  if (!fileStat.isFile()) throw new ImageInputError("not_file", "图片路径不是普通文件。");
  if (fileStat.size > MAX_IMAGE_BYTES) {
    throw new ImageInputError("too_large", "图片超过 20 MiB 限制。");
  }

  const bytes = await readFile(target);
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageInputError("too_large", "图片超过 20 MiB 限制。");
  const mimeType = sniffImageType(bytes);
  if (!mimeType) {
    throw new ImageInputError("unsupported_format", "图片格式不受支持，仅支持 JPEG、PNG 和 WebP。");
  }
  return {
    data: bytes.toString("base64"),
    mimeType,
    sourceName: basename(target),
    sizeBytes: bytes.length,
  };
}

async function resolveExistingRoot(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

function isWithinRoot(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function sniffImageType(bytes: Buffer): InspectedImageInput["mimeType"] | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return undefined;
}
