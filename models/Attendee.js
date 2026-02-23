/**
 * Attendee Model
 *
 * Junction table linking users to trips and travel items (flights, hotels, etc.).
 * Supports polymorphic associations to different item types.
 *
 * Item Types:
 * - trip
 * - flight
 * - hotel
 * - event
 * - transportation
 * - car_rental
 *
 * Permission Levels:
 * - 'view': Can view the trip/item
 * - 'manage': Can view and edit the trip/item (cannot delete - only creator can delete)
 */

module.exports = (sequelize, DataTypes) => {
  const Attendee = sequelize.define(
    'Attendee',
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
        onDelete: 'CASCADE',
        comment: 'The attendee user',
      },
      itemType: {
        type: DataTypes.ENUM('trip', 'flight', 'hotel', 'event', 'transportation', 'car_rental'),
        allowNull: false,
        comment: 'Type of item this attendee is associated with',
      },
      itemId: {
        type: DataTypes.UUID,
        allowNull: false,
        comment: 'ID of the trip or travel item',
      },
      permissionLevel: {
        type: DataTypes.ENUM('view', 'manage'),
        allowNull: false,
        defaultValue: 'view',
        comment: 'Permission level for this specific trip/item',
      },
      addedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'User who added this attendee',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: 'attendees',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['userId', 'itemType', 'itemId'],
          name: 'attendees_user_item_unique',
        },
        {
          fields: ['itemType', 'itemId'],
          name: 'idx_attendees_item',
        },
        {
          fields: ['userId'],
          name: 'idx_attendees_user_id',
        },
        {
          fields: ['addedBy'],
          name: 'idx_attendees_added_by',
        },
      ],
    }
  );

  Attendee.associate = (models) => {
    // The attendee user
    Attendee.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId',
      onDelete: 'CASCADE',
    });

    // User who added this attendee
    Attendee.belongsTo(models.User, {
      as: 'addedByUser',
      foreignKey: 'addedBy',
      onDelete: 'CASCADE',
    });

    // Note: Polymorphic associations to Trip, Flight, Hotel, etc.
    // will be defined in those models using itemType/itemId
  };

  return Attendee;
};
