/** Markdown media helpers for sourcards-import (skill package mirror). */

export const MEDIA_TOKEN_RE: RegExp;

export function extractMediaSrcs(markdown: string | null | undefined): string[];
export function isPublicHttpsMediaSrc(src: string | null | undefined): boolean;
export function isRemoteOrDataMediaSrc(src: string | null | undefined): boolean;
export function needsMediaUpload(src: string | null | undefined): boolean;
export function classifyMediaSrc(
  src: string | null | undefined,
): 'https' | 'http' | 'data' | 'root-relative' | 'local' | 'empty';
export function rewriteMediaSrc(
  markdown: string,
  fromSrc: string,
  toSrc: string,
): string;
export function rewriteMediaSrcMap(
  markdown: string,
  map: Map<string, string> | Record<string, string>,
): string;
export function extractPayloadMediaSrcs(payload: {
  cards?: Array<{ question?: string; answer?: string }>;
}): string[];
export function rewritePayloadMedia(
  payload: object,
  map: Map<string, string> | Record<string, string>,
): object;
