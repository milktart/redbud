const jwt = require('jsonwebtoken');

const PUBLIC_KEY = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');

function extractToken(req) {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return req.headers.authorization.slice(7);
  }
  return req.cookies?.auth_token ?? null;
}

module.exports = {
  ensureAuthenticated(req, res, next) {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    try {
      const p = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
      req.user = {
        id: p.sub,
        email: p.email,
        phone: p.phone,
        firstName: p.firstName,
        lastName: p.lastName,
        isAdmin: p.isAdmin,
      };
      return next();
    } catch {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
  },

  requireAdmin(req, res, next) {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    try {
      const p = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
      if (!p.isAdmin) {
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }
      req.user = {
        id: p.sub,
        email: p.email,
        phone: p.phone,
        firstName: p.firstName,
        lastName: p.lastName,
        isAdmin: p.isAdmin,
      };
      return next();
    } catch {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
  },
};
