// src/torii-client.ts

export class ToriiClient {
  constructor(private baseUrl: string) {}

  async query<T>(sql: string): Promise<T[]> {
    const url = `${this.baseUrl}?query=${encodeURIComponent(sql)}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Torii query failed: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T[]>;
  }

  static decodeHexString(hex: string): string {
    if (!hex || !hex.startsWith("0x")) return hex;
    const bytes = Buffer.from(hex.replace("0x", ""), "hex");
    return bytes.toString("utf8").replace(/\x00/g, "");
  }

  static worldSlugToToriiUrl(slug: string): string {
    return `https://api.cartridge.gg/x/${slug}/torii/sql`;
  }
}
