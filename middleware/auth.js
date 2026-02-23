module.exports = {
  ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    // Return 401 for API requests (frontend will handle redirect to login)
    return res.status(401).json({ success: false, message: 'Authentication required' });
  },

  requireAdmin(req, res, next) {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!req.user.isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    return next();
  },
};
