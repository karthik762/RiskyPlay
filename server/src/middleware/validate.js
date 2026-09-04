/**
 * Reusable request validation middleware using Zod.
 * Validates req.body, req.query, and req.params against provided Zod schemas.
 *
 * @param {Object} schemas
 * @param {import('zod').ZodTypeAny} [schemas.body] - Zod schema for req.body
 * @param {import('zod').ZodTypeAny} [schemas.query] - Zod schema for req.query
 * @param {import('zod').ZodTypeAny} [schemas.params] - Zod schema for req.params
 * @returns {import('express').RequestHandler}
 */
function validate(schemas = {}) {
  return async (req, res, next) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = validate;
