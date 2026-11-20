import { Builder } from "xml2js";

const builder = new Builder({ headless: true, rootName: "lfm" });

export function lfmResponse(status: "ok" | "failed", body: Record<string, unknown>) {
  return { $: { status }, ...body };
}

export function toXml(obj: Record<string, unknown>): string {
  return builder.buildObject(obj);
}

export function errorXml(code: number, message: string): string {
  return toXml(lfmResponse("failed", { error: { $: { code: String(code) }, _: message } }));
}
