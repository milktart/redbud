module.exports = (sequelize, DataTypes) => {
  const Airport = sequelize.define(
    'Airport',
    {
      iata: {
        type: DataTypes.STRING(3),
        primaryKey: true,
        allowNull: false,
        comment: 'IATA 3-letter airport code',
      },
      icao: {
        type: DataTypes.STRING(4),
        comment: 'ICAO 4-letter airport code',
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Full airport name',
      },
      city: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'City where airport is located',
      },
      country: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Country where airport is located',
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 6),
        comment: 'Airport latitude coordinate',
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 6),
        comment: 'Airport longitude coordinate',
      },
      timezone: {
        type: DataTypes.STRING,
        comment: 'Airport timezone (e.g., America/New_York)',
      },
    },
    {
      tableName: 'airports',
      timestamps: false,
      indexes: [
        {
          name: 'idx_airports_iata',
          fields: ['iata'],
          unique: true,
        },
        {
          name: 'idx_airports_city',
          fields: ['city'],
        },
        {
          name: 'idx_airports_country',
          fields: ['country'],
        },
        {
          name: 'idx_airports_name',
          fields: ['name'],
        },
      ],
    }
  );

  return Airport;
};
