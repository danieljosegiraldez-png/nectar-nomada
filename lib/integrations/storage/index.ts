import { r2ObjectStorageProvider } from "./r2";
import type { ObjectStorageProvider } from "./types";

export const objectStorageProvider: ObjectStorageProvider = r2ObjectStorageProvider;
export type { ObjectStorageProvider, PutObjectInput, PutObjectResult } from "./types";
