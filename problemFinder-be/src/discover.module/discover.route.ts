import { Router } from "express";
import { validate } from "../middleware/validate.middleware";
import { discoverSchema } from "./discover.validator";
import { discoverController } from "./discover.controller";

const router = Router();

router.post("/", validate(discoverSchema), discoverController);

export default router;