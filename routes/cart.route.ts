import { Router } from "express";
import Joi from "joi";
import { authenticateWithSession } from "../middlewares/authenticate";
import { validateRequest } from "../middlewares/validateRequest";
import { getCart, addToCart, updateCart } from "../controllers/cart.controller";
import { CartType } from "../services/persistence-service/cart/schemas/cart.schema";

const router = Router();

const cartTypeValues = Object.values(CartType);

const addToCartSchema = Joi.object({
  skuId: Joi.string().required(),
  cartType: Joi.string().valid(...cartTypeValues).required(),
  qty: Joi.number().integer().min(1).required(),
});

const updateCartSchema = Joi.object({
  skuId: Joi.string().required(),
  cartType: Joi.string().valid(...cartTypeValues).required(),
  qty: Joi.number().integer().min(0).required(),
});

router.use(authenticateWithSession);

router.get("/", getCart);
router.post("/", validateRequest(addToCartSchema), addToCart);
router.put("/", validateRequest(updateCartSchema), updateCart);

export default router;
