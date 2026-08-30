export type StoredEncodingId =
  | "utf-8"
  | "utf-16le"
  | "utf-16be"
  | "gb18030"
  | "iso-8859-1"
  | "windows-1252";

export type EncodingChoiceId = "utf-16" | "gb18030" | "iso-8859-1" | "windows-1252";

export const ENCODING_LABELS: Record<StoredEncodingId, string> = {
  "utf-8": "UTF-8",
  "utf-16le": "UTF-16",
  "utf-16be": "UTF-16",
  gb18030: "GB 18030",
  "iso-8859-1": "ISO Latin 1",
  "windows-1252": "Windows Latin 1",
};

export const ENCODING_CHOICES: { id: EncodingChoiceId; label: string }[] = [
  { id: "utf-16", label: "UTF-16" },
  { id: "gb18030", label: "简体中文(GB 18030)" },
  { id: "iso-8859-1", label: "西欧(ISO Latin 1)" },
  { id: "windows-1252", label: "西欧(Windows Latin 1)" },
];

export type LineEnding = "lf" | "crlf" | "cr";
