import { Router } from "express";
import { queryParserController } from "./queryParser.controller";
import { validate } from "../middleware/validate.middleware";
import { queryParserSchema } from "./queryParser.validator";

const router = Router();

router.post("/", validate(queryParserSchema), queryParserController);

export default router;