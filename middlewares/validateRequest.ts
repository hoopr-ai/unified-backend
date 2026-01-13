import type { Request, Response, NextFunction } from "express";
import type { ObjectSchema } from "joi";

export const validateRequest = (schema: ObjectSchema) => {
    return (req: Request, res: Response, next: NextFunction) => {

        const { error, value } = schema.validate(req.body, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            return res.status(400).json({
                data: {},
                error: {
                    code: 1,
                    message: error.details.map(d => d.message).join(", ")
                }
            });
        }

        req.body = value;
        next();
    };
};
