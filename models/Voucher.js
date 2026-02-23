module.exports = (sequelize, DataTypes) => {
  const { MS_PER_DAY } = require('../utils/constants');

  const Voucher = sequelize.define(
    'Voucher',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: true, // Nullable for non-owner-bound vouchers (e.g., upgrade certificates)
        references: {
          model: 'users',
          key: 'id',
        },
      },
      type: {
        type: DataTypes.ENUM(
          'TRAVEL_CREDIT',
          'UPGRADE_CERT',
          'REGIONAL_UPGRADE_CERT',
          'GLOBAL_UPGRADE_CERT',
          'COMPANION_CERT',
          'GIFT_CARD',
          'MISC'
        ),
        allowNull: false,
      },
      issuer: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      voucherNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      associatedAccount: {
        type: DataTypes.STRING,
        allowNull: true, // e.g., frequent flyer number, loyalty account
      },
      pinCode: {
        type: DataTypes.STRING,
        allowNull: true, // Encrypted PIN code if applicable
      },
      currency: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'USD',
      },
      totalValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true, // Null for certificate types (upgrade, companion) that don't have monetary value
      },
      usedAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0, // Default to 0 when voucher is created (not used yet)
      },
      status: {
        type: DataTypes.ENUM(
          'OPEN',
          'PARTIALLY_USED',
          'USED',
          'EXPIRED',
          'TRANSFERRED',
          'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'OPEN',
      },
      expirationDate: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      parentVoucherId: {
        type: DataTypes.UUID,
        allowNull: true, // References parent voucher if this is a reissuance
        references: {
          model: 'vouchers',
          key: 'id',
        },
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'vouchers',
      timestamps: true,
      indexes: [
        {
          fields: ['userId'],
        },
        {
          fields: ['voucherNumber'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['expirationDate'],
        },
        {
          fields: ['parentVoucherId'],
        },
      ],
    }
  );

  Voucher.associate = (models) => {
    // Voucher belongs to a user (for owner-bound types)
    Voucher.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'owner',
      allowNull: true,
    });

    // One voucher can have many attachments to flights
    Voucher.hasMany(models.VoucherAttachment, {
      foreignKey: 'voucherId',
      as: 'attachments',
      onDelete: 'CASCADE',
    });

    // Self-referential relationship for tracking reissuances
    Voucher.belongsTo(models.Voucher, {
      foreignKey: 'parentVoucherId',
      as: 'parentVoucher',
      allowNull: true,
    });

    Voucher.hasMany(models.Voucher, {
      foreignKey: 'parentVoucherId',
      as: 'replacementVouchers',
    });
  };

  // Virtual field for remaining balance
  Voucher.prototype.getRemainingBalance = function () {
    // For certificate types (no monetary value), return null
    if (!this.totalValue) return null;

    // Calculate remaining balance (usedAmount defaults to 0 if null)
    const usedAmount = this.usedAmount || 0;
    return this.totalValue - usedAmount;
  };

  // Virtual field for days until expiration
  Voucher.prototype.getDaysUntilExpiration = function () {
    if (!this.expirationDate) return null;
    const today = new Date();
    const expDate = new Date(this.expirationDate);
    const diffTime = expDate - today;
    const diffDays = Math.ceil(diffTime / MS_PER_DAY);
    return diffDays;
  };

  // Check if voucher is expired
  Voucher.prototype.getIsExpired = function () {
    if (!this.expirationDate) return false;
    return new Date() > new Date(this.expirationDate);
  };

  return Voucher;
};
