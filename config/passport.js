const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { User } = require('../models');

module.exports = function (passport) {
  passport.use(
    new LocalStrategy({ usernameField: 'identifier' }, async (identifier, password, done) => {
      try {
        const normalized = identifier.toLowerCase().trim();

        // Look up by email or phone
        const user = await User.findOne({
          where: {
            [Op.or]: [
              { email: normalized },
              { phone: normalized },
            ],
          },
        });

        if (!user) {
          return done(null, false, { message: 'Account not found' });
        }

        if (user.isPhantom) {
          return done(null, false, { message: 'Account not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
          return done(null, false, { message: 'Incorrect password' });
        }

        return done(null, user);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findByPk(id);
      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
