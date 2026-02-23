module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          isEmail: true,
        },
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      firstName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      lastName: {
        type: DataTypes.STRING(1),
        allowNull: false,
        validate: {
          len: {
            args: [1, 1],
            msg: 'Last initial must be exactly one character',
          },
        },
      },
      isAdmin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      lastLogin: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      },
      isPhantom: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
    },
    {
      tableName: 'users',
      timestamps: true,
    }
  );

  User.associate = (models) => {
    User.hasMany(models.Trip, {
      foreignKey: 'userId',
      as: 'trips',
      onDelete: 'CASCADE',
    });

    // Companion relationships where this user is the owner
    User.hasMany(models.Companion, {
      foreignKey: 'userId',
      as: 'companions',
      onDelete: 'CASCADE',
    });

    // Companion relationships where this user is the companion
    User.hasMany(models.Companion, {
      foreignKey: 'companionUserId',
      as: 'companionOf',
      onDelete: 'CASCADE',
    });

    // Vouchers owned by this user
    User.hasMany(models.Voucher, {
      foreignKey: 'userId',
      as: 'vouchers',
      onDelete: 'CASCADE',
    });

    // Attendee relationships
    User.hasMany(models.Attendee, {
      foreignKey: 'userId',
      as: 'attendees',
      onDelete: 'CASCADE',
    });
  };

  return User;
};
