module.exports = (sequelize, DataTypes) => {
  const Transportation = sequelize.define(
    'Transportation',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true, // Temporarily nullable for migration
        references: {
          model: 'users',
          key: 'id',
        },
      },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        comment: 'Immutable creator field - tracks who created this transportation',
      },
      tripId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'trips',
          key: 'id',
        },
      },
      method: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      journeyNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      origin: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      originTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      destination: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      destinationTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      originLat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      originLng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      destinationLat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      destinationLng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      departureDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      arrivalDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      confirmationNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      seat: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'transportation',
      timestamps: true,
    }
  );

  Transportation.associate = (models) => {
    Transportation.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });

    // Creator association
    Transportation.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator',
    });

    Transportation.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
    });

    Transportation.hasMany(models.VoucherAttachment, {
      foreignKey: 'itemId',
      as: 'voucherAttachments',
      scope: { itemType: 'transportation' },
      constraints: false,
    });

    // Attendees association
    Transportation.hasMany(models.Attendee, {
      foreignKey: 'itemId',
      constraints: false,
      scope: {
        itemType: 'transportation',
      },
      as: 'attendees',
      onDelete: 'CASCADE',
    });
  };

  return Transportation;
};
