module.exports = (sequelize, DataTypes) => {
  const VoucherAttachment = sequelize.define(
    'VoucherAttachment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      voucherId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'vouchers',
          key: 'id',
        },
      },
      itemId: {
        type: DataTypes.UUID,
        allowNull: false, // References Flight, Hotel, Event, CarRental, or Transportation
        comment: 'UUID of the travel item (Flight, Hotel, Event, CarRental, or Transportation)',
      },
      itemType: {
        type: DataTypes.ENUM('flight', 'hotel', 'event', 'car_rental', 'transportation'),
        allowNull: false, // Discriminator to know which table itemId references
        comment: 'Type of travel item this voucher is attached to',
      },
      // Legacy field for backward compatibility
      flightId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'flights',
          key: 'id',
        },
        comment: 'DEPRECATED: Use itemId and itemType instead. Kept for backward compatibility.',
      },
      travelerId: {
        type: DataTypes.UUID,
        allowNull: false, // References either a User or TravelCompanion
      },
      travelerType: {
        type: DataTypes.ENUM('USER', 'COMPANION'),
        allowNull: false, // Discriminator to know which table travelerId references
      },
      attachmentValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true, // Null for certificate types (upgrade, companion) that don't have monetary values
      },
      attachmentDate: {
        type: DataTypes.DATE,
        allowNull: true, // Date when voucher was actually redeemed
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true, // e.g., "Outbound leg only", "Confirmation #ABC123"
      },
    },
    {
      tableName: 'voucher_attachments',
      timestamps: true,
      indexes: [
        {
          fields: ['voucherId'],
        },
        {
          fields: ['flightId'],
        },
        {
          fields: ['travelerId', 'travelerType'],
        },
      ],
    }
  );

  VoucherAttachment.associate = (models) => {
    // Attachment belongs to a voucher
    VoucherAttachment.belongsTo(models.Voucher, {
      foreignKey: 'voucherId',
      as: 'voucher',
    });

    // Legacy association with Flight (kept for backward compatibility)
    VoucherAttachment.belongsTo(models.Flight, {
      foreignKey: 'flightId',
      as: 'flight',
    });

    // Polymorphic associations with travel items
    // Note: The actual item association is handled manually in controllers
    // based on itemType (flight, hotel, event, car_rental, transportation)
    // This approach is used because Sequelize doesn't natively support
    // polymorphic associations. We'll use a helper function to get the item.
  };

  return VoucherAttachment;
};
