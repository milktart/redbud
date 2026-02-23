module.exports = (sequelize, DataTypes) => {
  const Hotel = sequelize.define(
    'Hotel',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true,
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
        comment: 'Immutable creator field - tracks who created this hotel',
      },
      tripId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'trips',
          key: 'id',
        },
      },
      hotelName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      checkInDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      checkOutDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      lat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      lng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      confirmationNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      roomNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      checkInTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Timezone for check-in time (e.g., America/New_York)',
      },
      checkOutTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Timezone for check-out time (e.g., America/New_York)',
      },
    },
    {
      tableName: 'hotels',
      timestamps: true,
    }
  );

  Hotel.associate = (models) => {
    Hotel.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });

    // Creator association
    Hotel.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator',
    });

    Hotel.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
    });

    Hotel.hasMany(models.VoucherAttachment, {
      foreignKey: 'itemId',
      as: 'voucherAttachments',
      scope: { itemType: 'hotel' },
      constraints: false,
    });

    // Attendees association
    Hotel.hasMany(models.Attendee, {
      foreignKey: 'itemId',
      constraints: false,
      scope: {
        itemType: 'hotel',
      },
      as: 'attendees',
      onDelete: 'CASCADE',
    });
  };

  return Hotel;
};
