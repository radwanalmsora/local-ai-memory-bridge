import { env, pipeline } from "@huggingface/transformers";
import { join } from "node:path";
import { HOME } from "./keystore.js";

/** Local multilingual embeddings (ONNX, int8). Downloaded once, cached locally. */
env.cacheDir = join(HOME, "models");
const MODEL = process.env.MEMORY_BRIDGE_MODEL ?? "Xenova/multilingual-e5-small";
export const DIM = 384;

let extractor: Promise<any> | null = null;
const load = () => (extractor ??= pipeline("feature-extraction", MODEL, { dtype: "q8" }));

async function embed(text: string): Promise<Float32Array> {
  const ex = await load();
  const out = await ex(text, { pooling: "mean", normalize: true });
  return Float32Array.from(out.data as Float32Array);
}

// E5 models REQUIRE these prefixes for good quality
export const embedPassage = (t: string) => embed("passage: " + t);
export const embedQuery = (t: string) => embed("query: " + t);
