module.exports = (sequelize, DataTypes) => {
  const Trip = sequelize.define(
    'Trip',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
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
        comment: 'Immutable creator field - tracks who created this trip',
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      departureDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      returnDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      defaultCompanionEditPermission: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      purpose: {
        type: DataTypes.ENUM(
          'business',
          'leisure',
          'family',
          'romantic',
          'adventure',
          'pleasure',
          'other'
        ),
        allowNull: false,
        defaultValue: 'leisure',
      },
      isConfirmed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: 'trips',
      timestamps: true,
    }
  );

  Trip.associate = (models) => {
    // Owner of the trip
    Trip.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });

    // Creator of the trip (immutable)
    Trip.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator',
    });

    Trip.hasMany(models.Flight, {
      foreignKey: 'tripId',
      as: 'flights',
      onDelete: 'CASCADE',
    });

    Trip.hasMany(models.Hotel, {
      foreignKey: 'tripId',
      as: 'hotels',
      onDelete: 'CASCADE',
    });

    Trip.hasMany(models.Transportation, {
      foreignKey: 'tripId',
      as: 'transportation',
      onDelete: 'CASCADE',
    });

    Trip.hasMany(models.CarRental, {
      foreignKey: 'tripId',
      as: 'carRentals',
      onDelete: 'CASCADE',
    });

    Trip.hasMany(models.Event, {
      foreignKey: 'tripId',
      as: 'events',
      onDelete: 'CASCADE',
    });

    // Attendees for this trip (polymorphic via itemType='trip')
    Trip.hasMany(models.Attendee, {
      foreignKey: 'itemId',
      constraints: false,
      scope: {
        itemType: 'trip',
      },
      as: 'attendees',
      onDelete: 'CASCADE',
    });
  };

  return Trip;
};
