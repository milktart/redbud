module.exports = (sequelize, DataTypes) => {
  const CarRental = sequelize.define(
    'CarRental',
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
        comment: 'Immutable creator field - tracks who created this car_rental',
      },
      tripId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'trips',
          key: 'id',
        },
      },
      company: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      pickupLocation: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      pickupTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      dropoffLocation: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      dropoffTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      pickupLat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      pickupLng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      dropoffLat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      dropoffLng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      pickupDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      dropoffDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      confirmationNumber: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'car_rentals',
      timestamps: true,
    }
  );

  CarRental.associate = (models) => {
    CarRental.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });

    // Creator association
    CarRental.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator',
    });

    CarRental.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
    });

    CarRental.hasMany(models.VoucherAttachment, {
      foreignKey: 'itemId',
      as: 'voucherAttachments',
      scope: { itemType: 'car_rental' },
      constraints: false,
    });

    // Attendees association
    CarRental.hasMany(models.Attendee, {
      foreignKey: 'itemId',
      constraints: false,
      scope: {
        itemType: 'car_rental',
      },
      as: 'attendees',
      onDelete: 'CASCADE',
    });
  };

  return CarRental;
};
