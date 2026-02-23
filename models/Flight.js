module.exports = (sequelize, DataTypes) => {
  const Flight = sequelize.define(
    'Flight',
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
        comment: 'Immutable creator field - tracks who created this flight',
      },
      tripId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'trips',
          key: 'id',
        },
      },
      airline: {
        type: DataTypes.STRING,
        allowNull: true, // Nullable until flight number to airline lookup is implemented
      },
      flightNumber: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      departureDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      arrivalDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      origin: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      originTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Timezone for origin airport (e.g., America/New_York)',
      },
      destination: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      destinationTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Timezone for destination airport (e.g., Europe/Amsterdam)',
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
      pnr: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      seat: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'flights',
      timestamps: true,
    }
  );

  Flight.associate = (models) => {
    Flight.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });

    // Creator of the flight (immutable)
    Flight.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator',
    });

    Flight.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
    });

    // Polymorphic association with VoucherAttachment
    // Note: Uses itemId/itemType for polymorphic relationship (not flightId)
    // Legacy flightId field in VoucherAttachment kept for backward compatibility
    Flight.hasMany(models.VoucherAttachment, {
      foreignKey: 'itemId',
      as: 'voucherAttachments',
      scope: { itemType: 'flight' },
      constraints: false,
    });

    // Attendees for this flight (polymorphic via itemType='flight')
    Flight.hasMany(models.Attendee, {
      foreignKey: 'itemId',
      constraints: false,
      scope: {
        itemType: 'flight',
      },
      as: 'attendees',
      onDelete: 'CASCADE',
    });
  };

  return Flight;
};
