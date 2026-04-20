// test-parser.ts
import { parseQuery } from "../queryParser.module/queryParser.service";

async function test() {
  const result = await parseQuery("I want to find problems with in architecture");
  console.log(result);
}

test();