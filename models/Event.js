module.exports = (sequelize, DataTypes) => {
  const Event = sequelize.define(
    'Event',
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
        comment: 'Immutable creator field - tracks who created this event',
      },
      tripId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'trips',
          key: 'id',
        },
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      startDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endDateTime: {
        type: DataTypes.DATE,
        allowNull: true, // Optional - defaults to same as startDateTime if not provided
      },
      location: {
        type: DataTypes.TEXT,
        allowNull: false, // Location is required for events
      },
      lat: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      lng: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      contactPhone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      contactEmail: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      eventUrl: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      isConfirmed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      startTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Timezone for start time (e.g., America/Los_Angeles)',
      },
      endTimezone: {
        type: DataTypes.STRING,
        allowNull: true,
        comment: 'Timezone for end time (e.g., America/Los_Angeles)',
      },
    },
    {
      tableName: 'events',
      timestamps: true,
    }
  );

  Event.associate = (models) => {
    Event.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });

    // Creator association
    Event.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator',
    });

    Event.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
    });

    Event.hasMany(models.VoucherAttachment, {
      foreignKey: 'itemId',
      as: 'voucherAttachments',
      scope: { itemType: 'event' },
      constraints: false,
    });

    // Attendees association
    Event.hasMany(models.Attendee, {
      foreignKey: 'itemId',
      constraints: false,
      scope: {
        itemType: 'event',
      },
      as: 'attendees',
      onDelete: 'CASCADE',
    });
  };

  return Event;
};
