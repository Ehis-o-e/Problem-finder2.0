// test-parser.ts
import { parseQuery } from "../queryParser.module/queryParser.service";

async function test() {
  const result = await parseQuery("problems related with energy generation");
  console.log(result);
}

test();