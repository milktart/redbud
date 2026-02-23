const express = require('express');

const router = express.Router();
const passport = require('passport');
const authController = require('../../../controllers/authController');
const { ensureAuthenticated } = require('../../../middleware/auth');
const { validateRegistration, validateLogin } = require('../../../middleware/validation');

router.post('/login', validateLogin, (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || 'Invalid credentials',
      });
    }

    // Check if account is active (soft delete check)
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'This account has been deactivated. Contact support for assistance.',
      });
    }

    req.logIn(user, async (err) => {
      if (err) {
        return next(err);
      }

      // Update lastLogin timestamp
      try {
        await user.update({ lastLogin: new Date() });
      } catch (updateError) {
        // Log error but don't fail the login
        console.error('Error updating lastLogin:', updateError);
      }

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          isAdmin: user.isAdmin,
        },
      });
    });
  })(req, res, next);
});

router.post('/register', validateRegistration, authController.postRegister);

// Logout (requires authentication)
router.get('/logout', ensureAuthenticated, authController.logout);

// Session verification endpoint - returns 200 if session is valid, 401 if not
// Used by frontend to verify if a session cookie is still valid
router.get('/verify-session', (req, res) => {
  if (req.isAuthenticated()) {
    return res.json({
      authenticated: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        phone: req.user.phone,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        isAdmin: req.user.isAdmin,
      },
    });
  }

  // Session is not valid (cookie exists but session data is gone, or no cookie)
  res.status(401).json({
    authenticated: false,
    message: 'Session is not valid or has expired',
  });
});

module.exports = router;
