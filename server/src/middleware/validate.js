// server/src/middleware/validate.js
// Simple validation middleware – checks that request body contains only allowed fields
// and that required fields are present. Returns 400 with a clear message.

function validate({ required = [], allowed = [] }) {
  return (req, res, next) => {
    const body = req.body || {};
    // Check required fields
    for (const field of required) {
      if (body[field] == null || body[field] === '') {
        return res.status(400).json({ error: `Field \"${field}\" is required.` });
      }
    }
    // Disallow unknown fields
    const extra = Object.keys(body).filter((k) => !allowed.includes(k));
    if (extra.length) {
      return res.status(400).json({ error: `Unexpected field(s): ${extra.join(', ')}` });
    }
    next();
  };
}

module.exports = { validate };

