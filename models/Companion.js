/**
 * Companion Model
 *
 * Bidirectional user-to-user relationships with permission levels.
 * When User A adds User B as a companion:
 * - Record 1: userId=A, companionUserId=B, permissionLevel='view' (or specified level)
 * - Record 2: userId=B, companionUserId=A, permissionLevel='none' (reciprocal with no permission by default)
 *
 * Permission Levels:
 * - 'none': No permissions (default for reciprocal relationship)
 * - 'view': Can view all trips/items
 * - 'manage_all': Can view and edit all trips/items (but cannot delete - only creator can delete)
 */

module.exports = (sequelize, DataTypes) => {
  const Companion = sequelize.define(
    'Companion',
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
        comment: 'The user who owns this companion list',
      },
      companionUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        comment: 'The companion user',
      },
      permissionLevel: {
        type: DataTypes.ENUM('none', 'view', 'manage_all'),
        allowNull: false,
        defaultValue: 'none',
        comment: 'Permission level for companion to access user resources',
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
      tableName: 'companions',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['userId', 'companionUserId'],
          name: 'companions_user_companion_unique',
        },
        {
          fields: ['companionUserId'],
          name: 'idx_companions_companion_user_id',
        },
        {
          fields: ['userId', 'permissionLevel'],
          name: 'idx_companions_user_permission',
        },
      ],
    }
  );

  Companion.associate = (models) => {
    // User who owns this companion relationship
    Companion.belongsTo(models.User, {
      as: 'user',
      foreignKey: 'userId',
      onDelete: 'CASCADE',
    });

    // The companion user
    Companion.belongsTo(models.User, {
      as: 'companionUser',
      foreignKey: 'companionUserId',
      onDelete: 'CASCADE',
    });
  };

  return Companion;
};
