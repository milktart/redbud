module.exports = (sequelize, DataTypes) => {
  const LoyaltyProgram = sequelize.define(
    'LoyaltyProgram',
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
      },
      programName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      memberNumber: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      category: {
        type: DataTypes.ENUM('airline', 'hotel', 'car_rental', 'other'),
        allowNull: false,
        defaultValue: 'other',
      },
      accountFirstName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      accountLastName: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'loyalty_programs',
      timestamps: true,
    }
  );

  LoyaltyProgram.associate = (models) => {
    LoyaltyProgram.belongsTo(models.User, {
      foreignKey: 'userId',
      onDelete: 'CASCADE',
    });
  };

  return LoyaltyProgram;
};
